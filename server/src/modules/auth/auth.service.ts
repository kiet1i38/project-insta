import type { User } from "../../generated/prisma/client.js";
import {
  createRefreshTokenRecord,
  createUserRecord,
  findRefreshTokenRecordById,
  findUserByEmail,
  findUserById,
  findUserByIdentifier,
  findUserByUsername,
  rotateRefreshTokenRecord
} from "./auth.repository.js";
import {
  createEmailInUseError,
  createIdentifierInUseError,
  createInvalidCredentialsError,
  createInvalidSessionError,
  createUsernameInUseError
} from "./auth.errors.js";
import { issueAccessToken } from "./accessToken.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  issueRefreshToken,
  verifyRefreshToken,
  verifyRefreshTokenHash
} from "./refreshToken.js";

type RegisterUserInput = {
  displayName: string;
  email: string;
  password: string;
  username: string;
};

type LoginUserInput = {
  identifier: string;
  password: string;
};

type AuthSessionDto = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthUserDto;
};

type AuthUserDto = Pick<
  User,
  "createdAt" | "displayName" | "email" | "id" | "role" | "status" | "updatedAt" | "username"
>;

function toAuthUserDto(user: User): AuthUserDto {
  return {
    createdAt: user.createdAt,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    role: user.role,
    status: user.status,
    updatedAt: user.updatedAt,
    username: user.username
  };
}

function mapCreateUserError(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    throw createIdentifierInUseError();
  }

  throw error;
}

async function createAuthSession(user: User): Promise<AuthSessionDto> {
  const refreshTokenSession = await issueRefreshToken(user.id);

  await createRefreshTokenRecord({
    expiresAt: refreshTokenSession.expiresAt,
    tokenHash: refreshTokenSession.tokenHash,
    tokenId: refreshTokenSession.tokenId,
    userId: user.id
  });

  return {
    accessToken: await issueAccessToken(user),
    refreshToken: refreshTokenSession.token,
    refreshTokenExpiresAt: refreshTokenSession.expiresAt,
    user: toAuthUserDto(user)
  };
}

export async function registerUser(input: RegisterUserInput): Promise<AuthUserDto> {
  const existingEmailUser = await findUserByEmail(input.email);

  if (existingEmailUser) {
    throw createEmailInUseError();
  }

  const existingUsernameUser = await findUserByUsername(input.username);

  if (existingUsernameUser) {
    throw createUsernameInUseError();
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const user = await createUserRecord({
      displayName: input.displayName,
      email: input.email,
      passwordHash,
      username: input.username
    });

    return toAuthUserDto(user);
  } catch (error) {
    mapCreateUserError(error);
  }
}

export async function loginUser(input: LoginUserInput): Promise<AuthSessionDto> {
  const user = await findUserByIdentifier(input.identifier);

  if (!user) {
    throw createInvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches || user.status !== "ACTIVE") {
    throw createInvalidCredentialsError();
  }

  return createAuthSession(user);
}

export async function refreshUserSession(
  providedRefreshToken: string | null
): Promise<AuthSessionDto> {
  if (!providedRefreshToken) {
    throw createInvalidSessionError();
  }

  let verifiedToken;

  try {
    verifiedToken = await verifyRefreshToken(providedRefreshToken);
  } catch {
    throw createInvalidSessionError();
  }

  const storedToken = await findRefreshTokenRecordById(verifiedToken.tokenId);

  if (
    !storedToken ||
    storedToken.userId !== verifiedToken.userId ||
    storedToken.revokedAt !== null ||
    storedToken.expiresAt.getTime() <= Date.now() ||
    !verifyRefreshTokenHash(providedRefreshToken, storedToken.tokenHash)
  ) {
    throw createInvalidSessionError();
  }

  const user = await findUserById(storedToken.userId);

  if (!user || user.status !== "ACTIVE") {
    throw createInvalidSessionError();
  }

  const nextRefreshToken = await issueRefreshToken(user.id);
  const rotated = await rotateRefreshTokenRecord(storedToken.id, {
    expiresAt: nextRefreshToken.expiresAt,
    tokenHash: nextRefreshToken.tokenHash,
    tokenId: nextRefreshToken.tokenId,
    userId: user.id
  });

  if (!rotated) {
    throw createInvalidSessionError();
  }

  return {
    accessToken: await issueAccessToken(user),
    refreshToken: nextRefreshToken.token,
    refreshTokenExpiresAt: nextRefreshToken.expiresAt,
    user: toAuthUserDto(user)
  };
}

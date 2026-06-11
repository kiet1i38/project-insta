import type { User } from "../../generated/prisma/client.js";
import {
  createUserRecord,
  findUserByEmail,
  findUserByIdentifier,
  findUserByUsername
} from "./auth.repository.js";
import {
  createEmailInUseError,
  createIdentifierInUseError,
  createInvalidCredentialsError,
  createUsernameInUseError
} from "./auth.errors.js";
import { issueAccessToken } from "./accessToken.js";
import { hashPassword, verifyPassword } from "./password.js";

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

export async function loginUser(input: LoginUserInput): Promise<{
  accessToken: string;
  user: AuthUserDto;
}> {
  const user = await findUserByIdentifier(input.identifier);

  if (!user) {
    throw createInvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches || user.status !== "ACTIVE") {
    throw createInvalidCredentialsError();
  }

  return {
    accessToken: await issueAccessToken(user),
    user: toAuthUserDto(user)
  };
}

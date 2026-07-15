import { createHash, createHmac, randomBytes } from "node:crypto";
import type { User } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import {
  MailDeliveryError,
  mailService,
  type MailService
} from "../mail/mail.service.js";
import {
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  createAuthActionAttemptIfAllowed,
  createEmailVerificationDeliveryFailureAuditLog,
  createEmailVerificationToken,
  createPendingUserWithEmailVerificationToken,
  createPasswordResetDeliveryFailureAuditLog,
  createPasswordResetToken,
  createRefreshTokenRecord,
  findRefreshTokenRecordById,
  findUserByEmail,
  findUserById,
  findUserByIdentifier,
  findUserByUsername,
  revokeRefreshTokenFamily,
  revokeRefreshTokenRecord,
  rotateRefreshTokenRecord
} from "./auth.repository.js";
import {
  createEmailInUseError,
  createEmailVerificationInvalidOrExpiredError,
  createEmailVerificationRateLimitedError,
  createIdentifierInUseError,
  createInvalidCredentialsError,
  createInvalidSessionError,
  createPasswordResetInvalidOrExpiredError,
  createPasswordResetRateLimitedError,
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

type EmailVerificationRequestInput = {
  email: string;
};

type EmailVerificationConfirmInput = {
  token: string;
};

type PasswordResetRequestInput = {
  email: string;
};

type PasswordResetConfirmInput = {
  password: string;
  token: string;
};

export type AuthRequestContext = {
  ipAddress: string;
  requestId: string;
  userAgent: string | null;
};

type AuthSessionDto = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthUserDto;
};

type AuthUserDto = Pick<
  User,
  | "createdAt"
  | "displayName"
  | "email"
  | "emailVerifiedAt"
  | "id"
  | "role"
  | "status"
  | "updatedAt"
  | "username"
>;

export const EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_MAX = 10;
export const EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_MAX = 3;
export const EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_CONFIRM_RATE_LIMIT_MAX = 10;
export const PASSWORD_RESET_REQUEST_RATE_LIMIT_MAX = 3;
export const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_REQUEST_MIN_DURATION_MS = 100;

function toAuthUserDto(user: User): AuthUserDto {
  return {
    createdAt: user.createdAt,
    displayName: user.displayName,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    id: user.id,
    role: user.role,
    status: user.status,
    updatedAt: user.updatedAt,
    username: user.username
  };
}

function issueActionToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashActionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRateLimitFingerprint(value: string): string {
  return createHmac("sha256", env.ACCOUNT_ACTION_RATE_LIMIT_SECRET)
    .update(value)
    .digest("hex");
}

function createEmailVerificationUrl(token: string): string {
  const url = new URL("/verify-email", env.PUBLIC_APP_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

function createPasswordResetUrl(token: string): string {
  const url = new URL("/reset-password", env.PUBLIC_APP_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function applyPasswordResetRequestTimingFloor(
  startedAt: number
): Promise<void> {
  const remaining = PASSWORD_RESET_REQUEST_MIN_DURATION_MS - (Date.now() - startedAt);

  if (remaining > 0) {
    await wait(remaining);
  }
}

async function sendEmailVerificationMessage(input: {
  context: AuthRequestContext;
  mail: MailService;
  token: string;
  user: User;
}): Promise<void> {
  const verificationUrl = createEmailVerificationUrl(input.token);

  try {
    await input.mail.sendMail({
      html: `<p>Confirm your CloneInsta email address.</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
      subject: "Verify your CloneInsta email",
      text: `Confirm your CloneInsta email address: ${verificationUrl}\n\nThis link expires in 24 hours.`,
      to: input.user.email
    });
  } catch (error) {
    if (!(error instanceof MailDeliveryError)) {
      throw error;
    }

    await createEmailVerificationDeliveryFailureAuditLog({
      ...input.context,
      userId: input.user.id
    });
  }
}

async function sendPasswordResetMessage(input: {
  context: AuthRequestContext;
  mail: MailService;
  token: string;
  user: User;
}): Promise<void> {
  const passwordResetUrl = createPasswordResetUrl(input.token);

  try {
    await input.mail.sendMail({
      html: `<p>Reset your CloneInsta password.</p><p><a href="${passwordResetUrl}">Reset password</a></p><p>This link expires in 60 minutes.</p>`,
      subject: "Reset your CloneInsta password",
      text: `Reset your CloneInsta password: ${passwordResetUrl}\n\nThis link expires in 60 minutes.`,
      to: input.user.email
    });
  } catch (error) {
    if (!(error instanceof MailDeliveryError)) {
      throw error;
    }

    await createPasswordResetDeliveryFailureAuditLog({
      ...input.context,
      userId: input.user.id
    });
  }
}

async function assertEmailVerificationRequestIsAllowed(
  email: string,
  context: AuthRequestContext
): Promise<void> {
  const allowed = await createAuthActionAttemptIfAllowed({
    emailHash: createRateLimitFingerprint(email),
    ipHash: createRateLimitFingerprint(context.ipAddress),
    maxAttempts: EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_MAX,
    type: "EMAIL_VERIFICATION_REQUEST",
    windowStartedAt: new Date(
      Date.now() - EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS
    )
  });

  if (!allowed) {
    throw createEmailVerificationRateLimitedError();
  }
}

async function assertEmailVerificationConfirmIsAllowed(
  context: AuthRequestContext
): Promise<void> {
  const allowed = await createAuthActionAttemptIfAllowed({
    ipHash: createRateLimitFingerprint(context.ipAddress),
    maxAttempts: EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_MAX,
    type: "EMAIL_VERIFICATION_CONFIRM",
    windowStartedAt: new Date(
      Date.now() - EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS
    )
  });

  if (!allowed) {
    throw createEmailVerificationRateLimitedError();
  }
}

async function assertPasswordResetRequestIsAllowed(
  email: string,
  context: AuthRequestContext
): Promise<void> {
  const allowed = await createAuthActionAttemptIfAllowed({
    emailHash: createRateLimitFingerprint(email),
    ipHash: createRateLimitFingerprint(context.ipAddress),
    maxAttempts: PASSWORD_RESET_REQUEST_RATE_LIMIT_MAX,
    type: "PASSWORD_RESET_REQUEST",
    windowStartedAt: new Date(Date.now() - PASSWORD_RESET_RATE_LIMIT_WINDOW_MS)
  });

  if (!allowed) {
    throw createPasswordResetRateLimitedError();
  }
}

async function assertPasswordResetConfirmIsAllowed(
  context: AuthRequestContext
): Promise<void> {
  const allowed = await createAuthActionAttemptIfAllowed({
    ipHash: createRateLimitFingerprint(context.ipAddress),
    maxAttempts: PASSWORD_RESET_CONFIRM_RATE_LIMIT_MAX,
    type: "PASSWORD_RESET_CONFIRM",
    windowStartedAt: new Date(Date.now() - PASSWORD_RESET_RATE_LIMIT_WINDOW_MS)
  });

  if (!allowed) {
    throw createPasswordResetRateLimitedError();
  }
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
    familyId: refreshTokenSession.tokenId,
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

export async function registerUser(
  input: RegisterUserInput,
  context: AuthRequestContext,
  mail: MailService = mailService
): Promise<AuthUserDto> {
  const existingEmailUser = await findUserByEmail(input.email);

  if (existingEmailUser) {
    throw createEmailInUseError();
  }

  const existingUsernameUser = await findUserByUsername(input.username);

  if (existingUsernameUser) {
    throw createUsernameInUseError();
  }

  const passwordHash = await hashPassword(input.password);
  const token = issueActionToken();

  try {
    const user = await createPendingUserWithEmailVerificationToken({
      ...context,
      displayName: input.displayName,
      email: input.email,
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
      passwordHash,
      tokenHash: hashActionToken(token),
      username: input.username
    });

    await sendEmailVerificationMessage({
      context,
      mail,
      token,
      user
    });

    return toAuthUserDto(user);
  } catch (error) {
    mapCreateUserError(error);
  }
}

export async function requestEmailVerification(
  input: EmailVerificationRequestInput,
  context: AuthRequestContext,
  mail: MailService = mailService
): Promise<void> {
  await assertEmailVerificationRequestIsAllowed(input.email, context);

  const user = await findUserByEmail(input.email);

  if (!user || user.status !== "PENDING_VERIFICATION") {
    return;
  }

  const token = issueActionToken();

  await createEmailVerificationToken({
    ...context,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
    tokenHash: hashActionToken(token),
    userId: user.id
  });

  await sendEmailVerificationMessage({
    context,
    mail,
    token,
    user
  });
}

export async function confirmEmailVerification(
  input: EmailVerificationConfirmInput,
  context: AuthRequestContext
): Promise<AuthUserDto> {
  await assertEmailVerificationConfirmIsAllowed(context);

  const user = await consumeEmailVerificationToken({
    ...context,
    tokenHash: hashActionToken(input.token)
  });

  if (!user) {
    throw createEmailVerificationInvalidOrExpiredError();
  }

  return toAuthUserDto(user);
}

export async function requestPasswordReset(
  input: PasswordResetRequestInput,
  context: AuthRequestContext,
  mail: MailService = mailService
): Promise<void> {
  const startedAt = Date.now();

  try {
    await assertPasswordResetRequestIsAllowed(input.email, context);

    const user = await findUserByEmail(input.email);

    if (!user || user.status !== "ACTIVE") {
      return;
    }

    const token = issueActionToken();

    await createPasswordResetToken({
      ...context,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      tokenHash: hashActionToken(token),
      userId: user.id
    });

    await sendPasswordResetMessage({
      context,
      mail,
      token,
      user
    });
  } finally {
    await applyPasswordResetRequestTimingFloor(startedAt);
  }
}

export async function confirmPasswordReset(
  input: PasswordResetConfirmInput,
  context: AuthRequestContext
): Promise<void> {
  await assertPasswordResetConfirmIsAllowed(context);

  const completed = await consumePasswordResetToken({
    ...context,
    passwordHash: await hashPassword(input.password),
    tokenHash: hashActionToken(input.token)
  });

  if (!completed) {
    throw createPasswordResetInvalidOrExpiredError();
  }
}

export async function loginUser(
  input: LoginUserInput
): Promise<AuthSessionDto> {
  const user = await findUserByIdentifier(input.identifier);

  if (!user) {
    throw createInvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(
    input.password,
    user.passwordHash
  );

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

  if (!storedToken || storedToken.userId !== verifiedToken.userId) {
    throw createInvalidSessionError();
  }

  if (!verifyRefreshTokenHash(providedRefreshToken, storedToken.tokenHash)) {
    throw createInvalidSessionError();
  }

  if (storedToken.revokedAt !== null) {
    await revokeRefreshTokenFamily(storedToken.familyId);
    throw createInvalidSessionError();
  }

  if (storedToken.expiresAt.getTime() <= Date.now()) {
    throw createInvalidSessionError();
  }

  const user = await findUserById(storedToken.userId);

  if (!user || user.status !== "ACTIVE") {
    throw createInvalidSessionError();
  }

  const nextRefreshToken = await issueRefreshToken(user.id);
  const rotated = await rotateRefreshTokenRecord(storedToken.id, {
    expiresAt: nextRefreshToken.expiresAt,
    familyId: storedToken.familyId,
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

export async function logoutUserSession(
  providedRefreshToken: string | null
): Promise<void> {
  if (!providedRefreshToken) {
    return;
  }

  let verifiedToken;

  try {
    verifiedToken = await verifyRefreshToken(providedRefreshToken);
  } catch {
    return;
  }

  const storedToken = await findRefreshTokenRecordById(verifiedToken.tokenId);

  if (
    !storedToken ||
    storedToken.userId !== verifiedToken.userId ||
    storedToken.revokedAt !== null ||
    storedToken.expiresAt.getTime() <= Date.now() ||
    !verifyRefreshTokenHash(providedRefreshToken, storedToken.tokenHash)
  ) {
    return;
  }

  await revokeRefreshTokenRecord(storedToken.id);
}

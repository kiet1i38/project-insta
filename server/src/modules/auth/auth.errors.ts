import { AppError } from "../../lib/appError.js";

export const AUTH_INVALID_CREDENTIALS_CODE = "AUTH_INVALID_CREDENTIALS";
export const AUTH_INVALID_CREDENTIALS_MESSAGE = "Invalid credentials.";
export const AUTH_CSRF_INVALID_CODE = "AUTH_CSRF_INVALID";
export const AUTH_CSRF_INVALID_MESSAGE = "Invalid CSRF token.";
export const AUTH_FORBIDDEN_CODE = "AUTH_FORBIDDEN";
export const AUTH_FORBIDDEN_MESSAGE = "Forbidden.";
export const AUTH_EMAIL_IN_USE_CODE = "AUTH_EMAIL_IN_USE";
export const AUTH_EMAIL_IN_USE_MESSAGE = "Email is already in use.";
export const AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED_CODE =
  "AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED";
export const AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED_MESSAGE =
  "This verification link is invalid or expired.";
export const AUTH_EMAIL_VERIFICATION_RATE_LIMITED_CODE =
  "AUTH_EMAIL_VERIFICATION_RATE_LIMITED";
export const AUTH_EMAIL_VERIFICATION_RATE_LIMITED_MESSAGE =
  "Too many verification attempts. Please try again later.";
export const AUTH_IDENTIFIER_IN_USE_CODE = "AUTH_IDENTIFIER_IN_USE";
export const AUTH_IDENTIFIER_IN_USE_MESSAGE =
  "Email or username is already in use.";
export const AUTH_INVALID_SESSION_CODE = "AUTH_INVALID_SESSION";
export const AUTH_INVALID_SESSION_MESSAGE = "Invalid session.";
export const AUTH_ORIGIN_FORBIDDEN_CODE = "AUTH_ORIGIN_FORBIDDEN";
export const AUTH_ORIGIN_FORBIDDEN_MESSAGE = "Origin is not allowed.";
export const AUTH_UNAUTHORIZED_CODE = "AUTH_UNAUTHORIZED";
export const AUTH_UNAUTHORIZED_MESSAGE = "Authentication required.";
export const AUTH_USERNAME_IN_USE_CODE = "AUTH_USERNAME_IN_USE";
export const AUTH_USERNAME_IN_USE_MESSAGE = "Username is already in use.";

export function createInvalidCredentialsError(): AppError {
  return new AppError(
    401,
    AUTH_INVALID_CREDENTIALS_CODE,
    AUTH_INVALID_CREDENTIALS_MESSAGE
  );
}

export function createCsrfInvalidError(): AppError {
  return new AppError(403, AUTH_CSRF_INVALID_CODE, AUTH_CSRF_INVALID_MESSAGE);
}

export function createForbiddenError(): AppError {
  return new AppError(403, AUTH_FORBIDDEN_CODE, AUTH_FORBIDDEN_MESSAGE);
}

export function createEmailInUseError(): AppError {
  return new AppError(409, AUTH_EMAIL_IN_USE_CODE, AUTH_EMAIL_IN_USE_MESSAGE);
}

export function createEmailVerificationInvalidOrExpiredError(): AppError {
  return new AppError(
    400,
    AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED_CODE,
    AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED_MESSAGE
  );
}

export function createEmailVerificationRateLimitedError(): AppError {
  return new AppError(
    429,
    AUTH_EMAIL_VERIFICATION_RATE_LIMITED_CODE,
    AUTH_EMAIL_VERIFICATION_RATE_LIMITED_MESSAGE
  );
}

export function createUsernameInUseError(): AppError {
  return new AppError(
    409,
    AUTH_USERNAME_IN_USE_CODE,
    AUTH_USERNAME_IN_USE_MESSAGE
  );
}

export function createIdentifierInUseError(): AppError {
  return new AppError(
    409,
    AUTH_IDENTIFIER_IN_USE_CODE,
    AUTH_IDENTIFIER_IN_USE_MESSAGE
  );
}

export function createInvalidSessionError(): AppError {
  return new AppError(
    401,
    AUTH_INVALID_SESSION_CODE,
    AUTH_INVALID_SESSION_MESSAGE
  );
}

export function createOriginForbiddenError(): AppError {
  return new AppError(
    403,
    AUTH_ORIGIN_FORBIDDEN_CODE,
    AUTH_ORIGIN_FORBIDDEN_MESSAGE
  );
}

export function createUnauthorizedError(): AppError {
  return new AppError(401, AUTH_UNAUTHORIZED_CODE, AUTH_UNAUTHORIZED_MESSAGE);
}

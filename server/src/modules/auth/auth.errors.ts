import { AppError } from "../../lib/appError.js";

export const AUTH_INVALID_CREDENTIALS_CODE = "AUTH_INVALID_CREDENTIALS";
export const AUTH_INVALID_CREDENTIALS_MESSAGE = "Invalid credentials.";
export const AUTH_EMAIL_IN_USE_CODE = "AUTH_EMAIL_IN_USE";
export const AUTH_EMAIL_IN_USE_MESSAGE = "Email is already in use.";
export const AUTH_IDENTIFIER_IN_USE_CODE = "AUTH_IDENTIFIER_IN_USE";
export const AUTH_IDENTIFIER_IN_USE_MESSAGE = "Email or username is already in use.";
export const AUTH_INVALID_SESSION_CODE = "AUTH_INVALID_SESSION";
export const AUTH_INVALID_SESSION_MESSAGE = "Invalid session.";
export const AUTH_USERNAME_IN_USE_CODE = "AUTH_USERNAME_IN_USE";
export const AUTH_USERNAME_IN_USE_MESSAGE = "Username is already in use.";

export function createInvalidCredentialsError(): AppError {
  return new AppError(
    401,
    AUTH_INVALID_CREDENTIALS_CODE,
    AUTH_INVALID_CREDENTIALS_MESSAGE
  );
}

export function createEmailInUseError(): AppError {
  return new AppError(409, AUTH_EMAIL_IN_USE_CODE, AUTH_EMAIL_IN_USE_MESSAGE);
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

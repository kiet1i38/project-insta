import type { RequestHandler } from "express";
import {
  emailVerificationConfirmSchema,
  emailVerificationRequestSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema
} from "./auth.schema.js";
import {
  clearCsrfTokenCookie,
  issueCsrfToken,
  setCsrfTokenCookie
} from "./csrfToken.js";
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie
} from "./refreshToken.js";
import {
  confirmEmailVerification,
  loginUser,
  logoutUserSession,
  confirmPasswordReset,
  requestPasswordReset,
  requestEmailVerification,
  refreshUserSession,
  registerUser
} from "./auth.service.js";

function toValidationDetails(
  issues: Array<{ message: string; path: PropertyKey[] }>
) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

function getRequestContext(req: Parameters<RequestHandler>[0]) {
  const userAgentHeader = req.headers["user-agent"];
  const userAgent = Array.isArray(userAgentHeader)
    ? userAgentHeader[0]
    : userAgentHeader;

  return {
    ipAddress: (req.ip ?? "").slice(0, 45),
    requestId: req.requestId,
    userAgent: userAgent ? userAgent.slice(0, 512) : null
  };
}

export const registerController: RequestHandler = async (req, res, next) => {
  const parsedBody = registerSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    const user = await registerUser(parsedBody.data, getRequestContext(req));

    res.status(201).json({
      requestId: req.requestId,
      user
    });
  } catch (error) {
    next(error);
  }
};

export const requestEmailVerificationController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedBody = emailVerificationRequestSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    await requestEmailVerification(parsedBody.data, getRequestContext(req));

    res.status(202).json({
      message:
        "If an unverified account matches that email, it may receive a verification email shortly.",
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const confirmEmailVerificationController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedBody = emailVerificationConfirmSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    const user = await confirmEmailVerification(
      parsedBody.data,
      getRequestContext(req)
    );

    res.status(200).json({
      requestId: req.requestId,
      user
    });
  } catch (error) {
    next(error);
  }
};

export const requestPasswordResetController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedBody = passwordResetRequestSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    await requestPasswordReset(parsedBody.data, getRequestContext(req));

    res.status(202).json({
      message:
        "If an active account matches that email, it may receive password reset instructions shortly.",
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const confirmPasswordResetController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedBody = passwordResetConfirmSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    await confirmPasswordReset(parsedBody.data, getRequestContext(req));

    res.status(200).json({
      message: "Password reset successfully. Please sign in again.",
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const loginController: RequestHandler = async (req, res, next) => {
  const parsedBody = loginSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    const result = await loginUser(parsedBody.data);

    setRefreshTokenCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt
    );
    setCsrfTokenCookie(res, issueCsrfToken(), result.refreshTokenExpiresAt);

    res.status(200).json({
      accessToken: result.accessToken,
      requestId: req.requestId,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
};

export const refreshController: RequestHandler = async (req, res, next) => {
  try {
    const refreshToken = readRefreshTokenCookie(req.headers.cookie);
    const result = await refreshUserSession(refreshToken);

    setRefreshTokenCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt
    );
    setCsrfTokenCookie(res, issueCsrfToken(), result.refreshTokenExpiresAt);

    res.status(200).json({
      accessToken: result.accessToken,
      requestId: req.requestId,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
};

export const logoutController: RequestHandler = async (req, res, next) => {
  try {
    const refreshToken = readRefreshTokenCookie(req.headers.cookie);
    await logoutUserSession(refreshToken);
    clearCsrfTokenCookie(res);
    clearRefreshTokenCookie(res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

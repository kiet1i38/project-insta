import type { RequestHandler } from "express";
import { env } from "../../config/env.js";
import {
  createCsrfInvalidError,
  createOriginForbiddenError
} from "./auth.errors.js";
import { readCsrfTokenCookie } from "./csrfToken.js";

const authCorsAllowHeaders = ["Content-Type", "Authorization", "X-CSRF-Token"].join(
  ", "
);
const authCorsAllowMethods = ["DELETE", "GET", "PATCH", "POST", "OPTIONS"].join(
  ", "
);

function getRequestOrigin(headers: {
  origin?: string | string[];
  referer?: string | string[];
}): string | null {
  const originHeader = Array.isArray(headers.origin)
    ? headers.origin[0]
    : headers.origin;

  if (originHeader) {
    return originHeader;
  }

  const refererHeader = Array.isArray(headers.referer)
    ? headers.referer[0]
    : headers.referer;

  if (!refererHeader) {
    return null;
  }

  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

function setAllowedAuthCorsHeaders(
  res: Parameters<RequestHandler>[1],
  origin: string
): void {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", authCorsAllowHeaders);
  res.setHeader("Access-Control-Allow-Methods", authCorsAllowMethods);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.vary("Origin");
}

export const applyAuthSecurityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
};

export const applyAuthCors: RequestHandler = (req, res, next) => {
  const requestOrigin = getRequestOrigin(req.headers);

  if (!requestOrigin) {
    next();
    return;
  }

  if (requestOrigin !== env.CLIENT_ORIGIN) {
    next(createOriginForbiddenError());
    return;
  }

  setAllowedAuthCorsHeaders(res, requestOrigin);
  next();
};

export const handleAuthCorsPreflight: RequestHandler = (req, res, next) => {
  const requestOrigin = getRequestOrigin(req.headers);

  if (!requestOrigin || requestOrigin !== env.CLIENT_ORIGIN) {
    next(createOriginForbiddenError());
    return;
  }

  setAllowedAuthCorsHeaders(res, requestOrigin);
  res.status(204).send();
};

export const requireCsrfProtection: RequestHandler = (req, _res, next) => {
  const requestOrigin = getRequestOrigin(req.headers);

  if (!requestOrigin || requestOrigin !== env.CLIENT_ORIGIN) {
    next(createOriginForbiddenError());
    return;
  }

  const csrfCookie = readCsrfTokenCookie(req.headers.cookie);
  const csrfHeaderValue = Array.isArray(req.headers["x-csrf-token"])
    ? req.headers["x-csrf-token"][0]
    : req.headers["x-csrf-token"];

  if (!csrfCookie || !csrfHeaderValue || csrfCookie !== csrfHeaderValue) {
    next(createCsrfInvalidError());
    return;
  }

  next();
};

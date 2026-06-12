import type { UserRole } from "../../generated/prisma/client.js";
import type { RequestHandler } from "express";
import {
  createForbiddenError,
  createUnauthorizedError
} from "./auth.errors.js";
import { findUserById } from "./auth.repository.js";
import { verifyAccessToken } from "./accessToken.js";

function readBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const accessToken = readBearerToken(req.headers.authorization);

    if (!accessToken) {
      throw createUnauthorizedError();
    }

    let verifiedToken;

    try {
      verifiedToken = await verifyAccessToken(accessToken);
    } catch {
      throw createUnauthorizedError();
    }

    const user = await findUserById(verifiedToken.userId);

    if (!user) {
      throw createUnauthorizedError();
    }

    if (user.status !== "ACTIVE") {
      throw createForbiddenError();
    }

    req.authUser = {
      id: user.id,
      role: user.role,
      status: user.status,
      username: user.username
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(requiredRole: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.authUser) {
      next(createUnauthorizedError());
      return;
    }

    if (req.authUser.role !== requiredRole) {
      next(createForbiddenError());
      return;
    }

    next();
  };
}

export const requireAdminRole = requireRole("ADMIN");

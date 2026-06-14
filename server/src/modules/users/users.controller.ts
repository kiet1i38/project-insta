import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import {
  userRouteParamsSchema,
  searchUsersQuerySchema,
  updateOwnProfileSchema
} from "./users.schema.js";
import {
  followUser,
  getOwnProfile,
  searchUsers,
  unfollowUser,
  updateOwnProfile
} from "./users.service.js";

function toValidationDetails(issues: Array<{ message: string; path: PropertyKey[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

export const getOwnProfileController: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const profile = await getOwnProfile(req.authUser.id);

    res.status(200).json({
      profile,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const searchUsersController: RequestHandler = async (req, res, next) => {
  const parsedQuery = searchUsersQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedQuery.error.issues),
        message: "Invalid query string."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const result = await searchUsers(parsedQuery.data);

    res.status(200).json({
      pageInfo: result.pageInfo,
      requestId: req.requestId,
      users: result.users
    });
  } catch (error) {
    next(error);
  }
};

export const updateOwnProfileController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedBody = updateOwnProfileSchema.safeParse(req.body);

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
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const profile = await updateOwnProfile(req.authUser.id, parsedBody.data);

    res.status(200).json({
      profile,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

function parseUserRouteParams(rawUserId: string | string[] | undefined) {
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

  return userRouteParamsSchema.safeParse({ userId });
}

export const followUserController: RequestHandler = async (req, res, next) => {
  const parsedParams = parseUserRouteParams(req.params.userId);

  if (!parsedParams.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedParams.error.issues),
        message: "Invalid route parameters."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const result = await followUser({
      targetUserId: parsedParams.data.userId,
      viewerId: req.authUser.id
    });

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const unfollowUserController: RequestHandler = async (req, res, next) => {
  const parsedParams = parseUserRouteParams(req.params.userId);

  if (!parsedParams.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedParams.error.issues),
        message: "Invalid route parameters."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const result = await unfollowUser({
      targetUserId: parsedParams.data.userId,
      viewerId: req.authUser.id
    });

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import { updateOwnProfileSchema } from "./users.schema.js";
import { getOwnProfile, updateOwnProfile } from "./users.service.js";

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

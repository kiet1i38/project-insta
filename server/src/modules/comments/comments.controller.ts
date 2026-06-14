import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import {
  commentRouteParamsSchema,
  createCommentBodySchema,
  postCommentRouteParamsSchema
} from "./comments.schema.js";
import { createComment, deleteComment } from "./comments.service.js";

function toValidationDetails(issues: Array<{ message: string; path: PropertyKey[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

function parsePostRouteParams(rawPostId: string | string[] | undefined) {
  const postId = Array.isArray(rawPostId) ? rawPostId[0] : rawPostId;

  return postCommentRouteParamsSchema.safeParse({ postId });
}

function parseCommentRouteParams(rawCommentId: string | string[] | undefined) {
  const commentId = Array.isArray(rawCommentId) ? rawCommentId[0] : rawCommentId;

  return commentRouteParamsSchema.safeParse({ commentId });
}

export const createCommentController: RequestHandler = async (req, res, next) => {
  const parsedParams = parsePostRouteParams(req.params.postId);
  const parsedBody = createCommentBodySchema.safeParse(req.body);

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

    const comment = await createComment({
      actorId: req.authUser.id,
      content: parsedBody.data.content,
      postId: parsedParams.data.postId
    });

    res.status(201).json({
      comment,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCommentController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedParams = parseCommentRouteParams(req.params.commentId);

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

    const deletedCommentId = await deleteComment({
      actor: {
        id: req.authUser.id,
        role: req.authUser.role
      },
      commentId: parsedParams.data.commentId
    });

    res.status(200).json({
      deletedCommentId,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

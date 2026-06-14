import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import {
  createPostBodySchema,
  getFeedQuerySchema,
  postRouteParamsSchema
} from "./posts.schema.js";
import {
  createPost,
  deletePost,
  getFeed,
  getOwnVisiblePosts,
  likePost,
  unlikePost
} from "./posts.service.js";

function toValidationDetails(issues: Array<{ message: string; path: PropertyKey[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

export const createPostController: RequestHandler = async (req, res, next) => {
  const parsedBody = createPostBodySchema.safeParse(req.body);
  if (!parsedBody.success || !req.file) {
    const validationDetails = parsedBody.success
      ? []
      : toValidationDetails(parsedBody.error.issues);

    if (!req.file) {
      validationDetails.push({
        message: "Image file is required.",
        path: "image"
      });
    }

    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: validationDetails,
        message: "Invalid multipart form data."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const parsedBodyData = parsedBody.data;
    const uploadedFile = req.file;

    const post = await createPost({
      authorId: req.authUser.id,
      caption: parsedBodyData.caption,
      image: {
        buffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
        originalName: uploadedFile.originalname
      }
    });

    res.status(201).json({
      post,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const getOwnPostsController: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const posts = await getOwnVisiblePosts(req.authUser.id);

    res.status(200).json({
      posts,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const getFeedController: RequestHandler = async (req, res, next) => {
  const parsedQuery = getFeedQuerySchema.safeParse(req.query);

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

    const result = await getFeed({
      cursor: parsedQuery.data.cursor,
      limit: parsedQuery.data.limit,
      viewerId: req.authUser.id
    });

    res.status(200).json({
      pageInfo: result.pageInfo,
      posts: result.posts,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

function parsePostRouteParams(rawPostId: string | string[] | undefined) {
  const postId = Array.isArray(rawPostId) ? rawPostId[0] : rawPostId;

  return postRouteParamsSchema.safeParse({ postId });
}

export const likePostController: RequestHandler = async (req, res, next) => {
  const parsedParams = parsePostRouteParams(req.params.postId);

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

    const result = await likePost({
      actorId: req.authUser.id,
      postId: parsedParams.data.postId
    });

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const unlikePostController: RequestHandler = async (req, res, next) => {
  const parsedParams = parsePostRouteParams(req.params.postId);

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

    const result = await unlikePost({
      actorId: req.authUser.id,
      postId: parsedParams.data.postId
    });

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const deletePostController: RequestHandler = async (req, res, next) => {
  const parsedParams = parsePostRouteParams(req.params.postId);

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

    const deletedPostId = await deletePost({
      actor: {
        id: req.authUser.id,
        role: req.authUser.role
      },
      postId: parsedParams.data.postId
    });

    res.status(200).json({
      deletedPostId,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

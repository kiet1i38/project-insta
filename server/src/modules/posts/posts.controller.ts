import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import { createPostBodySchema } from "./posts.schema.js";
import { createPost } from "./posts.service.js";

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

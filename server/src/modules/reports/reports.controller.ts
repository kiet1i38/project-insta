import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import { createReportBodySchema } from "./reports.schema.js";
import { createReport } from "./reports.service.js";

function toValidationDetails(issues: Array<{ message: string; path: PropertyKey[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

export const createReportController: RequestHandler = async (req, res, next) => {
  const parsedBody = createReportBodySchema.safeParse(req.body);

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

    const report = await createReport({
      reason: parsedBody.data.reason,
      reportedCommentId: parsedBody.data.reportedCommentId,
      reportedPostId: parsedBody.data.reportedPostId,
      reportedUserId: parsedBody.data.reportedUserId,
      reporterId: req.authUser.id
    });

    res.status(201).json({
      report,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

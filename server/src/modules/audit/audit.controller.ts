import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import { getAuditLogs } from "./audit.service.js";
import { listAuditLogsQuerySchema } from "./audit.schema.js";

function toValidationDetails(issues: Array<{ message: string; path: PropertyKey[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

function assertActorContext(req: Parameters<RequestHandler>[0]) {
  if (!req.authUser) {
    throw createUnauthorizedError();
  }
}

export const getAuditLogsController: RequestHandler = async (req, res, next) => {
  const parsedQuery = listAuditLogsQuerySchema.safeParse(req.query);

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
    assertActorContext(req);

    const result = await getAuditLogs(parsedQuery.data);

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

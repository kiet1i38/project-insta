import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import {
  destructiveModerationActionBodySchema,
  dismissModerationReportBodySchema,
  listModerationReportsQuerySchema,
  moderationReportRouteParamsSchema
} from "./moderation.schema.js";
import {
  banModerationReportTargetUser,
  dismissModerationReport,
  getModerationReports,
  hideModerationReportTarget
} from "./moderation.service.js";

function toValidationDetails(issues: Array<{ message: string; path: PropertyKey[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

function parseReportRouteParams(rawReportId: string | string[] | undefined) {
  const reportId = Array.isArray(rawReportId) ? rawReportId[0] : rawReportId;

  return moderationReportRouteParamsSchema.safeParse({ reportId });
}

function buildActorContext(req: Parameters<RequestHandler>[0]) {
  if (!req.authUser) {
    throw createUnauthorizedError();
  }

  return {
    adminId: req.authUser.id,
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null
  };
}

export const getModerationReportsController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedQuery = listModerationReportsQuerySchema.safeParse(req.query);

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
    buildActorContext(req);

    const result = await getModerationReports(parsedQuery.data);

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const dismissModerationReportController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedParams = parseReportRouteParams(req.params.reportId);

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

  const parsedBody = dismissModerationReportBodySchema.safeParse(req.body);

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
    const actorContext = buildActorContext(req);
    const result = await dismissModerationReport({
      ...actorContext,
      note: parsedBody.data.note,
      reportId: parsedParams.data.reportId
    });

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const hideModerationReportTargetController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedParams = parseReportRouteParams(req.params.reportId);

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

  const parsedBody = destructiveModerationActionBodySchema.safeParse(req.body);

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
    const actorContext = buildActorContext(req);
    const result = await hideModerationReportTarget({
      ...actorContext,
      note: parsedBody.data.note,
      reportId: parsedParams.data.reportId
    });

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const banModerationReportTargetUserController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedParams = parseReportRouteParams(req.params.reportId);

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

  const parsedBody = destructiveModerationActionBodySchema.safeParse(req.body);

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
    const actorContext = buildActorContext(req);
    const result = await banModerationReportTargetUser({
      ...actorContext,
      note: parsedBody.data.note,
      reportId: parsedParams.data.reportId
    });

    res.status(200).json({
      ...result,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

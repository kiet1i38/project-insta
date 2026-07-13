import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/appError.js";
import { findActiveCommentById } from "../comments/comments.repository.js";
import { findActivePostById } from "../posts/posts.repository.js";
import { findActiveUserById } from "../users/users.repository.js";
import {
  countRecentReportsByReporter,
  createReportWithAuditRecord,
  findPendingReportByReporterAndTarget,
  type ReportRecord
} from "./reports.repository.js";
import type { CreateReportBodyInput } from "./reports.schema.js";

const REPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const REPORT_RATE_LIMIT_MAX = 5;

type ReportDto = {
  createdAt: Date;
  id: string;
  reason: string;
  reportedCommentId: string | null;
  reportedPostId: string | null;
  reportedUserId: string | null;
  reporterId: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
};

type ReportTargetIdentity = {
  reportedCommentId: string | null;
  reportedPostId: string | null;
  reportedUserId: string | null;
};

type ReportAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

function createReportAlreadyExistsError(): AppError {
  return new AppError(
    409,
    "REPORT_ALREADY_EXISTS",
    "You already have a pending report for this target."
  );
}

function createReportRateLimitedError(): AppError {
  return new AppError(
    429,
    "REPORT_RATE_LIMITED",
    "Too many reports submitted recently. Please try again later."
  );
}

function createReportTargetNotFoundError(): AppError {
  return new AppError(
    404,
    "REPORT_TARGET_NOT_FOUND",
    "Report target not found."
  );
}

function toReportDto(report: ReportRecord): ReportDto {
  return {
    createdAt: report.createdAt,
    id: report.id,
    reason: report.reason,
    reportedCommentId: report.reportedCommentId,
    reportedPostId: report.reportedPostId,
    reportedUserId: report.reportedUserId,
    reporterId: report.reporterId,
    status: report.status
  };
}

function toReportAuditMetadata(input: {
  reason: CreateReportBodyInput["reason"];
  target: ReportTargetIdentity;
}): Prisma.InputJsonObject {
  if (input.target.reportedPostId) {
    return {
      reason: input.reason,
      targetEntityId: input.target.reportedPostId,
      targetEntityType: "POST"
    };
  }

  if (input.target.reportedCommentId) {
    return {
      reason: input.reason,
      targetEntityId: input.target.reportedCommentId,
      targetEntityType: "COMMENT"
    };
  }

  if (input.target.reportedUserId) {
    return {
      reason: input.reason,
      targetEntityId: input.target.reportedUserId,
      targetEntityType: "USER"
    };
  }

  throw createReportTargetNotFoundError();
}

async function resolveReportTarget(
  input: Pick<
    CreateReportBodyInput,
    "reportedCommentId" | "reportedPostId" | "reportedUserId"
  >
): Promise<ReportTargetIdentity> {
  if (input.reportedPostId) {
    const existingPost = await findActivePostById(input.reportedPostId);

    if (!existingPost) {
      throw createReportTargetNotFoundError();
    }

    return {
      reportedCommentId: null,
      reportedPostId: existingPost.id,
      reportedUserId: null
    };
  }

  if (input.reportedCommentId) {
    const existingComment = await findActiveCommentById(
      input.reportedCommentId
    );

    if (!existingComment) {
      throw createReportTargetNotFoundError();
    }

    return {
      reportedCommentId: existingComment.id,
      reportedPostId: null,
      reportedUserId: null
    };
  }

  if (input.reportedUserId) {
    const existingUser = await findActiveUserById(input.reportedUserId);

    if (!existingUser) {
      throw createReportTargetNotFoundError();
    }

    return {
      reportedCommentId: null,
      reportedPostId: null,
      reportedUserId: existingUser.id
    };
  }

  throw createReportTargetNotFoundError();
}

export async function createReport(input: {
  auditContext: ReportAuditContext;
  reason: CreateReportBodyInput["reason"];
  reporterId: string;
  reportedCommentId?: string | null;
  reportedPostId?: string | null;
  reportedUserId?: string | null;
}): Promise<ReportDto> {
  const target = await resolveReportTarget({
    reportedCommentId: input.reportedCommentId,
    reportedPostId: input.reportedPostId,
    reportedUserId: input.reportedUserId
  });

  const existingPendingReport = await findPendingReportByReporterAndTarget({
    reporterId: input.reporterId,
    ...target
  });

  if (existingPendingReport) {
    throw createReportAlreadyExistsError();
  }

  const recentReportCount = await countRecentReportsByReporter({
    createdAfter: new Date(Date.now() - REPORT_RATE_LIMIT_WINDOW_MS),
    reporterId: input.reporterId
  });

  if (recentReportCount >= REPORT_RATE_LIMIT_MAX) {
    throw createReportRateLimitedError();
  }

  const createdReport = await createReportWithAuditRecord({
    actorMetadata: toReportAuditMetadata({
      reason: input.reason,
      target
    }),
    ipAddress: input.auditContext.ipAddress,
    reason: input.reason,
    reporterId: input.reporterId,
    ...target,
    userAgent: input.auditContext.userAgent
  });

  return toReportDto(createdReport);
}

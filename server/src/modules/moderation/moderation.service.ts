import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../lib/appError.js";
import {
  banReportedUser,
  claimModerationReport,
  countActiveAdmins,
  countPendingModerationReports,
  countResolvedModerationReports,
  createAuditLogRecord,
  createModerationActionRecord,
  findModerationReportById,
  hideReportedComment,
  hideReportedPost,
  listModerationReports,
  type ModerationActionRecord,
  type ModerationReportRecord
} from "./moderation.repository.js";
import type { ListModerationReportsQueryInput } from "./moderation.schema.js";

type ModerationReportDto = {
  createdAt: Date;
  id: string;
  reason: string;
  reporter: {
    id: string;
    username: string;
  };
  resolvedAt: Date | null;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  target: {
    comment: {
      author: {
        id: string;
        username: string;
      };
      content: string;
      id: string;
      isHidden: boolean;
      postId: string;
    } | null;
    post: {
      author: {
        id: string;
        username: string;
      };
      caption: string | null;
      id: string;
      imageUrl: string;
      isHidden: boolean;
    } | null;
    type: "COMMENT" | "POST" | "USER";
    user: {
      displayName: string | null;
      id: string;
      status: "ACTIVE" | "BANNED";
      username: string;
    } | null;
  };
};

type ModerationQueueResultDto = {
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
  reports: ModerationReportDto[];
  summary: {
    pendingCount: number;
    resolvedCount: number;
  };
};

type ModerationActionResultDto = {
  moderationAction: {
    action: string;
    createdAt: Date;
    id: string;
    note: string | null;
  };
  report: {
    id: string;
    resolvedAt: Date;
    status: "DISMISSED" | "RESOLVED";
  };
};

function createModerationReportNotFoundError(): AppError {
  return new AppError(404, "MODERATION_REPORT_NOT_FOUND", "Report not found.");
}

function createModerationAlreadyHandledError(): AppError {
  return new AppError(
    409,
    "MODERATION_REPORT_ALREADY_HANDLED",
    "Report is no longer pending moderation."
  );
}

function createModerationActionNotAllowedError(): AppError {
  return new AppError(
    409,
    "MODERATION_ACTION_NOT_ALLOWED",
    "This moderation action is not allowed for the current report target."
  );
}

function createModerationSelfBanForbiddenError(): AppError {
  return new AppError(
    409,
    "MODERATION_SELF_BAN_FORBIDDEN",
    "Admins cannot ban their own account."
  );
}

function createModerationLastAdminBanForbiddenError(): AppError {
  return new AppError(
    409,
    "MODERATION_LAST_ADMIN_BAN_FORBIDDEN",
    "Cannot ban the last active admin account."
  );
}

function encodeModerationCursor(input: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function getReportTargetInfo(report: ModerationReportRecord) {
  if (report.reportedPost) {
    return {
      targetEntityId: report.reportedPost.id,
      targetEntityType: "POST" as const,
      targetUser: report.reportedPost.author
    };
  }

  if (report.reportedComment) {
    return {
      targetEntityId: report.reportedComment.id,
      targetEntityType: "COMMENT" as const,
      targetUser: report.reportedComment.author
    };
  }

  if (report.reportedUser) {
    return {
      targetEntityId: report.reportedUser.id,
      targetEntityType: "USER" as const,
      targetUser: report.reportedUser
    };
  }

  throw createModerationReportNotFoundError();
}

function toModerationReportDto(report: ModerationReportRecord): ModerationReportDto {
  if (report.reportedPost) {
    return {
      createdAt: report.createdAt,
      id: report.id,
      reason: report.reason,
      reporter: report.reporter,
      resolvedAt: report.resolvedAt,
      status: report.status,
      target: {
        comment: null,
        post: {
          author: {
            id: report.reportedPost.author.id,
            username: report.reportedPost.author.username
          },
          caption: report.reportedPost.caption,
          id: report.reportedPost.id,
          imageUrl: report.reportedPost.imageUrl,
          isHidden: report.reportedPost.isHidden
        },
        type: "POST",
        user: null
      }
    };
  }

  if (report.reportedComment) {
    return {
      createdAt: report.createdAt,
      id: report.id,
      reason: report.reason,
      reporter: report.reporter,
      resolvedAt: report.resolvedAt,
      status: report.status,
      target: {
        comment: {
          author: {
            id: report.reportedComment.author.id,
            username: report.reportedComment.author.username
          },
          content: report.reportedComment.content,
          id: report.reportedComment.id,
          isHidden: report.reportedComment.isHidden,
          postId: report.reportedComment.postId
        },
        post: null,
        type: "COMMENT",
        user: null
      }
    };
  }

  if (report.reportedUser) {
    return {
      createdAt: report.createdAt,
      id: report.id,
      reason: report.reason,
      reporter: report.reporter,
      resolvedAt: report.resolvedAt,
      status: report.status,
      target: {
        comment: null,
        post: null,
        type: "USER",
        user: {
          displayName: report.reportedUser.displayName,
          id: report.reportedUser.id,
          status: report.reportedUser.status,
          username: report.reportedUser.username
        }
      }
    };
  }

  throw createModerationReportNotFoundError();
}

function toModerationActionResultDto(input: {
  moderationAction: ModerationActionRecord;
  reportId: string;
  resolvedAt: Date;
  status: "DISMISSED" | "RESOLVED";
}): ModerationActionResultDto {
  return {
    moderationAction: {
      action: input.moderationAction.action,
      createdAt: input.moderationAction.createdAt,
      id: input.moderationAction.id,
      note: input.moderationAction.reason ?? null
    },
    report: {
      id: input.reportId,
      resolvedAt: input.resolvedAt,
      status: input.status
    }
  };
}

export async function getModerationReports(
  input: ListModerationReportsQueryInput
): Promise<ModerationQueueResultDto> {
  const [pendingCount, resolvedCount, reports] = await Promise.all([
    countPendingModerationReports(),
    countResolvedModerationReports(),
    listModerationReports(input)
  ]);

  const hasNextPage = reports.length > input.limit;
  const pageReports = hasNextPage ? reports.slice(0, input.limit) : reports;
  const lastReport = pageReports.at(-1);

  return {
    pageInfo: {
      hasNextPage,
      limit: input.limit,
      nextCursor: hasNextPage && lastReport
        ? encodeModerationCursor({
            createdAt: lastReport.createdAt.toISOString(),
            id: lastReport.id
          })
        : null
    },
    reports: pageReports.map(toModerationReportDto),
    summary: {
      pendingCount,
      resolvedCount
    }
  };
}

async function dismissModerationReportInternal(input: {
  adminId: string;
  ipAddress: string | null;
  note?: string;
  reportId: string;
  userAgent: string | null;
}): Promise<ModerationActionResultDto> {
  return prisma.$transaction(async (tx) => {
    const report = await findModerationReportById(tx, input.reportId);

    if (!report) {
      throw createModerationReportNotFoundError();
    }

    if (report.status !== "PENDING") {
      throw createModerationAlreadyHandledError();
    }

    const targetInfo = getReportTargetInfo(report);
    const resolvedAt = new Date();
    const claimed = await claimModerationReport(tx, {
      reportId: report.id,
      resolvedAt,
      status: "DISMISSED"
    });

    if (!claimed) {
      throw createModerationAlreadyHandledError();
    }

    const moderationAction = await createModerationActionRecord(tx, {
      action: "DISMISS",
      adminId: input.adminId,
      note: input.note ?? null,
      reportId: report.id
    });

    const actorMetadata = {
      moderationAction: "DISMISS",
      note: input.note ?? null,
      reportId: report.id,
      targetEntityId: targetInfo.targetEntityId,
      targetEntityType: targetInfo.targetEntityType
    } satisfies Prisma.InputJsonValue;

    await createAuditLogRecord(tx, {
      action: "MODERATION_REPORT_DISMISSED",
      actorId: input.adminId,
      actorMetadata,
      entityId: report.id,
      entityType: "REPORT",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    return toModerationActionResultDto({
      moderationAction,
      reportId: report.id,
      resolvedAt,
      status: "DISMISSED"
    });
  });
}

async function hideModerationReportTargetInternal(input: {
  adminId: string;
  ipAddress: string | null;
  note: string;
  reportId: string;
  userAgent: string | null;
}): Promise<ModerationActionResultDto> {
  return prisma.$transaction(async (tx) => {
    const report = await findModerationReportById(tx, input.reportId);

    if (!report) {
      throw createModerationReportNotFoundError();
    }

    if (report.status !== "PENDING") {
      throw createModerationAlreadyHandledError();
    }

    const resolvedAt = new Date();

    if (report.reportedPost) {
      const claimed = await claimModerationReport(tx, {
        reportId: report.id,
        resolvedAt,
        status: "RESOLVED"
      });

      if (!claimed) {
        throw createModerationAlreadyHandledError();
      }

      await hideReportedPost(tx, report.reportedPost.id);

      const moderationAction = await createModerationActionRecord(tx, {
        action: "HIDE_POST",
        adminId: input.adminId,
        note: input.note,
        reportId: report.id
      });

      const actorMetadata = {
        moderationAction: "HIDE_POST",
        note: input.note,
        reportId: report.id,
        targetEntityId: report.reportedPost.id,
        targetEntityType: "POST"
      } satisfies Prisma.InputJsonValue;

      await createAuditLogRecord(tx, {
        action: "MODERATION_POST_HIDDEN",
        actorId: input.adminId,
        actorMetadata,
        entityId: report.id,
        entityType: "REPORT",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });

      return toModerationActionResultDto({
        moderationAction,
        reportId: report.id,
        resolvedAt,
        status: "RESOLVED"
      });
    }

    if (report.reportedComment) {
      const claimed = await claimModerationReport(tx, {
        reportId: report.id,
        resolvedAt,
        status: "RESOLVED"
      });

      if (!claimed) {
        throw createModerationAlreadyHandledError();
      }

      await hideReportedComment(tx, report.reportedComment.id);

      const moderationAction = await createModerationActionRecord(tx, {
        action: "HIDE_COMMENT",
        adminId: input.adminId,
        note: input.note,
        reportId: report.id
      });

      const actorMetadata = {
        moderationAction: "HIDE_COMMENT",
        note: input.note,
        reportId: report.id,
        targetEntityId: report.reportedComment.id,
        targetEntityType: "COMMENT"
      } satisfies Prisma.InputJsonValue;

      await createAuditLogRecord(tx, {
        action: "MODERATION_COMMENT_HIDDEN",
        actorId: input.adminId,
        actorMetadata,
        entityId: report.id,
        entityType: "REPORT",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      });

      return toModerationActionResultDto({
        moderationAction,
        reportId: report.id,
        resolvedAt,
        status: "RESOLVED"
      });
    }

    throw createModerationActionNotAllowedError();
  });
}

async function banModerationReportTargetUserInternal(input: {
  adminId: string;
  ipAddress: string | null;
  note: string;
  reportId: string;
  userAgent: string | null;
}): Promise<ModerationActionResultDto> {
  return prisma.$transaction(async (tx) => {
    const report = await findModerationReportById(tx, input.reportId);

    if (!report) {
      throw createModerationReportNotFoundError();
    }

    if (report.status !== "PENDING") {
      throw createModerationAlreadyHandledError();
    }

    const targetInfo = getReportTargetInfo(report);

    if (targetInfo.targetUser.id === input.adminId) {
      throw createModerationSelfBanForbiddenError();
    }

    if (
      targetInfo.targetUser.role === "ADMIN" &&
      targetInfo.targetUser.status === "ACTIVE"
    ) {
      const activeAdminCount = await countActiveAdmins(tx);

      if (activeAdminCount <= 1) {
        throw createModerationLastAdminBanForbiddenError();
      }
    }

    const resolvedAt = new Date();
    const claimed = await claimModerationReport(tx, {
      reportId: report.id,
      resolvedAt,
      status: "RESOLVED"
    });

    if (!claimed) {
      throw createModerationAlreadyHandledError();
    }

    await banReportedUser(tx, targetInfo.targetUser.id);

    const moderationAction = await createModerationActionRecord(tx, {
      action: "BAN_USER",
      adminId: input.adminId,
      note: input.note,
      reportId: report.id
    });

    const actorMetadata = {
      moderationAction: "BAN_USER",
      note: input.note,
      reportId: report.id,
      targetEntityId: targetInfo.targetUser.id,
      targetEntityType: "USER"
    } satisfies Prisma.InputJsonValue;

    await createAuditLogRecord(tx, {
      action: "MODERATION_USER_BANNED",
      actorId: input.adminId,
      actorMetadata,
      entityId: report.id,
      entityType: "REPORT",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });

    return toModerationActionResultDto({
      moderationAction,
      reportId: report.id,
      resolvedAt,
      status: "RESOLVED"
    });
  });
}

export async function dismissModerationReport(input: {
  adminId: string;
  ipAddress: string | null;
  note?: string;
  reportId: string;
  userAgent: string | null;
}) {
  return dismissModerationReportInternal(input);
}

export async function hideModerationReportTarget(input: {
  adminId: string;
  ipAddress: string | null;
  note: string;
  reportId: string;
  userAgent: string | null;
}) {
  return hideModerationReportTargetInternal(input);
}

export async function banModerationReportTargetUser(input: {
  adminId: string;
  ipAddress: string | null;
  note: string;
  reportId: string;
  userAgent: string | null;
}) {
  return banModerationReportTargetUserInternal(input);
}

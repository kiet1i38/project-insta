import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type { ReportReason } from "./reports.schema.js";

const reportSelect = {
  createdAt: true,
  id: true,
  reason: true,
  reportedCommentId: true,
  reportedPostId: true,
  reportedUserId: true,
  reporterId: true,
  status: true
} satisfies Prisma.ReportSelect;

export type ReportRecord = Prisma.ReportGetPayload<{
  select: typeof reportSelect;
}>;

type ReportTargetIdentity = {
  reportedCommentId: string | null;
  reportedPostId: string | null;
  reportedUserId: string | null;
};

function buildTargetWhereClause(
  target: ReportTargetIdentity
): Prisma.ReportWhereInput {
  return {
    reportedCommentId: target.reportedCommentId,
    reportedPostId: target.reportedPostId,
    reportedUserId: target.reportedUserId
  };
}

export async function createReportWithAuditRecord(
  input: ReportTargetIdentity & {
    actorMetadata: Prisma.InputJsonValue;
    ipAddress: string | null;
    reason: ReportReason;
    reporterId: string;
    userAgent: string | null;
  }
): Promise<ReportRecord> {
  return prisma.$transaction(async (transaction) => {
    const report = await transaction.report.create({
      data: {
        reason: input.reason,
        reportedCommentId: input.reportedCommentId,
        reportedPostId: input.reportedPostId,
        reportedUserId: input.reportedUserId,
        reporterId: input.reporterId
      },
      select: reportSelect
    });

    await transaction.auditLog.create({
      data: {
        action: "REPORT_CREATED",
        actorId: input.reporterId,
        actorMetadata: input.actorMetadata,
        entityId: report.id,
        entityType: "REPORT",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent
      }
    });

    return report;
  });
}

export async function findPendingReportByReporterAndTarget(
  input: ReportTargetIdentity & {
    reporterId: string;
  }
) {
  return prisma.report.findFirst({
    select: {
      id: true
    },
    where: {
      reporterId: input.reporterId,
      status: "PENDING",
      ...buildTargetWhereClause(input)
    }
  });
}

export async function countRecentReportsByReporter(input: {
  createdAfter: Date;
  reporterId: string;
}) {
  return prisma.report.count({
    where: {
      createdAt: {
        gte: input.createdAfter
      },
      reporterId: input.reporterId
    }
  });
}

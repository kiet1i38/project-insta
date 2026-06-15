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

export async function createReportRecord(
  input: ReportTargetIdentity & {
    reason: ReportReason;
    reporterId: string;
  }
): Promise<ReportRecord> {
  return prisma.report.create({
    data: input,
    select: reportSelect
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

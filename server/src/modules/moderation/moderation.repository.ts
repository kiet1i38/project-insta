import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type {
  ListModerationReportsCursorInput,
  ListModerationReportsQueryInput
} from "./moderation.schema.js";

const moderationReportSelect = {
  createdAt: true,
  id: true,
  reason: true,
  reporter: {
    select: {
      id: true,
      username: true
    }
  },
  reportedComment: {
    select: {
      author: {
        select: {
          id: true,
          role: true,
          status: true,
          username: true
        }
      },
      content: true,
      id: true,
      isHidden: true,
      postId: true
    }
  },
  reportedPost: {
    select: {
      author: {
        select: {
          id: true,
          role: true,
          status: true,
          username: true
        }
      },
      caption: true,
      id: true,
      imageUrl: true,
      isHidden: true
    }
  },
  reportedUser: {
    select: {
      displayName: true,
      id: true,
      role: true,
      status: true,
      username: true
    }
  },
  resolvedAt: true,
  status: true
} satisfies Prisma.ReportSelect;

const moderationActionSelect = {
  action: true,
  createdAt: true,
  id: true,
  reason: true
} satisfies Prisma.ModerationActionSelect;

type ModerationTransactionClient = Prisma.TransactionClient;

export type ModerationActionRecord = Prisma.ModerationActionGetPayload<{
  select: typeof moderationActionSelect;
}>;

export type ModerationReportRecord = Prisma.ReportGetPayload<{
  select: typeof moderationReportSelect;
}>;

function buildModerationCursorWhereClause(input: {
  cursor?: ListModerationReportsCursorInput;
  sort: ListModerationReportsQueryInput["sort"];
}): Prisma.ReportWhereInput | undefined {
  if (!input.cursor) {
    return undefined;
  }

  if (input.sort === "oldest") {
    return {
      OR: [
        {
          createdAt: {
            gt: input.cursor.createdAt
          }
        },
        {
          AND: [
            {
              createdAt: input.cursor.createdAt
            },
            {
              id: {
                gt: input.cursor.id
              }
            }
          ]
        }
      ]
    };
  }

  return {
    OR: [
      {
        createdAt: {
          lt: input.cursor.createdAt
        }
      },
      {
        AND: [
          {
            createdAt: input.cursor.createdAt
          },
          {
            id: {
              lt: input.cursor.id
            }
          }
        ]
      }
    ]
  };
}

function buildModerationOrderBy(
  sort: ListModerationReportsQueryInput["sort"]
): Prisma.ReportOrderByWithRelationInput[] {
  if (sort === "oldest") {
    return [{ createdAt: "asc" }, { id: "asc" }];
  }

  return [{ createdAt: "desc" }, { id: "desc" }];
}

export async function listModerationReports(input: {
  cursor?: ListModerationReportsCursorInput;
  limit: number;
  sort: ListModerationReportsQueryInput["sort"];
  status: ListModerationReportsQueryInput["status"];
}): Promise<ModerationReportRecord[]> {
  const cursorWhereClause = buildModerationCursorWhereClause({
    cursor: input.cursor,
    sort: input.sort
  });

  return prisma.report.findMany({
    orderBy: buildModerationOrderBy(input.sort),
    select: moderationReportSelect,
    take: input.limit + 1,
    where: {
      status: input.status,
      ...(cursorWhereClause ? { AND: [cursorWhereClause] } : {})
    }
  });
}

export async function countPendingModerationReports() {
  return prisma.report.count({
    where: {
      status: "PENDING"
    }
  });
}

export async function countResolvedModerationReports() {
  return prisma.report.count({
    where: {
      status: {
        in: ["RESOLVED", "DISMISSED"]
      }
    }
  });
}

export async function findModerationReportById(
  client: ModerationTransactionClient,
  reportId: string
) {
  return client.report.findUnique({
    select: moderationReportSelect,
    where: { id: reportId }
  });
}

export async function claimModerationReport(
  client: ModerationTransactionClient,
  input: {
    reportId: string;
    resolvedAt: Date;
    status: "RESOLVED" | "DISMISSED";
  }
) {
  const updateResult = await client.report.updateMany({
    data: {
      resolvedAt: input.resolvedAt,
      status: input.status
    },
    where: {
      id: input.reportId,
      status: "PENDING"
    }
  });

  return updateResult.count === 1;
}

export async function createModerationActionRecord(
  client: ModerationTransactionClient,
  input: {
    action: "DISMISS" | "HIDE_POST" | "HIDE_COMMENT" | "BAN_USER";
    adminId: string;
    note: string | null;
    reportId: string;
  }
): Promise<ModerationActionRecord> {
  return client.moderationAction.create({
    data: {
      action: input.action,
      adminId: input.adminId,
      reason: input.note,
      reportId: input.reportId
    },
    select: moderationActionSelect
  });
}

export async function createAuditLogRecord(
  client: ModerationTransactionClient,
  input: {
    action: string;
    actorId: string;
    actorMetadata: Prisma.InputJsonValue;
    entityId: string;
    entityType: string;
    ipAddress: string | null;
    userAgent: string | null;
  }
) {
  return client.auditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId,
      actorMetadata: input.actorMetadata,
      entityId: input.entityId,
      entityType: input.entityType,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    }
  });
}

export async function hideReportedPost(
  client: ModerationTransactionClient,
  postId: string
) {
  await client.post.updateMany({
    data: {
      isHidden: true
    },
    where: {
      id: postId
    }
  });
}

export async function hideReportedComment(
  client: ModerationTransactionClient,
  commentId: string
) {
  await client.comment.updateMany({
    data: {
      isHidden: true
    },
    where: {
      id: commentId
    }
  });
}

export async function banReportedUser(
  client: ModerationTransactionClient,
  userId: string
) {
  await client.user.updateMany({
    data: {
      status: "BANNED"
    },
    where: {
      id: userId,
      status: "ACTIVE"
    }
  });
}

export async function countActiveAdmins(client: ModerationTransactionClient) {
  return client.user.count({
    where: {
      role: "ADMIN",
      status: "ACTIVE"
    }
  });
}

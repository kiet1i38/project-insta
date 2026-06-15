import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type {
  AuditLogsCursorInput,
  ListAuditLogsQueryInput
} from "./audit.schema.js";

const auditLogSelect = {
  action: true,
  actor: {
    select: {
      id: true,
      role: true,
      status: true,
      username: true
    }
  },
  actorMetadata: true,
  createdAt: true,
  entityId: true,
  entityType: true,
  id: true,
  ipAddress: true,
  userAgent: true
} satisfies Prisma.AuditLogSelect;

export type AuditLogRecord = Prisma.AuditLogGetPayload<{
  select: typeof auditLogSelect;
}>;

function buildAuditCursorWhereClause(input: {
  cursor?: AuditLogsCursorInput;
  sort: ListAuditLogsQueryInput["sort"];
}): Prisma.AuditLogWhereInput | undefined {
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

function buildAuditOrderBy(
  sort: ListAuditLogsQueryInput["sort"]
): Prisma.AuditLogOrderByWithRelationInput[] {
  if (sort === "oldest") {
    return [{ createdAt: "asc" }, { id: "asc" }];
  }

  return [{ createdAt: "desc" }, { id: "desc" }];
}

export async function listAuditLogs(
  input: ListAuditLogsQueryInput
): Promise<AuditLogRecord[]> {
  const cursorWhereClause = buildAuditCursorWhereClause({
    cursor: input.cursor,
    sort: input.sort
  });

  const whereClauses: Prisma.AuditLogWhereInput[] = [];

  if (input.action) {
    whereClauses.push({
      action: input.action
    });
  }

  if (input.actorId) {
    whereClauses.push({
      actorId: input.actorId
    });
  }

  if (input.entityId) {
    whereClauses.push({
      entityId: input.entityId
    });
  }

  if (input.entityType) {
    whereClauses.push({
      entityType: input.entityType
    });
  }

  if (input.from || input.to) {
    whereClauses.push({
      createdAt: {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lte: input.to } : {})
      }
    });
  }

  if (cursorWhereClause) {
    whereClauses.push(cursorWhereClause);
  }

  return prisma.auditLog.findMany({
    orderBy: buildAuditOrderBy(input.sort),
    select: auditLogSelect,
    take: input.limit + 1,
    where: whereClauses.length > 0 ? { AND: whereClauses } : undefined
  });
}

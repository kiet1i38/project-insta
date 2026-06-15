import type { Prisma } from "../../generated/prisma/client.js";
import { listAuditLogs, type AuditLogRecord } from "./audit.repository.js";
import type { ListAuditLogsQueryInput } from "./audit.schema.js";

type AuditActorDto = {
  id: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "BANNED";
  username: string;
};

type AuditLogDto = {
  action: string;
  actor: AuditActorDto | null;
  actorMetadata: Prisma.JsonValue | null;
  createdAt: Date;
  entityId: string | null;
  entityType: string | null;
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
};

type AuditLogListResultDto = {
  auditLogs: AuditLogDto[];
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
};

function encodeAuditCursor(input: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function isSecretLikeKey(key: string) {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();

  return [
    "password",
    "passwordhash",
    "token",
    "accesstoken",
    "refreshtoken",
    "csrftoken",
    "authorization",
    "cookie",
    "secret",
    "apikey"
  ].some((secretFragment) => normalizedKey.includes(secretFragment));
}

function sanitizeAuditMetadataValue(
  value: Prisma.JsonValue | null
): Prisma.JsonValue | null {
  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadataValue(item));
  }

  const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => {
    if (isSecretLikeKey(key)) {
      return [key, "[REDACTED]"] satisfies [string, Prisma.JsonValue];
    }

    return [
      key,
      sanitizeAuditMetadataValue(entryValue as Prisma.JsonValue)
    ] satisfies [string, Prisma.JsonValue];
  });

  return Object.fromEntries(sanitizedEntries) as Prisma.JsonObject;
}

function toAuditLogDto(record: AuditLogRecord): AuditLogDto {
  return {
    action: record.action,
    actor: record.actor
      ? {
          id: record.actor.id,
          role: record.actor.role,
          status: record.actor.status,
          username: record.actor.username
        }
      : null,
    actorMetadata: sanitizeAuditMetadataValue(
      record.actorMetadata as Prisma.JsonValue | null
    ),
    createdAt: record.createdAt,
    entityId: record.entityId,
    entityType: record.entityType,
    id: record.id,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent
  };
}

export async function getAuditLogs(
  input: ListAuditLogsQueryInput
): Promise<AuditLogListResultDto> {
  const auditLogs = await listAuditLogs(input);
  const hasNextPage = auditLogs.length > input.limit;
  const pageAuditLogs = hasNextPage ? auditLogs.slice(0, input.limit) : auditLogs;
  const lastAuditLog = pageAuditLogs.at(-1);

  return {
    auditLogs: pageAuditLogs.map(toAuditLogDto),
    pageInfo: {
      hasNextPage,
      limit: input.limit,
      nextCursor: hasNextPage && lastAuditLog
        ? encodeAuditCursor({
            createdAt: lastAuditLog.createdAt.toISOString(),
            id: lastAuditLog.id
          })
        : null
    }
  };
}

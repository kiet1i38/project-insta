import { Prisma } from "../../generated/prisma/client.js";
import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "../auth/password.js";

const allowedOrigin = "http://localhost:5173";

async function createUserFixture(overrides: {
  email?: string;
  password?: string;
  role?: "USER" | "ADMIN";
  status?: "ACTIVE" | "BANNED";
  username?: string;
} = {}) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? "audit-user@example.com",
      passwordHash,
      role: overrides.role ?? "USER",
      status: overrides.status ?? "ACTIVE",
      username: overrides.username ?? "audit_user"
    }
  });

  return { password, user };
}

async function loginAndGetAccessToken(identifier: string, password: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    identifier,
    password
  });

  expect(response.status).toBe(200);
  expect(response.body.accessToken).toEqual(expect.any(String));

  return response.body.accessToken as string;
}

async function createAuditLogFixture(overrides: {
  action: string;
  actorId?: string | null;
  actorMetadata?: Prisma.InputJsonValue | null;
  createdAt?: Date;
  entityId?: string | null;
  entityType?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return prisma.auditLog.create({
    data: {
      action: overrides.action,
      actorId: overrides.actorId ?? null,
      actorMetadata:
        overrides.actorMetadata === undefined || overrides.actorMetadata === null
          ? Prisma.DbNull
          : overrides.actorMetadata,
      createdAt: overrides.createdAt,
      entityId: overrides.entityId ?? null,
      entityType: overrides.entityType ?? null,
      ipAddress: overrides.ipAddress ?? null,
      userAgent: overrides.userAgent ?? null
    }
  });
}

describe("audit API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("GET /api/v1/admin/audit-logs requires an authenticated admin user", async () => {
    const nonAdmin = await createUserFixture({
      email: "audit-viewer@example.com",
      username: "audit_viewer"
    });
    const userAccessToken = await loginAndGetAccessToken(
      nonAdmin.user.email,
      nonAdmin.password
    );

    const unauthenticatedResponse = await request(app).get(
      "/api/v1/admin/audit-logs"
    );

    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(unauthenticatedResponse.body.error.message).toBe(
      "Authentication required."
    );

    const forbiddenResponse = await request(app)
      .get("/api/v1/admin/audit-logs")
      .set("Authorization", `Bearer ${userAccessToken}`);

    expect(forbiddenResponse.status).toBe(403);
    expect(forbiddenResponse.body.error.code).toBe("AUTH_FORBIDDEN");
    expect(forbiddenResponse.body.error.message).toBe("Forbidden.");
  });

  test("GET /api/v1/admin/audit-logs returns paginated audit rows and redacts secret metadata", async () => {
    const admin = await createUserFixture({
      email: "audit-admin@example.com",
      role: "ADMIN",
      username: "audit_admin"
    });
    const actor = await createUserFixture({
      email: "audit-actor@example.com",
      username: "audit_actor"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );

    const actorlessAudit = await createAuditLogFixture({
      action: "LOGIN_FAILED",
      actorId: null,
      actorMetadata: {
        attemptedEmail: "guest@example.com",
        nested: {
          accessToken: "secret-access-token",
          keep: "visible-safe-value"
        },
        password: "Password123!",
        values: [
          {
            keep: "array-safe-value",
            refreshToken: "secret-refresh-token"
          }
        ]
      },
      createdAt: new Date("2026-06-15T08:00:00.000Z"),
      entityId: null,
      entityType: "AUTH",
      ipAddress: "127.0.0.1",
      userAgent: "vitest/guest"
    });
    const reportAudit = await createAuditLogFixture({
      action: "REPORT_CREATED",
      actorId: actor.user.id,
      actorMetadata: {
        reason: "SPAM",
        reportedPostId: "550e8400-e29b-41d4-a716-446655440001"
      },
      createdAt: new Date("2026-06-15T09:00:00.000Z"),
      entityId: "550e8400-e29b-41d4-a716-446655440010",
      entityType: "REPORT",
      ipAddress: "127.0.0.2",
      userAgent: "vitest/reporter"
    });
    const moderationAudit = await createAuditLogFixture({
      action: "MODERATION_USER_BANNED",
      actorId: admin.user.id,
      actorMetadata: {
        moderationAction: "BAN_USER",
        note: "Repeated abuse confirmed.",
        targetEntityId: "550e8400-e29b-41d4-a716-446655440099",
        targetEntityType: "USER"
      },
      createdAt: new Date("2026-06-15T10:00:00.000Z"),
      entityId: "550e8400-e29b-41d4-a716-446655440020",
      entityType: "REPORT",
      ipAddress: "127.0.0.3",
      userAgent: "vitest/admin"
    });

    const firstPageResponse = await request(app)
      .get("/api/v1/admin/audit-logs")
      .query({ limit: 2 })
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstPageResponse.status).toBe(200);
    expect(firstPageResponse.body.requestId).toMatch(/^req_/);
    expect(firstPageResponse.headers["x-request-id"]).toBe(
      firstPageResponse.body.requestId
    );
    expect(firstPageResponse.headers["access-control-allow-origin"]).toBe(
      allowedOrigin
    );
    expect(firstPageResponse.headers["access-control-allow-credentials"]).toBe(
      "true"
    );
    expect(firstPageResponse.headers["vary"]).toContain("Origin");
    expect(firstPageResponse.body.pageInfo).toEqual({
      hasNextPage: true,
      limit: 2,
      nextCursor: expect.any(String)
    });
    expect(firstPageResponse.body.auditLogs).toEqual([
      {
        action: moderationAudit.action,
        actor: {
          id: admin.user.id,
          role: "ADMIN",
          status: "ACTIVE",
          username: admin.user.username
        },
        actorMetadata: {
          moderationAction: "BAN_USER",
          note: "Repeated abuse confirmed.",
          targetEntityId: "550e8400-e29b-41d4-a716-446655440099",
          targetEntityType: "USER"
        },
        createdAt: "2026-06-15T10:00:00.000Z",
        entityId: "550e8400-e29b-41d4-a716-446655440020",
        entityType: "REPORT",
        id: moderationAudit.id,
        ipAddress: "127.0.0.3",
        userAgent: "vitest/admin"
      },
      {
        action: reportAudit.action,
        actor: {
          id: actor.user.id,
          role: "USER",
          status: "ACTIVE",
          username: actor.user.username
        },
        actorMetadata: {
          reason: "SPAM",
          reportedPostId: "550e8400-e29b-41d4-a716-446655440001"
        },
        createdAt: "2026-06-15T09:00:00.000Z",
        entityId: "550e8400-e29b-41d4-a716-446655440010",
        entityType: "REPORT",
        id: reportAudit.id,
        ipAddress: "127.0.0.2",
        userAgent: "vitest/reporter"
      }
    ]);

    const secondPageResponse = await request(app)
      .get("/api/v1/admin/audit-logs")
      .query({
        cursor: firstPageResponse.body.pageInfo.nextCursor,
        limit: 2
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondPageResponse.status).toBe(200);
    expect(secondPageResponse.body.pageInfo).toEqual({
      hasNextPage: false,
      limit: 2,
      nextCursor: null
    });
    expect(secondPageResponse.body.auditLogs).toEqual([
      {
        action: actorlessAudit.action,
        actor: null,
        actorMetadata: {
          attemptedEmail: "guest@example.com",
          nested: {
            accessToken: "[REDACTED]",
            keep: "visible-safe-value"
          },
          password: "[REDACTED]",
          values: [
            {
              keep: "array-safe-value",
              refreshToken: "[REDACTED]"
            }
          ]
        },
        createdAt: "2026-06-15T08:00:00.000Z",
        entityId: null,
        entityType: "AUTH",
        id: actorlessAudit.id,
        ipAddress: "127.0.0.1",
        userAgent: "vitest/guest"
      }
    ]);
  });

  test("GET /api/v1/admin/audit-logs filters by action, actor, entity type, and date range", async () => {
    const admin = await createUserFixture({
      email: "audit-filter-admin@example.com",
      role: "ADMIN",
      username: "audit_filter_admin"
    });
    const otherActor = await createUserFixture({
      email: "audit-filter-actor@example.com",
      username: "audit_filter_actor"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );

    await createAuditLogFixture({
      action: "MODERATION_POST_HIDDEN",
      actorId: admin.user.id,
      actorMetadata: {
        note: "Too early."
      },
      createdAt: new Date("2026-06-15T10:00:00.000Z"),
      entityId: "550e8400-e29b-41d4-a716-446655440030",
      entityType: "REPORT"
    });
    const matchingAudit = await createAuditLogFixture({
      action: "MODERATION_POST_HIDDEN",
      actorId: admin.user.id,
      actorMetadata: {
        note: "Correct window."
      },
      createdAt: new Date("2026-06-15T11:00:00.000Z"),
      entityId: "550e8400-e29b-41d4-a716-446655440031",
      entityType: "REPORT"
    });
    await createAuditLogFixture({
      action: "MODERATION_POST_HIDDEN",
      actorId: otherActor.user.id,
      actorMetadata: {
        note: "Wrong actor."
      },
      createdAt: new Date("2026-06-15T11:00:00.000Z"),
      entityId: "550e8400-e29b-41d4-a716-446655440032",
      entityType: "REPORT"
    });
    await createAuditLogFixture({
      action: "REPORT_CREATED",
      actorId: admin.user.id,
      actorMetadata: {
        note: "Wrong action."
      },
      createdAt: new Date("2026-06-15T11:00:00.000Z"),
      entityId: "550e8400-e29b-41d4-a716-446655440033",
      entityType: "REPORT"
    });
    await createAuditLogFixture({
      action: "MODERATION_POST_HIDDEN",
      actorId: admin.user.id,
      actorMetadata: {
        note: "Wrong entity."
      },
      createdAt: new Date("2026-06-15T11:00:00.000Z"),
      entityId: "550e8400-e29b-41d4-a716-446655440034",
      entityType: "AUTH"
    });

    const response = await request(app)
      .get("/api/v1/admin/audit-logs")
      .query({
        action: "MODERATION_POST_HIDDEN",
        actorId: admin.user.id,
        entityType: "REPORT",
        from: "2026-06-15T10:30:00.000Z",
        to: "2026-06-15T11:30:00.000Z"
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.pageInfo).toEqual({
      hasNextPage: false,
      limit: 20,
      nextCursor: null
    });
    expect(response.body.auditLogs).toHaveLength(1);
    expect(response.body.auditLogs[0]).toMatchObject({
      action: "MODERATION_POST_HIDDEN",
      actor: {
        id: admin.user.id,
        username: admin.user.username
      },
      createdAt: "2026-06-15T11:00:00.000Z",
      entityId: matchingAudit.entityId,
      entityType: "REPORT",
      id: matchingAudit.id
    });
  });

  test("GET /api/v1/admin/audit-logs rejects an invalid date range", async () => {
    const admin = await createUserFixture({
      email: "audit-validation-admin@example.com",
      role: "ADMIN",
      username: "audit_validation_admin"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );

    const response = await request(app)
      .get("/api/v1/admin/audit-logs")
      .query({
        from: "2026-06-16T00:00:00.000Z",
        to: "2026-06-15T00:00:00.000Z"
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid query string.");
    expect(response.body.error.details).toEqual([
      {
        message: "from must be earlier than or equal to to.",
        path: "from"
      }
    ]);
  });

  test("OPTIONS /api/v1/admin/audit-logs returns CORS headers before a browser GET request", async () => {
    const response = await request(app)
      .options("/api/v1/admin/audit-logs")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
  });
});

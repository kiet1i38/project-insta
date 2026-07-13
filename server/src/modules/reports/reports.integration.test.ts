import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "../auth/password.js";

const allowedOrigin = "http://localhost:5173";

async function createUserFixture(
  overrides: {
    email?: string;
    password?: string;
    role?: "USER" | "ADMIN";
    status?: "ACTIVE" | "BANNED";
    username?: string;
  } = {}
) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? "reporter@example.com",
      passwordHash,
      role: overrides.role ?? "USER",
      status: overrides.status ?? "ACTIVE",
      username: overrides.username ?? "reporter_user"
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

async function createPostFixture(overrides: {
  authorId: string;
  caption?: string | null;
  deletedAt?: Date | null;
  imageUrl?: string;
  isHidden?: boolean;
}) {
  return prisma.post.create({
    data: {
      authorId: overrides.authorId,
      caption: overrides.caption ?? null,
      deletedAt: overrides.deletedAt ?? null,
      imageUrl:
        overrides.imageUrl ?? "https://cdn.example.com/posts/report.png",
      isHidden: overrides.isHidden ?? false
    }
  });
}

describe("reports API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("POST /api/v1/reports requires an authenticated access token", async () => {
    const response = await request(app).post("/api/v1/reports").send({
      reason: "SPAM",
      reportedUserId: "550e8400-e29b-41d4-a716-446655440000"
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("POST /api/v1/reports creates a pending report for a visible post and returns a safe DTO", async () => {
    const reporter = await createUserFixture({
      email: "post-reporter@example.com",
      username: "post_reporter"
    });
    const author = await createUserFixture({
      email: "post-author@example.com",
      username: "post_author"
    });
    const accessToken = await loginAndGetAccessToken(
      reporter.user.email,
      reporter.password
    );
    const post = await createPostFixture({
      authorId: author.user.id,
      caption: "Report target post"
    });

    const response = await request(app)
      .post("/api/v1/reports")
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "SPAM",
        reportedPostId: post.id
      });

    expect(response.status).toBe(201);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.body.report).toEqual({
      createdAt: expect.any(String),
      id: expect.any(String),
      reason: "SPAM",
      reportedCommentId: null,
      reportedPostId: post.id,
      reportedUserId: null,
      reporterId: reporter.user.id,
      status: "PENDING"
    });
    expect(response.body.report.resolvedAt).toBeUndefined();

    const createdReport = await prisma.report.findUniqueOrThrow({
      where: {
        id: response.body.report.id as string
      }
    });

    expect(createdReport).toMatchObject({
      reason: "SPAM",
      reportedCommentId: null,
      reportedPostId: post.id,
      reportedUserId: null,
      reporterId: reporter.user.id,
      status: "PENDING"
    });
    expect(createdReport.resolvedAt).toBeNull();
  });

  test("POST /api/v1/reports records safe moderation audit context for a reported user", async () => {
    const reporter = await createUserFixture({
      email: "thread-reporter@example.com",
      username: "thread_reporter"
    });
    const reportedUser = await createUserFixture({
      email: "thread-reported@example.com",
      username: "thread_reported"
    });
    const accessToken = await loginAndGetAccessToken(
      reporter.user.email,
      reporter.password
    );

    const response = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("User-Agent", "vitest/thread-report")
      .send({
        reason: "HARASSMENT",
        reportedUserId: reportedUser.user.id
      });

    expect(response.status).toBe(201);
    expect(response.body.report).toMatchObject({
      reason: "HARASSMENT",
      reportedCommentId: null,
      reportedPostId: null,
      reportedUserId: reportedUser.user.id,
      reporterId: reporter.user.id,
      status: "PENDING"
    });

    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "REPORT_CREATED",
        entityId: response.body.report.id as string
      }
    });

    expect(auditLog).toMatchObject({
      action: "REPORT_CREATED",
      actorId: reporter.user.id,
      entityType: "REPORT",
      userAgent: "vitest/thread-report"
    });
    expect(auditLog.actorMetadata).toEqual({
      reason: "HARASSMENT",
      targetEntityId: reportedUser.user.id,
      targetEntityType: "USER"
    });
  });

  test("POST /api/v1/reports rejects a body with no report target", async () => {
    const reporter = await createUserFixture({
      email: "missing-target@example.com",
      username: "missing_target"
    });
    const accessToken = await loginAndGetAccessToken(
      reporter.user.email,
      reporter.password
    );

    const response = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "SPAM"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid request body.");
    expect(response.body.error.details).toEqual([
      {
        message: "Exactly one report target is required.",
        path: "reportedTarget"
      }
    ]);
  });

  test("POST /api/v1/reports rejects a body with multiple report targets", async () => {
    const reporter = await createUserFixture({
      email: "multi-target@example.com",
      username: "multi_target"
    });
    const targetUser = await createUserFixture({
      email: "multi-target-user@example.com",
      username: "multi_target_user"
    });
    const targetPostAuthor = await createUserFixture({
      email: "multi-target-post-author@example.com",
      username: "multi_target_post_author"
    });
    const accessToken = await loginAndGetAccessToken(
      reporter.user.email,
      reporter.password
    );
    const post = await createPostFixture({
      authorId: targetPostAuthor.user.id
    });

    const response = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "SPAM",
        reportedPostId: post.id,
        reportedUserId: targetUser.user.id
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid request body.");
    expect(response.body.error.details).toEqual([
      {
        message: "Exactly one report target is required.",
        path: "reportedTarget"
      }
    ]);
  });

  test("POST /api/v1/reports rejects an unsupported report reason", async () => {
    const reporter = await createUserFixture({
      email: "invalid-reason@example.com",
      username: "invalid_reason"
    });
    const targetUser = await createUserFixture({
      email: "invalid-reason-target@example.com",
      username: "invalid_reason_target"
    });
    const accessToken = await loginAndGetAccessToken(
      reporter.user.email,
      reporter.password
    );

    const response = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "NOT_A_REASON",
        reportedUserId: targetUser.user.id
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid request body.");
    expect(response.body.error.details).toEqual([
      {
        message: "Reason must be a supported report reason.",
        path: "reason"
      }
    ]);
  });

  test("POST /api/v1/reports hides deleted or hidden targets behind REPORT_TARGET_NOT_FOUND", async () => {
    const reporter = await createUserFixture({
      email: "deleted-target-reporter@example.com",
      username: "deleted_target_reporter"
    });
    const author = await createUserFixture({
      email: "deleted-target-author@example.com",
      username: "deleted_target_author"
    });
    const accessToken = await loginAndGetAccessToken(
      reporter.user.email,
      reporter.password
    );
    const deletedPost = await createPostFixture({
      authorId: author.user.id,
      deletedAt: new Date("2026-06-14T18:00:00.000Z")
    });

    const response = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "SPAM",
        reportedPostId: deletedPost.id
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("REPORT_TARGET_NOT_FOUND");
    expect(response.body.error.message).toBe("Report target not found.");
    expect(await prisma.report.count()).toBe(0);
  });

  test("POST /api/v1/reports blocks a duplicate pending report from the same user on the same target", async () => {
    const reporter = await createUserFixture({
      email: "duplicate-reporter@example.com",
      username: "duplicate_reporter"
    });
    const author = await createUserFixture({
      email: "duplicate-author@example.com",
      username: "duplicate_author"
    });
    const accessToken = await loginAndGetAccessToken(
      reporter.user.email,
      reporter.password
    );
    const post = await createPostFixture({
      authorId: author.user.id
    });

    const firstResponse = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "SPAM",
        reportedPostId: post.id
      });

    expect(firstResponse.status).toBe(201);

    const secondResponse = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "IMPERSONATION",
        reportedPostId: post.id
      });

    expect(secondResponse.status).toBe(409);
    expect(secondResponse.body.error.code).toBe("REPORT_ALREADY_EXISTS");
    expect(secondResponse.body.error.message).toBe(
      "You already have a pending report for this target."
    );
    expect(
      await prisma.report.count({
        where: {
          reportedPostId: post.id,
          reporterId: reporter.user.id
        }
      })
    ).toBe(1);
  });

  test("POST /api/v1/reports rate limits a user after too many recent report submissions", async () => {
    const reporter = await createUserFixture({
      email: "rate-limit-reporter@example.com",
      username: "rate_limit_reporter"
    });
    const accessToken = await loginAndGetAccessToken(
      reporter.user.email,
      reporter.password
    );
    const targetUsers = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        createUserFixture({
          email: `rate-limit-target-${index}@example.com`,
          username: `rate_limit_target_${index}`
        })
      )
    );
    const now = Date.now();

    await prisma.report.createMany({
      data: targetUsers.slice(0, 5).map((target, index) => ({
        createdAt: new Date(now - index * 60_000),
        reason: "SPAM",
        reportedCommentId: null,
        reportedPostId: null,
        reportedUserId: target.user.id,
        reporterId: reporter.user.id
      }))
    });

    const response = await request(app)
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        reason: "HARASSMENT",
        reportedUserId: targetUsers[5].user.id
      });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("REPORT_RATE_LIMITED");
    expect(response.body.error.message).toBe(
      "Too many reports submitted recently. Please try again later."
    );
    expect(
      await prisma.report.count({
        where: {
          reporterId: reporter.user.id
        }
      })
    ).toBe(5);
  });

  test("OPTIONS /api/v1/reports returns CORS headers for the allowed client origin before a browser POST request", async () => {
    const response = await request(app)
      .options("/api/v1/reports")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Content-Type"
    );
  });
});

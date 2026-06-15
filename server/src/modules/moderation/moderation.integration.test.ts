import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "../auth/password.js";

const allowedOrigin = "http://localhost:5173";

async function createUserFixture(overrides: {
  displayName?: string | null;
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
      displayName: overrides.displayName ?? null,
      email: overrides.email ?? "moderation-user@example.com",
      passwordHash,
      role: overrides.role ?? "USER",
      status: overrides.status ?? "ACTIVE",
      username: overrides.username ?? "moderation_user"
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
  createdAt?: Date;
  deletedAt?: Date | null;
  imageUrl?: string;
  isHidden?: boolean;
}) {
  return prisma.post.create({
    data: {
      authorId: overrides.authorId,
      caption: overrides.caption ?? null,
      createdAt: overrides.createdAt,
      deletedAt: overrides.deletedAt ?? null,
      imageUrl:
        overrides.imageUrl ?? "https://cdn.example.com/posts/moderation.png",
      isHidden: overrides.isHidden ?? false
    }
  });
}

async function createCommentFixture(overrides: {
  authorId: string;
  content?: string;
  createdAt?: Date;
  deletedAt?: Date | null;
  isHidden?: boolean;
  postId: string;
}) {
  return prisma.comment.create({
    data: {
      authorId: overrides.authorId,
      content: overrides.content ?? "Moderation comment target",
      createdAt: overrides.createdAt,
      deletedAt: overrides.deletedAt ?? null,
      isHidden: overrides.isHidden ?? false,
      postId: overrides.postId
    }
  });
}

async function createReportFixture(overrides: {
  createdAt?: Date;
  reason?: string;
  reportedCommentId?: string | null;
  reportedPostId?: string | null;
  reportedUserId?: string | null;
  reporterId: string;
  resolvedAt?: Date | null;
  status?: "PENDING" | "RESOLVED" | "DISMISSED";
}) {
  return prisma.report.create({
    data: {
      createdAt: overrides.createdAt,
      reason: overrides.reason ?? "SPAM",
      reportedCommentId: overrides.reportedCommentId ?? null,
      reportedPostId: overrides.reportedPostId ?? null,
      reportedUserId: overrides.reportedUserId ?? null,
      reporterId: overrides.reporterId,
      resolvedAt: overrides.resolvedAt ?? null,
      status: overrides.status ?? "PENDING"
    }
  });
}

describe("moderation API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("GET /api/v1/admin/reports requires an authenticated admin user", async () => {
    const nonAdmin = await createUserFixture({
      email: "moderation-viewer@example.com",
      username: "moderation_viewer"
    });
    const userAccessToken = await loginAndGetAccessToken(
      nonAdmin.user.email,
      nonAdmin.password
    );

    const unauthenticatedResponse = await request(app).get("/api/v1/admin/reports");

    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(unauthenticatedResponse.body.error.message).toBe(
      "Authentication required."
    );

    const forbiddenResponse = await request(app)
      .get("/api/v1/admin/reports")
      .set("Authorization", `Bearer ${userAccessToken}`);

    expect(forbiddenResponse.status).toBe(403);
    expect(forbiddenResponse.body.error.code).toBe("AUTH_FORBIDDEN");
    expect(forbiddenResponse.body.error.message).toBe("Forbidden.");
  });

  test("GET /api/v1/admin/reports returns pending reports in newest-first order with summary counts and target previews", async () => {
    const admin = await createUserFixture({
      email: "moderation-admin@example.com",
      role: "ADMIN",
      username: "moderation_admin"
    });
    const reporter = await createUserFixture({
      email: "moderation-reporter@example.com",
      username: "moderation_reporter"
    });
    const postAuthor = await createUserFixture({
      displayName: "Post Author",
      email: "moderation-post-author@example.com",
      username: "moderation_post_author"
    });
    const commentAuthor = await createUserFixture({
      displayName: "Comment Author",
      email: "moderation-comment-author@example.com",
      username: "moderation_comment_author"
    });
    const reportedUser = await createUserFixture({
      displayName: "Reported User",
      email: "moderation-reported-user@example.com",
      username: "moderation_reported_user"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );

    const post = await createPostFixture({
      authorId: postAuthor.user.id,
      caption: "Reported post caption",
      createdAt: new Date("2026-06-15T00:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/reported-post.png"
    });
    const commentPost = await createPostFixture({
      authorId: postAuthor.user.id,
      caption: "Parent post",
      createdAt: new Date("2026-06-15T01:00:00.000Z")
    });
    const comment = await createCommentFixture({
      authorId: commentAuthor.user.id,
      content: "Reported comment content",
      createdAt: new Date("2026-06-15T02:00:00.000Z"),
      postId: commentPost.id
    });

    const postReport = await createReportFixture({
      createdAt: new Date("2026-06-15T03:00:00.000Z"),
      reason: "SPAM",
      reportedPostId: post.id,
      reporterId: reporter.user.id
    });
    const commentReport = await createReportFixture({
      createdAt: new Date("2026-06-15T04:00:00.000Z"),
      reason: "HARASSMENT",
      reportedCommentId: comment.id,
      reporterId: reporter.user.id
    });
    const userReport = await createReportFixture({
      createdAt: new Date("2026-06-15T05:00:00.000Z"),
      reason: "IMPERSONATION",
      reportedUserId: reportedUser.user.id,
      reporterId: reporter.user.id
    });
    await createReportFixture({
      createdAt: new Date("2026-06-15T06:00:00.000Z"),
      reason: "OTHER",
      reportedUserId: reportedUser.user.id,
      reporterId: reporter.user.id,
      resolvedAt: new Date("2026-06-15T06:10:00.000Z"),
      status: "DISMISSED"
    });

    const response = await request(app)
      .get("/api/v1/admin/reports")
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.body.summary).toEqual({
      pendingCount: 3,
      resolvedCount: 1
    });
    expect(response.body.pageInfo).toEqual({
      hasNextPage: false,
      limit: 10,
      nextCursor: null
    });
    expect(response.body.reports).toEqual([
      {
        createdAt: "2026-06-15T05:00:00.000Z",
        id: userReport.id,
        reason: "IMPERSONATION",
        reporter: {
          id: reporter.user.id,
          username: reporter.user.username
        },
        resolvedAt: null,
        status: "PENDING",
        target: {
          comment: null,
          post: null,
          type: "USER",
          user: {
            displayName: reportedUser.user.displayName,
            id: reportedUser.user.id,
            status: "ACTIVE",
            username: reportedUser.user.username
          }
        }
      },
      {
        createdAt: "2026-06-15T04:00:00.000Z",
        id: commentReport.id,
        reason: "HARASSMENT",
        reporter: {
          id: reporter.user.id,
          username: reporter.user.username
        },
        resolvedAt: null,
        status: "PENDING",
        target: {
          comment: {
            author: {
              id: commentAuthor.user.id,
              username: commentAuthor.user.username
            },
            content: "Reported comment content",
            id: comment.id,
            isHidden: false,
            postId: commentPost.id
          },
          post: null,
          type: "COMMENT",
          user: null
        }
      },
      {
        createdAt: "2026-06-15T03:00:00.000Z",
        id: postReport.id,
        reason: "SPAM",
        reporter: {
          id: reporter.user.id,
          username: reporter.user.username
        },
        resolvedAt: null,
        status: "PENDING",
        target: {
          comment: null,
          post: {
            author: {
              id: postAuthor.user.id,
              username: postAuthor.user.username
            },
            caption: "Reported post caption",
            id: post.id,
            imageUrl: "https://cdn.example.com/posts/reported-post.png",
            isHidden: false
          },
          type: "POST",
          user: null
        }
      }
    ]);
  });

  test("POST /api/v1/admin/reports/:reportId/dismiss dismisses a pending report and writes moderation history", async () => {
    const admin = await createUserFixture({
      email: "dismiss-admin@example.com",
      role: "ADMIN",
      username: "dismiss_admin"
    });
    const reporter = await createUserFixture({
      email: "dismiss-reporter@example.com",
      username: "dismiss_reporter"
    });
    const reportedUser = await createUserFixture({
      email: "dismiss-target@example.com",
      username: "dismiss_target"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );
    const report = await createReportFixture({
      reason: "OTHER",
      reportedUserId: reportedUser.user.id,
      reporterId: reporter.user.id
    });

    const response = await request(app)
      .post(`/api/v1/admin/reports/${report.id}/dismiss`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        note: "Insufficient evidence after review."
      });

    expect(response.status).toBe(200);
    expect(response.body.report).toEqual({
      id: report.id,
      resolvedAt: expect.any(String),
      status: "DISMISSED"
    });
    expect(response.body.moderationAction).toEqual({
      action: "DISMISS",
      createdAt: expect.any(String),
      id: expect.any(String),
      note: "Insufficient evidence after review."
    });

    const updatedReport = await prisma.report.findUniqueOrThrow({
      where: { id: report.id }
    });
    expect(updatedReport.status).toBe("DISMISSED");
    expect(updatedReport.resolvedAt).toEqual(expect.any(Date));

    const moderationAction = await prisma.moderationAction.findFirstOrThrow({
      where: { reportId: report.id }
    });
    expect(moderationAction).toMatchObject({
      action: "DISMISS",
      adminId: admin.user.id,
      reason: "Insufficient evidence after review.",
      reportId: report.id
    });

    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "MODERATION_REPORT_DISMISSED",
        actorId: admin.user.id,
        entityId: report.id,
        entityType: "REPORT"
      }
    });
    expect(auditLog.actorMetadata).toEqual(
      expect.objectContaining({
        moderationAction: "DISMISS",
        note: "Insufficient evidence after review.",
        reportId: report.id
      })
    );
  });

  test("POST /api/v1/admin/reports/:reportId/hide-content requires an audit note", async () => {
    const admin = await createUserFixture({
      email: "hide-validation-admin@example.com",
      role: "ADMIN",
      username: "hide_validation_admin"
    });
    const reporter = await createUserFixture({
      email: "hide-validation-reporter@example.com",
      username: "hide_validation_reporter"
    });
    const author = await createUserFixture({
      email: "hide-validation-author@example.com",
      username: "hide_validation_author"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );
    const post = await createPostFixture({
      authorId: author.user.id,
      caption: "Needs moderator review"
    });
    const report = await createReportFixture({
      reportedPostId: post.id,
      reporterId: reporter.user.id
    });

    const response = await request(app)
      .post(`/api/v1/admin/reports/${report.id}/hide-content`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid request body.");
    expect(response.body.error.details).toEqual([
      {
        message: "Audit note is required.",
        path: "note"
      }
    ]);
  });

  test("POST /api/v1/admin/reports/:reportId/hide-content hides a reported post and resolves the report", async () => {
    const admin = await createUserFixture({
      email: "hide-admin@example.com",
      role: "ADMIN",
      username: "hide_admin"
    });
    const reporter = await createUserFixture({
      email: "hide-reporter@example.com",
      username: "hide_reporter"
    });
    const author = await createUserFixture({
      email: "hide-author@example.com",
      username: "hide_author"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );
    const post = await createPostFixture({
      authorId: author.user.id,
      caption: "Hide this post",
      imageUrl: "https://cdn.example.com/posts/hide-this.png"
    });
    const report = await createReportFixture({
      reason: "HATE_SPEECH",
      reportedPostId: post.id,
      reporterId: reporter.user.id
    });

    const response = await request(app)
      .post(`/api/v1/admin/reports/${report.id}/hide-content`)
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        note: "Policy violation confirmed."
      });

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.body.report).toEqual({
      id: report.id,
      resolvedAt: expect.any(String),
      status: "RESOLVED"
    });
    expect(response.body.moderationAction).toEqual({
      action: "HIDE_POST",
      createdAt: expect.any(String),
      id: expect.any(String),
      note: "Policy violation confirmed."
    });

    const updatedPost = await prisma.post.findUniqueOrThrow({
      where: { id: post.id }
    });
    expect(updatedPost.isHidden).toBe(true);

    const updatedReport = await prisma.report.findUniqueOrThrow({
      where: { id: report.id }
    });
    expect(updatedReport.status).toBe("RESOLVED");
    expect(updatedReport.resolvedAt).toEqual(expect.any(Date));

    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "MODERATION_POST_HIDDEN",
        actorId: admin.user.id,
        entityId: report.id,
        entityType: "REPORT"
      }
    });
    expect(auditLog.actorMetadata).toEqual(
      expect.objectContaining({
        note: "Policy violation confirmed.",
        reportId: report.id,
        targetEntityId: post.id,
        targetEntityType: "POST"
      })
    );
  });

  test("POST /api/v1/admin/reports/:reportId/ban-user bans a reported user account and rejects self-ban", async () => {
    const admin = await createUserFixture({
      email: "ban-admin@example.com",
      role: "ADMIN",
      username: "ban_admin"
    });
    const reporter = await createUserFixture({
      email: "ban-reporter@example.com",
      username: "ban_reporter"
    });
    const targetUser = await createUserFixture({
      email: "ban-target@example.com",
      username: "ban_target"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );
    const report = await createReportFixture({
      reason: "HARASSMENT",
      reportedUserId: targetUser.user.id,
      reporterId: reporter.user.id
    });

    const response = await request(app)
      .post(`/api/v1/admin/reports/${report.id}/ban-user`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        note: "Repeated abuse confirmed."
      });

    expect(response.status).toBe(200);
    expect(response.body.report).toEqual({
      id: report.id,
      resolvedAt: expect.any(String),
      status: "RESOLVED"
    });
    expect(response.body.moderationAction).toEqual({
      action: "BAN_USER",
      createdAt: expect.any(String),
      id: expect.any(String),
      note: "Repeated abuse confirmed."
    });

    const bannedUser = await prisma.user.findUniqueOrThrow({
      where: { id: targetUser.user.id }
    });
    expect(bannedUser.status).toBe("BANNED");

    const selfReport = await createReportFixture({
      reason: "OTHER",
      reportedUserId: admin.user.id,
      reporterId: reporter.user.id
    });

    const selfBanResponse = await request(app)
      .post(`/api/v1/admin/reports/${selfReport.id}/ban-user`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        note: "Should be rejected."
      });

    expect(selfBanResponse.status).toBe(409);
    expect(selfBanResponse.body.error.code).toBe(
      "MODERATION_SELF_BAN_FORBIDDEN"
    );
    expect(selfBanResponse.body.error.message).toBe(
      "Admins cannot ban their own account."
    );

    const untouchedAdmin = await prisma.user.findUniqueOrThrow({
      where: { id: admin.user.id }
    });
    expect(untouchedAdmin.status).toBe("ACTIVE");
  });

  test("concurrent moderation requests leave one final state and one moderation history record", async () => {
    const firstAdmin = await createUserFixture({
      email: "race-admin-a@example.com",
      role: "ADMIN",
      username: "race_admin_a"
    });
    const secondAdmin = await createUserFixture({
      email: "race-admin-b@example.com",
      role: "ADMIN",
      username: "race_admin_b"
    });
    const reporter = await createUserFixture({
      email: "race-reporter@example.com",
      username: "race_reporter"
    });
    const author = await createUserFixture({
      email: "race-author@example.com",
      username: "race_author"
    });
    const firstAccessToken = await loginAndGetAccessToken(
      firstAdmin.user.email,
      firstAdmin.password
    );
    const secondAccessToken = await loginAndGetAccessToken(
      secondAdmin.user.email,
      secondAdmin.password
    );
    const post = await createPostFixture({
      authorId: author.user.id,
      caption: "Race condition target"
    });
    const report = await createReportFixture({
      reportedPostId: post.id,
      reporterId: reporter.user.id
    });

    const [dismissResponse, hideResponse] = await Promise.all([
      request(app)
        .post(`/api/v1/admin/reports/${report.id}/dismiss`)
        .set("Authorization", `Bearer ${firstAccessToken}`)
        .send({
          note: "No action needed."
        }),
      request(app)
        .post(`/api/v1/admin/reports/${report.id}/hide-content`)
        .set("Authorization", `Bearer ${secondAccessToken}`)
        .send({
          note: "Take post down."
        })
    ]);

    const responses = [dismissResponse, hideResponse];
    const successResponses = responses.filter((response) => response.status === 200);
    const conflictResponses = responses.filter((response) => response.status === 409);

    expect(successResponses).toHaveLength(1);
    expect(conflictResponses).toHaveLength(1);
    expect(conflictResponses[0]?.body.error.code).toBe(
      "MODERATION_REPORT_ALREADY_HANDLED"
    );
    expect(conflictResponses[0]?.body.error.message).toBe(
      "Report is no longer pending moderation."
    );

    const updatedReport = await prisma.report.findUniqueOrThrow({
      where: { id: report.id }
    });
    expect(["DISMISSED", "RESOLVED"]).toContain(updatedReport.status);
    expect(updatedReport.resolvedAt).toEqual(expect.any(Date));

    const moderationActionCount = await prisma.moderationAction.count({
      where: { reportId: report.id }
    });
    const auditLogCount = await prisma.auditLog.count({
      where: { entityType: "REPORT", entityId: report.id }
    });

    expect(moderationActionCount).toBe(1);
    expect(auditLogCount).toBe(1);
  });

  test("OPTIONS /api/v1/admin/reports/:reportId/hide-content returns CORS headers before a browser POST request", async () => {
    const response = await request(app)
      .options("/api/v1/admin/reports/test-report-id/hide-content")
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

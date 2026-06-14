import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDatabaseTables, runRepoScript } from "../test/testDatabase.js";

describe.sequential("database seed", () => {
  beforeAll(async () => {
    const migrateResult = runRepoScript("db:migrate:test");

    expect(migrateResult.status).toBe(0);
  });

  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  afterEach(async () => {
    await resetDatabaseTables(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("seeds safe demo/admin data idempotently", async () => {
    const firstSeed = runRepoScript("db:seed");

    expect(firstSeed.status).toBe(0);

    const [users, posts, comments, likes, follows, reports, moderationActions, auditLogs, refreshTokens] =
      await Promise.all([
        prisma.user.count(),
        prisma.post.count(),
        prisma.comment.count(),
        prisma.like.count(),
        prisma.follow.count(),
        prisma.report.count(),
        prisma.moderationAction.count(),
        prisma.auditLog.count(),
        prisma.refreshToken.count()
      ]);

    expect({
      users,
      posts,
      comments,
      likes,
      follows,
      reports,
      moderationActions,
      auditLogs,
      refreshTokens
    }).toEqual({
      users: 3,
      posts: 2,
      comments: 1,
      likes: 1,
      follows: 1,
      reports: 2,
      moderationActions: 1,
      auditLogs: 2,
      refreshTokens: 0
    });

    const adminUser = await prisma.user.findUnique({
      where: {
        email: "admin@cloneinsta.example"
      }
    });
    const aliceUser = await prisma.user.findUnique({
      where: {
        email: "alice@cloneinsta.example"
      }
    });

    expect(adminUser).toMatchObject({
      email: "admin@cloneinsta.example",
      username: "admin_demo",
      role: "ADMIN",
      status: "ACTIVE"
    });
    expect(adminUser?.passwordHash).toBeTruthy();
    expect(adminUser?.passwordHash).not.toBe("AdminDemo123!");
    expect(adminUser?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(adminUser?.avatarUrl).toMatch(/^data:image\/svg\+xml;/);
    expect(aliceUser?.avatarUrl).toMatch(/^data:image\/svg\+xml;/);

    const pendingReport = await prisma.report.findFirst({
      where: {
        status: "PENDING"
      }
    });

    expect(pendingReport).toMatchObject({
      reason: "SPAM"
    });

    const guestAuditLog = await prisma.auditLog.findFirst({
      where: {
        actorId: null,
        action: "LOGIN_FAILED"
      }
    });

    expect(guestAuditLog).toBeTruthy();

    await prisma.comment.create({
      data: {
        authorId: "10000000-0000-4000-8000-000000000002",
        content: "Local browser smoke comment that the next seed should remove.",
        id: "30000000-0000-4000-8000-000000000099",
        postId: "20000000-0000-4000-8000-000000000001"
      }
    });

    await prisma.like.create({
      data: {
        postId: "20000000-0000-4000-8000-000000000001",
        userId: "10000000-0000-4000-8000-000000000002"
      }
    });

    await prisma.refreshToken.create({
      data: {
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        expiresAt: new Date("2026-06-21T10:00:00.000Z"),
        familyId: "70000000-0000-4000-8000-000000000001",
        id: "70000000-0000-4000-8000-000000000002",
        tokenHash: "browser-smoke-refresh-token-hash",
        userId: "10000000-0000-4000-8000-000000000002"
      }
    });

    const countsAfterLocalMutations = await Promise.all([
      prisma.comment.count(),
      prisma.like.count(),
      prisma.refreshToken.count()
    ]);

    expect(countsAfterLocalMutations).toEqual([2, 2, 1]);

    const secondSeed = runRepoScript("db:seed");

    expect(secondSeed.status).toBe(0);

    const countsAfterSecondSeed = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.like.count(),
      prisma.follow.count(),
      prisma.report.count(),
      prisma.moderationAction.count(),
      prisma.auditLog.count(),
      prisma.refreshToken.count()
    ]);

    expect(countsAfterSecondSeed).toEqual([3, 2, 1, 1, 1, 2, 1, 2, 0]);
  });
});

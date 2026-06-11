import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";

async function insertUser(label: string): Promise<string> {
  const id = randomUUID();
  const suffix = id.replace(/-/g, "").slice(0, 12);

  await prisma.$executeRaw`
    INSERT INTO "User" (
      "id",
      "email",
      "username",
      "passwordHash",
      "displayName",
      "role",
      "status",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id}::uuid,
      ${`${label}-${suffix}@example.com`},
      ${`${label}_${suffix}`},
      ${"hashed-password"},
      ${`${label} user`},
      'USER',
      'ACTIVE',
      NOW(),
      NOW()
    )
  `;

  return id;
}

async function insertPost(authorId: string): Promise<string> {
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "Post" (
      "id",
      "authorId",
      "imageUrl",
      "caption",
      "isHidden",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id}::uuid,
      ${authorId}::uuid,
      ${"https://example.com/post.jpg"},
      ${"schema test post"},
      false,
      NOW(),
      NOW()
    )
  `;

  return id;
}

describe("core Prisma schema", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates the auth, social, and safety tables with key constraints", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'User',
          'RefreshToken',
          'Post',
          'Comment',
          'Like',
          'Follow',
          'Report',
          'ModerationAction',
          'AuditLog'
        )
    `;

    expect(tables.map((table) => table.table_name).sort()).toEqual([
      "AuditLog",
      "Comment",
      "Follow",
      "Like",
      "ModerationAction",
      "Post",
      "RefreshToken",
      "Report",
      "User"
    ]);

    const userUniqueIndexes = await prisma.$queryRaw<
      Array<{ indexdef: string; indexname: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'User'
        AND indexname IN ('User_email_key', 'User_username_key')
    `;

    expect(userUniqueIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexname: "User_email_key",
          indexdef: expect.stringContaining("(email)")
        }),
        expect.objectContaining({
          indexname: "User_username_key",
          indexdef: expect.stringContaining("(username)")
        })
      ])
    );

    const joinPrimaryKeys = await prisma.$queryRaw<
      Array<{ indexdef: string; indexname: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('Like', 'Follow')
        AND indexname IN ('Like_pkey', 'Follow_pkey')
    `;

    expect(joinPrimaryKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexname: "Like_pkey",
          indexdef: expect.stringContaining(`("postId", "userId")`)
        }),
        expect.objectContaining({
          indexname: "Follow_pkey",
          indexdef: expect.stringContaining(`("followerId", "followingId")`)
        })
      ])
    );

    const safetyIndexes = await prisma.$queryRaw<
      Array<{ indexdef: string; indexname: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (
          (tablename = 'Report' AND indexname IN ('Report_status_createdAt_idx', 'Report_reporterId_idx'))
          OR (tablename = 'ModerationAction' AND indexname IN ('ModerationAction_reportId_createdAt_idx', 'ModerationAction_adminId_idx'))
          OR (tablename = 'AuditLog' AND indexname IN ('AuditLog_action_idx', 'AuditLog_entityType_entityId_idx'))
        )
    `;

    expect(safetyIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexname: "Report_status_createdAt_idx",
          indexdef: expect.stringContaining(`(status, "createdAt")`)
        }),
        expect.objectContaining({
          indexname: "Report_reporterId_idx",
          indexdef: expect.stringContaining(`("reporterId")`)
        }),
        expect.objectContaining({
          indexname: "ModerationAction_reportId_createdAt_idx",
          indexdef: expect.stringContaining(`("reportId", "createdAt")`)
        }),
        expect.objectContaining({
          indexname: "ModerationAction_adminId_idx",
          indexdef: expect.stringContaining(`("adminId")`)
        }),
        expect.objectContaining({
          indexname: "AuditLog_action_idx",
          indexdef: expect.stringContaining(`(action)`)
        }),
        expect.objectContaining({
          indexname: "AuditLog_entityType_entityId_idx",
          indexdef: expect.stringContaining(`("entityType", "entityId")`)
        })
      ])
    );
  });

  it("allows exactly one report target and rejects zero or multiple targets", async () => {
    const reporterId = await insertUser("reporter");
    const targetUserId = await insertUser("target");
    const postId = await insertPost(targetUserId);
    const validReportId = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "Report" (
        "id",
        "reporterId",
        "reportedPostId",
        "reason",
        "status",
        "createdAt"
      )
      VALUES (
        ${validReportId}::uuid,
        ${reporterId}::uuid,
        ${postId}::uuid,
        ${"SPAM"},
        'PENDING',
        NOW()
      )
    `;

    const validReports = await prisma.$queryRaw<
      Array<{ id: string; reportedPostId: string }>
    >`
      SELECT "id", "reportedPostId"
      FROM "Report"
      WHERE "id" = ${validReportId}::uuid
    `;

    expect(validReports).toEqual([
      {
        id: validReportId,
        reportedPostId: postId
      }
    ]);

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Report" (
          "id",
          "reporterId",
          "reason",
          "status",
          "createdAt"
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${reporterId}::uuid,
          ${"SPAM"},
          'PENDING',
          NOW()
        )
      `
    ).rejects.toThrow(/Report_exactly_one_target_check/);

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Report" (
          "id",
          "reporterId",
          "reportedPostId",
          "reportedUserId",
          "reason",
          "status",
          "createdAt"
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${reporterId}::uuid,
          ${postId}::uuid,
          ${targetUserId}::uuid,
          ${"ABUSE"},
          'PENDING',
          NOW()
        )
      `
    ).rejects.toThrow(/Report_exactly_one_target_check/);
  });

  it("rejects self-follow rows at the database layer", async () => {
    const userId = await insertUser("self-follow");

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Follow" ("followerId", "followingId", "createdAt")
        VALUES (${userId}::uuid, ${userId}::uuid, NOW())
      `
    ).rejects.toThrow(/Follow_no_self_follow_check/);
  });

  it("preserves audit rows through actor deletion and allows guest events", async () => {
    const guestAuditId = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "AuditLog" (
        "id",
        "actorId",
        "actorMetadata",
        "action",
        "entityType",
        "entityId",
        "ipAddress",
        "userAgent",
        "createdAt"
      )
      VALUES (
        ${guestAuditId}::uuid,
        NULL,
        ${JSON.stringify({ attemptedEmail: "guest@example.com" })}::jsonb,
        ${"LOGIN_FAILED"},
        ${"AUTH"},
        NULL,
        ${"127.0.0.1"},
        ${"vitest"},
        NOW()
      )
    `;

    const guestAuditRows = await prisma.$queryRaw<
      Array<{ actorId: string | null; id: string }>
    >`
      SELECT "id", "actorId"
      FROM "AuditLog"
      WHERE "id" = ${guestAuditId}::uuid
    `;

    expect(guestAuditRows).toEqual([{ id: guestAuditId, actorId: null }]);

    const actorId = await insertUser("audit-actor");
    const actorAuditId = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "AuditLog" (
        "id",
        "actorId",
        "actorMetadata",
        "action",
        "entityType",
        "entityId",
        "ipAddress",
        "userAgent",
        "createdAt"
      )
      VALUES (
        ${actorAuditId}::uuid,
        ${actorId}::uuid,
        ${JSON.stringify({ source: "schema-test" })}::jsonb,
        ${"REPORT_CREATED"},
        ${"REPORT"},
        ${randomUUID()},
        ${"127.0.0.1"},
        ${"vitest"},
        NOW()
      )
    `;

    await prisma.$executeRaw`
      DELETE FROM "User"
      WHERE "id" = ${actorId}::uuid
    `;

    const retainedAuditRows = await prisma.$queryRaw<
      Array<{ actorId: string | null; id: string }>
    >`
      SELECT "id", "actorId"
      FROM "AuditLog"
      WHERE "id" = ${actorAuditId}::uuid
    `;

    expect(retainedAuditRows).toEqual([{ id: actorAuditId, actorId: null }]);
  });
});

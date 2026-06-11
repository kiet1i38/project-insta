import "dotenv/config";
import { hash } from "bcryptjs";
import { prisma } from "../src/db/prisma.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "AdminDemo123!";
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD ?? "UserDemo123!";
const BCRYPT_ROUNDS = 10;

const demoIds = {
  adminUser: "10000000-0000-4000-8000-000000000001",
  aliceUser: "10000000-0000-4000-8000-000000000002",
  bobUser: "10000000-0000-4000-8000-000000000003",
  alicePost: "20000000-0000-4000-8000-000000000001",
  bobPost: "20000000-0000-4000-8000-000000000002",
  bobCommentOnAlicePost: "30000000-0000-4000-8000-000000000001",
  pendingReport: "40000000-0000-4000-8000-000000000001",
  dismissedReport: "40000000-0000-4000-8000-000000000002",
  dismissAction: "50000000-0000-4000-8000-000000000001",
  guestAuditLog: "60000000-0000-4000-8000-000000000001",
  adminAuditLog: "60000000-0000-4000-8000-000000000002"
} as const;

export type SeedSummary = {
  users: number;
  posts: number;
  comments: number;
  likes: number;
  follows: number;
  reports: number;
  moderationActions: number;
  auditLogs: number;
  refreshTokens: number;
};

export async function seedDatabase(client: PrismaClient = prisma): Promise<SeedSummary> {
  const adminPasswordHash = await hash(DEMO_ADMIN_PASSWORD, BCRYPT_ROUNDS);
  const userPasswordHash = await hash(DEMO_USER_PASSWORD, BCRYPT_ROUNDS);

  await client.user.upsert({
    where: { email: "admin@cloneinsta.example" },
    update: {
      username: "admin_demo",
      passwordHash: adminPasswordHash,
      displayName: "CloneInsta Admin",
      bio: "Demo admin account for local moderation checks.",
      avatarUrl: "https://images.example.com/admin-demo.jpg",
      role: "ADMIN",
      status: "ACTIVE"
    },
    create: {
      id: demoIds.adminUser,
      email: "admin@cloneinsta.example",
      username: "admin_demo",
      passwordHash: adminPasswordHash,
      displayName: "CloneInsta Admin",
      bio: "Demo admin account for local moderation checks.",
      avatarUrl: "https://images.example.com/admin-demo.jpg",
      role: "ADMIN",
      status: "ACTIVE"
    }
  });

  await client.user.upsert({
    where: { email: "alice@cloneinsta.example" },
    update: {
      username: "alice_demo",
      passwordHash: userPasswordHash,
      displayName: "Alice Demo",
      bio: "Demo photographer account.",
      avatarUrl: "https://images.example.com/alice-demo.jpg",
      role: "USER",
      status: "ACTIVE"
    },
    create: {
      id: demoIds.aliceUser,
      email: "alice@cloneinsta.example",
      username: "alice_demo",
      passwordHash: userPasswordHash,
      displayName: "Alice Demo",
      bio: "Demo photographer account.",
      avatarUrl: "https://images.example.com/alice-demo.jpg",
      role: "USER",
      status: "ACTIVE"
    }
  });

  await client.user.upsert({
    where: { email: "bob@cloneinsta.example" },
    update: {
      username: "bob_demo",
      passwordHash: userPasswordHash,
      displayName: "Bob Demo",
      bio: "Demo community account.",
      avatarUrl: "https://images.example.com/bob-demo.jpg",
      role: "USER",
      status: "ACTIVE"
    },
    create: {
      id: demoIds.bobUser,
      email: "bob@cloneinsta.example",
      username: "bob_demo",
      passwordHash: userPasswordHash,
      displayName: "Bob Demo",
      bio: "Demo community account.",
      avatarUrl: "https://images.example.com/bob-demo.jpg",
      role: "USER",
      status: "ACTIVE"
    }
  });

  await client.post.upsert({
    where: { id: demoIds.alicePost },
    update: {
      authorId: demoIds.aliceUser,
      imageUrl: "https://images.example.com/alice-post.jpg",
      caption: "Sunrise test post for local feed and moderation demos.",
      isHidden: false,
      deletedAt: null
    },
    create: {
      id: demoIds.alicePost,
      authorId: demoIds.aliceUser,
      imageUrl: "https://images.example.com/alice-post.jpg",
      caption: "Sunrise test post for local feed and moderation demos.",
      isHidden: false
    }
  });

  await client.post.upsert({
    where: { id: demoIds.bobPost },
    update: {
      authorId: demoIds.bobUser,
      imageUrl: "https://images.example.com/bob-post.jpg",
      caption: "City lights sample post for report workflow checks.",
      isHidden: false,
      deletedAt: null
    },
    create: {
      id: demoIds.bobPost,
      authorId: demoIds.bobUser,
      imageUrl: "https://images.example.com/bob-post.jpg",
      caption: "City lights sample post for report workflow checks.",
      isHidden: false
    }
  });

  await client.comment.upsert({
    where: { id: demoIds.bobCommentOnAlicePost },
    update: {
      postId: demoIds.alicePost,
      authorId: demoIds.bobUser,
      content: "Nice framing. Keeping this comment for moderation/report test flows.",
      isHidden: false,
      deletedAt: null
    },
    create: {
      id: demoIds.bobCommentOnAlicePost,
      postId: demoIds.alicePost,
      authorId: demoIds.bobUser,
      content: "Nice framing. Keeping this comment for moderation/report test flows.",
      isHidden: false
    }
  });

  await client.like.upsert({
    where: {
      postId_userId: {
        postId: demoIds.alicePost,
        userId: demoIds.bobUser
      }
    },
    update: {},
    create: {
      postId: demoIds.alicePost,
      userId: demoIds.bobUser
    }
  });

  await client.follow.upsert({
    where: {
      followerId_followingId: {
        followerId: demoIds.bobUser,
        followingId: demoIds.aliceUser
      }
    },
    update: {},
    create: {
      followerId: demoIds.bobUser,
      followingId: demoIds.aliceUser
    }
  });

  await client.report.upsert({
    where: { id: demoIds.pendingReport },
    update: {
      reporterId: demoIds.aliceUser,
      reportedPostId: demoIds.bobPost,
      reportedCommentId: null,
      reportedUserId: null,
      reason: "SPAM",
      status: "PENDING",
      resolvedAt: null
    },
    create: {
      id: demoIds.pendingReport,
      reporterId: demoIds.aliceUser,
      reportedPostId: demoIds.bobPost,
      reason: "SPAM",
      status: "PENDING"
    }
  });

  await client.report.upsert({
    where: { id: demoIds.dismissedReport },
    update: {
      reporterId: demoIds.bobUser,
      reportedPostId: null,
      reportedCommentId: null,
      reportedUserId: demoIds.aliceUser,
      reason: "IMPERSONATION",
      status: "DISMISSED",
      resolvedAt: new Date("2026-06-11T08:00:00.000Z")
    },
    create: {
      id: demoIds.dismissedReport,
      reporterId: demoIds.bobUser,
      reportedUserId: demoIds.aliceUser,
      reason: "IMPERSONATION",
      status: "DISMISSED",
      resolvedAt: new Date("2026-06-11T08:00:00.000Z")
    }
  });

  await client.moderationAction.upsert({
    where: { id: demoIds.dismissAction },
    update: {
      adminId: demoIds.adminUser,
      reportId: demoIds.dismissedReport,
      action: "DISMISS",
      reason: "Demo moderation history row for local dashboard testing."
    },
    create: {
      id: demoIds.dismissAction,
      adminId: demoIds.adminUser,
      reportId: demoIds.dismissedReport,
      action: "DISMISS",
      reason: "Demo moderation history row for local dashboard testing."
    }
  });

  await client.auditLog.upsert({
    where: { id: demoIds.guestAuditLog },
    update: {
      actorId: null,
      actorMetadata: {
        attemptedEmail: "ghost@cloneinsta.example"
      },
      action: "LOGIN_FAILED",
      entityType: "AUTH",
      entityId: null,
      ipAddress: "127.0.0.1",
      userAgent: "demo-seed/guest"
    },
    create: {
      id: demoIds.guestAuditLog,
      actorId: null,
      actorMetadata: {
        attemptedEmail: "ghost@cloneinsta.example"
      },
      action: "LOGIN_FAILED",
      entityType: "AUTH",
      entityId: null,
      ipAddress: "127.0.0.1",
      userAgent: "demo-seed/guest"
    }
  });

  await client.auditLog.upsert({
    where: { id: demoIds.adminAuditLog },
    update: {
      actorId: demoIds.adminUser,
      actorMetadata: {
        reportId: demoIds.dismissedReport,
        moderationActionId: demoIds.dismissAction
      },
      action: "REPORT_DISMISSED",
      entityType: "REPORT",
      entityId: demoIds.dismissedReport,
      ipAddress: "127.0.0.1",
      userAgent: "demo-seed/admin"
    },
    create: {
      id: demoIds.adminAuditLog,
      actorId: demoIds.adminUser,
      actorMetadata: {
        reportId: demoIds.dismissedReport,
        moderationActionId: demoIds.dismissAction
      },
      action: "REPORT_DISMISSED",
      entityType: "REPORT",
      entityId: demoIds.dismissedReport,
      ipAddress: "127.0.0.1",
      userAgent: "demo-seed/admin"
    }
  });

  const [users, posts, comments, likes, follows, reports, moderationActions, auditLogs, refreshTokens] =
    await Promise.all([
      client.user.count(),
      client.post.count(),
      client.comment.count(),
      client.like.count(),
      client.follow.count(),
      client.report.count(),
      client.moderationAction.count(),
      client.auditLog.count(),
      client.refreshToken.count()
    ]);

  return {
    users,
    posts,
    comments,
    likes,
    follows,
    reports,
    moderationActions,
    auditLogs,
    refreshTokens
  };
}

async function runSeedCli(): Promise<void> {
  const summary = await seedDatabase();

  console.log("CloneInsta demo seed completed.");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Demo accounts:");
  console.log(`- admin_demo / ${DEMO_ADMIN_PASSWORD} (admin@cloneinsta.example)`);
  console.log(`- alice_demo / ${DEMO_USER_PASSWORD} (alice@cloneinsta.example)`);
  console.log(`- bob_demo / ${DEMO_USER_PASSWORD} (bob@cloneinsta.example)`);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  runSeedCli()
    .catch((error) => {
      console.error("CloneInsta demo seed failed.");
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

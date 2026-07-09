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

const demoUserIds = [
  demoIds.adminUser,
  demoIds.aliceUser,
  demoIds.bobUser
] as const;

const demoPostIds = [demoIds.alicePost, demoIds.bobPost] as const;

const demoReportIds = [demoIds.pendingReport, demoIds.dismissedReport] as const;

function createDemoAvatarDataUrl(initials: string, background: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${initials} avatar">
      <rect width="160" height="160" rx="36" fill="${background}" />
      <text
        x="50%"
        y="55%"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="56"
        fill="#ffffff"
      >
        ${initials}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createDemoPostImageDataUrl(input: {
  accent: string;
  backgroundEnd: string;
  backgroundStart: string;
  label: string;
  title: string;
}): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-label="${input.title} demo post">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${input.backgroundStart}" />
          <stop offset="100%" stop-color="${input.backgroundEnd}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="1200" rx="96" fill="url(#bg)" />
      <circle cx="920" cy="248" r="120" fill="rgba(255,255,255,0.28)" />
      <path d="M0 860 C180 760 320 720 470 760 C650 806 770 918 1200 780 L1200 1200 L0 1200 Z" fill="rgba(15,23,42,0.22)" />
      <path d="M0 930 C210 840 350 810 520 860 C710 918 840 1030 1200 900 L1200 1200 L0 1200 Z" fill="${input.accent}" />
      <rect x="92" y="90" width="214" height="58" rx="29" fill="rgba(255,255,255,0.18)" />
      <text
        x="199"
        y="127"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="28"
        font-weight="700"
        fill="#ffffff"
      >
        ${input.label}
      </text>
      <text
        x="96"
        y="1010"
        font-family="Arial, Helvetica, sans-serif"
        font-size="84"
        font-weight="700"
        fill="#ffffff"
      >
        ${input.title}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const demoAvatarUrls = {
  admin: createDemoAvatarDataUrl("AD", "#0f172a"),
  alice: createDemoAvatarDataUrl("AL", "#2563eb"),
  bob: createDemoAvatarDataUrl("BO", "#0f766e")
} as const;

const demoPostImageUrls = {
  alice: createDemoPostImageDataUrl({
    accent: "#2563eb",
    backgroundEnd: "#0f172a",
    backgroundStart: "#f97316",
    label: "Alice Demo",
    title: "Sunrise"
  }),
  bob: createDemoPostImageDataUrl({
    accent: "#0f766e",
    backgroundEnd: "#111827",
    backgroundStart: "#7c3aed",
    label: "Bob Demo",
    title: "City Lights"
  })
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

  await client.$transaction(async (tx) => {
    const demoConversationParticipants =
      await tx.conversationParticipant.findMany({
        select: {
          conversationId: true
        },
        where: {
          userId: { in: demoUserIds as unknown as string[] }
        }
      });
    const demoConversationIds = [
      ...new Set(
        demoConversationParticipants.map((participant) => participant.conversationId)
      )
    ];

    await tx.moderationAction.deleteMany({
      where: {
        OR: [
          { adminId: { in: demoUserIds as unknown as string[] } },
          { id: demoIds.dismissAction },
          { reportId: { in: demoReportIds as unknown as string[] } }
        ]
      }
    });

    await tx.report.deleteMany({
      where: {
        OR: [
          { id: { in: demoReportIds as unknown as string[] } },
          { reporterId: { in: demoUserIds as unknown as string[] } },
          { reportedPostId: { in: demoPostIds as unknown as string[] } },
          { reportedUserId: { in: demoUserIds as unknown as string[] } }
        ]
      }
    });

    await Promise.all([
      demoConversationIds.length > 0
        ? tx.conversationReadState.deleteMany({
            where: {
              conversationId: { in: demoConversationIds }
            }
          })
        : Promise.resolve({ count: 0 }),
      demoConversationIds.length > 0
        ? tx.message.deleteMany({
            where: {
              conversationId: { in: demoConversationIds }
            }
          })
        : Promise.resolve({ count: 0 }),
      demoConversationIds.length > 0
        ? tx.conversationParticipant.deleteMany({
            where: {
              conversationId: { in: demoConversationIds }
            }
          })
        : Promise.resolve({ count: 0 }),
      demoConversationIds.length > 0
        ? tx.conversation.deleteMany({
            where: {
              id: { in: demoConversationIds }
            }
          })
        : Promise.resolve({ count: 0 }),
      tx.like.deleteMany({
        where: {
          OR: [
            { postId: { in: demoPostIds as unknown as string[] } },
            { userId: { in: demoUserIds as unknown as string[] } }
          ]
        }
      }),
      tx.comment.deleteMany({
        where: {
          OR: [
            { postId: { in: demoPostIds as unknown as string[] } },
            { authorId: { in: demoUserIds as unknown as string[] } }
          ]
        }
      }),
      tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: { in: demoUserIds as unknown as string[] } },
            { followingId: { in: demoUserIds as unknown as string[] } }
          ]
        }
      }),
      tx.refreshToken.deleteMany({
        where: {
          userId: { in: demoUserIds as unknown as string[] }
        }
      }),
      tx.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: demoUserIds as unknown as string[] } },
            {
              id: {
                in: [
                  demoIds.guestAuditLog,
                  demoIds.adminAuditLog
                ]
              }
            }
          ]
        }
      })
    ]);

    await tx.post.deleteMany({
      where: {
        authorId: { in: demoUserIds as unknown as string[] },
        id: { notIn: demoPostIds as unknown as string[] }
      }
    });
  });

  await client.user.upsert({
    where: { email: "admin@cloneinsta.example" },
    update: {
      username: "admin_demo",
      passwordHash: adminPasswordHash,
      displayName: "CloneInsta Admin",
      bio: "Demo admin account for local moderation checks.",
      avatarUrl: demoAvatarUrls.admin,
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
      avatarUrl: demoAvatarUrls.admin,
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
      avatarUrl: demoAvatarUrls.alice,
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
      avatarUrl: demoAvatarUrls.alice,
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
      avatarUrl: demoAvatarUrls.bob,
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
      avatarUrl: demoAvatarUrls.bob,
      role: "USER",
      status: "ACTIVE"
    }
  });

  await client.post.upsert({
    where: { id: demoIds.alicePost },
    update: {
      authorId: demoIds.aliceUser,
      imageUrl: demoPostImageUrls.alice,
      caption: "Sunrise test post for local feed and moderation demos.",
      isHidden: false,
      deletedAt: null
    },
    create: {
      id: demoIds.alicePost,
      authorId: demoIds.aliceUser,
      imageUrl: demoPostImageUrls.alice,
      caption: "Sunrise test post for local feed and moderation demos.",
      isHidden: false
    }
  });

  await client.post.upsert({
    where: { id: demoIds.bobPost },
    update: {
      authorId: demoIds.bobUser,
      imageUrl: demoPostImageUrls.bob,
      caption: "City lights sample post for report workflow checks.",
      isHidden: false,
      deletedAt: null
    },
    create: {
      id: demoIds.bobPost,
      authorId: demoIds.bobUser,
      imageUrl: demoPostImageUrls.bob,
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

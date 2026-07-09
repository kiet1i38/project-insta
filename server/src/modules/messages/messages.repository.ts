import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type {
  ConversationFolderInput,
  ConversationCursor,
  MessageCursor
} from "./messages.schema.js";

const conversationPeerSelect = {
  avatarUrl: true,
  displayName: true,
  id: true,
  username: true
} satisfies Prisma.UserSelect;

const followedPeerSelect = {
  followerId: true
} satisfies Prisma.FollowSelect;

const conversationMessagePreviewSelect = {
  content: true,
  createdAt: true,
  id: true,
  senderId: true
} satisfies Prisma.MessageSelect;

const buildConversationSummaryPeerSelect = (viewerId: string) =>
  ({
    avatarUrl: true,
    displayName: true,
    followers: {
      select: followedPeerSelect,
      take: 1,
      where: {
        followerId: viewerId
      }
    },
    id: true,
    username: true
  }) satisfies Prisma.UserSelect;

const buildConversationSummarySelect = (viewerId: string) =>
  ({
    _count: {
      select: {
        messages: {
          where: {
            senderId: viewerId
          }
        }
      }
    },
    id: true,
    updatedAt: true,
    participants: {
      select: {
        user: {
          select: buildConversationSummaryPeerSelect(viewerId)
        },
        userId: true
      }
    },
    messages: {
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: conversationMessagePreviewSelect,
      take: 1
    },
    readStates: {
      select: {
        lastReadAt: true,
        lastReadMessageId: true
      },
      where: {
        userId: viewerId
      }
    }
  }) satisfies Prisma.ConversationSelect;

export type ConversationSummaryRecord = Prisma.ConversationGetPayload<{
  select: ReturnType<typeof buildConversationSummarySelect>;
}>;

const threadMessageSelect = {
  clientMessageId: true,
  content: true,
  conversationId: true,
  createdAt: true,
  id: true,
  sender: {
    select: conversationPeerSelect
  },
  senderId: true
} satisfies Prisma.MessageSelect;

export type ThreadMessageRecord = Prisma.MessageGetPayload<{
  select: typeof threadMessageSelect;
}>;

const activeConversationPeerSelect = conversationPeerSelect satisfies Prisma.UserSelect;

export type ActiveConversationPeerRecord = Prisma.UserGetPayload<{
  select: typeof activeConversationPeerSelect;
}>;

function buildRequestConversationWhereClause(
  viewerId: string
): Prisma.ConversationWhereInput {
  return {
    AND: [
      {
        messages: {
          some: {
            senderId: {
              not: viewerId
            }
          }
        }
      },
      {
        messages: {
          none: {
            senderId: viewerId
          }
        }
      },
      {
        participants: {
          none: {
            user: {
              followers: {
                some: {
                  followerId: viewerId
                }
              }
            }
          }
        }
      }
    ]
  };
}

function buildConversationCursorWhereClause(
  cursor?: ConversationCursor
): Prisma.ConversationWhereInput | undefined {
  if (!cursor) {
    return undefined;
  }

  return {
    OR: [
      {
        updatedAt: {
          lt: cursor.updatedAt
        }
      },
      {
        AND: [
          {
            updatedAt: cursor.updatedAt
          },
          {
            id: {
              lt: cursor.id
            }
          }
        ]
      }
    ]
  };
}

function buildMessageCursorWhereClause(
  cursor?: MessageCursor
): Prisma.MessageWhereInput | undefined {
  if (!cursor) {
    return undefined;
  }

  return {
    OR: [
      {
        createdAt: {
          lt: cursor.createdAt
        }
      },
      {
        AND: [
          {
            createdAt: cursor.createdAt
          },
          {
            id: {
              lt: cursor.id
            }
          }
        ]
      }
    ]
  };
}

export async function findActiveConversationPeerById(
  userId: string
): Promise<ActiveConversationPeerRecord | null> {
  return prisma.user.findFirst({
    select: activeConversationPeerSelect,
    where: {
      id: userId,
      status: "ACTIVE"
    }
  });
}

export async function findConversationSummaryByDirectKeyForUser(input: {
  directKey: string;
  viewerId: string;
}): Promise<ConversationSummaryRecord | null> {
  return prisma.conversation.findFirst({
    select: buildConversationSummarySelect(input.viewerId),
    where: {
      directKey: input.directKey,
      participants: {
        some: {
          userId: input.viewerId
        }
      }
    }
  });
}

export async function findConversationSummaryByIdForUser(input: {
  conversationId: string;
  viewerId: string;
}): Promise<ConversationSummaryRecord | null> {
  return prisma.conversation.findFirst({
    select: buildConversationSummarySelect(input.viewerId),
    where: {
      id: input.conversationId,
      participants: {
        some: {
          userId: input.viewerId
        }
      }
    }
  });
}

export async function createDirectConversationRecord(input: {
  directKey: string;
  participantUserIds: [string, string];
}) {
  return prisma.conversation.create({
    data: {
      directKey: input.directKey,
      participants: {
        create: input.participantUserIds.map((userId) => ({
          userId
        }))
      },
      readStates: {
        create: input.participantUserIds.map((userId) => ({
          userId
        }))
      }
    },
    select: {
      id: true
    }
  });
}

export async function findConversationRoomIdsForUser(userId: string): Promise<string[]> {
  const conversationParticipants = await prisma.conversationParticipant.findMany({
    select: {
      conversationId: true
    },
    where: {
      userId
    }
  });

  return conversationParticipants.map((participant) => participant.conversationId);
}

export async function findConversationSummariesForUser(input: {
  cursor?: ConversationCursor;
  folder: ConversationFolderInput;
  limit: number;
  viewerId: string;
}): Promise<ConversationSummaryRecord[]> {
  const paginationFilter = buildConversationCursorWhereClause(input.cursor);
  const requestConversationFilter = buildRequestConversationWhereClause(
    input.viewerId
  );
  const folderFilter =
    input.folder === "requests"
      ? requestConversationFilter
      : {
          NOT: requestConversationFilter
        };

  return prisma.conversation.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: buildConversationSummarySelect(input.viewerId),
    take: input.limit + 1,
    where: {
      AND: [
        {
          participants: {
            some: {
              userId: input.viewerId
            }
          }
        },
        folderFilter,
        ...(paginationFilter ? [paginationFilter] : [])
      ]
    }
  });
}

export async function countUnreadMessagesForConversation(input: {
  conversationId: string;
  lastReadAt: Date | null;
  viewerId: string;
}) {
  return prisma.message.count({
    where: {
      conversationId: input.conversationId,
      ...(input.lastReadAt
        ? {
            createdAt: {
              gt: input.lastReadAt
            }
          }
        : {}),
      senderId: {
        not: input.viewerId
      }
    }
  });
}

export async function findConversationMessagesForUser(input: {
  conversationId: string;
  cursor?: MessageCursor;
  limit: number;
  viewerId: string;
}): Promise<ThreadMessageRecord[]> {
  const paginationFilter = buildMessageCursorWhereClause(input.cursor);

  return prisma.message.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: threadMessageSelect,
    take: input.limit + 1,
    where: {
      AND: [
        {
          conversationId: input.conversationId,
          conversation: {
            participants: {
              some: {
                userId: input.viewerId
              }
            }
          }
        },
        ...(paginationFilter ? [paginationFilter] : [])
      ]
    }
  });
}

export async function findConversationMessageByIdForUser(input: {
  conversationId: string;
  messageId: string;
  viewerId: string;
}): Promise<ThreadMessageRecord | null> {
  return prisma.message.findFirst({
    select: threadMessageSelect,
    where: {
      conversationId: input.conversationId,
      conversation: {
        participants: {
          some: {
            userId: input.viewerId
          }
        }
      },
      id: input.messageId
    }
  });
}

export async function createConversationMessageRecord(input: {
  clientMessageId?: string;
  content: string;
  conversationId: string;
  rateLimit?: {
    createdAfter: Date;
    max: number;
  };
  senderId: string;
}): Promise<
  | { state: "created"; message: ThreadMessageRecord }
  | { state: "existing"; message: ThreadMessageRecord }
  | { recentMessageCount: number; state: "rate_limited" }
> {
  return prisma.$transaction(async (tx) => {
    if (input.clientMessageId) {
      const existingMessage = await tx.message.findFirst({
        select: threadMessageSelect,
        where: {
          clientMessageId: input.clientMessageId,
          conversationId: input.conversationId,
          senderId: input.senderId
        }
      });

      if (existingMessage) {
        return {
          state: "existing" as const,
          message: existingMessage
        };
      }
    }

    if (input.rateLimit) {
      const recentMessageCount = await tx.message.count({
        where: {
          createdAt: {
            gte: input.rateLimit.createdAfter
          },
          senderId: input.senderId
        }
      });

      if (recentMessageCount >= input.rateLimit.max) {
        return {
          recentMessageCount,
          state: "rate_limited" as const
        };
      }
    }

    let message: ThreadMessageRecord;

    try {
      message = await tx.message.create({
        data: {
          clientMessageId: input.clientMessageId,
          content: input.content,
          conversationId: input.conversationId,
          senderId: input.senderId
        },
        select: threadMessageSelect
      });
    } catch (error) {
      if (!input.clientMessageId || !isMessageClientKeyUniqueConflict(error)) {
        throw error;
      }

      const existingMessage = await tx.message.findFirst({
        select: threadMessageSelect,
        where: {
          clientMessageId: input.clientMessageId,
          conversationId: input.conversationId,
          senderId: input.senderId
        }
      });

      if (!existingMessage) {
        throw error;
      }

      return {
        state: "existing" as const,
        message: existingMessage
      };
    }

    await tx.conversation.update({
      data: {
        updatedAt: message.createdAt
      },
      where: {
        id: input.conversationId
      }
    });

    await tx.conversationReadState.upsert({
      create: {
        conversationId: input.conversationId,
        lastReadAt: message.createdAt,
        lastReadMessageId: message.id,
        userId: input.senderId
      },
      update: {
        lastReadAt: message.createdAt,
        lastReadMessageId: message.id
      },
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.senderId
        }
      }
    });

    return {
      state: "created" as const,
      message
    };
  });
}

export async function createConversationAuditLogRecord(input: {
  action: string;
  actorId: string;
  actorMetadata: Prisma.InputJsonValue;
  entityId: string;
  entityType: string;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  return prisma.auditLog.create({
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

export async function upsertConversationReadState(input: {
  conversationId: string;
  lastReadAt: Date;
  lastReadMessageId: string;
  userId: string;
}) {
  return prisma.conversationReadState.upsert({
    create: {
      conversationId: input.conversationId,
      lastReadAt: input.lastReadAt,
      lastReadMessageId: input.lastReadMessageId,
      userId: input.userId
    },
    update: {
      lastReadAt: input.lastReadAt,
      lastReadMessageId: input.lastReadMessageId
    },
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.userId
      }
    }
  });
}

export function isConversationDirectKeyUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (error.meta?.modelName === "Conversation" ||
      (Array.isArray(error.meta?.target) && error.meta.target.includes("directKey")))
  );
}

export function isMessageClientKeyUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("conversationId") &&
    error.meta.target.includes("senderId") &&
    error.meta.target.includes("clientMessageId")
  );
}

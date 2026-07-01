import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type {
  ConversationCursor,
  MessageCursor
} from "./messages.schema.js";

const conversationPeerSelect = {
  avatarUrl: true,
  displayName: true,
  id: true,
  username: true
} satisfies Prisma.UserSelect;

const conversationMessagePreviewSelect = {
  content: true,
  createdAt: true,
  id: true,
  senderId: true
} satisfies Prisma.MessageSelect;

const buildConversationSummarySelect = (viewerId: string) =>
  ({
    id: true,
    updatedAt: true,
    participants: {
      select: {
        user: {
          select: conversationPeerSelect
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

export async function findConversationSummariesForUser(input: {
  cursor?: ConversationCursor;
  limit: number;
  viewerId: string;
}): Promise<ConversationSummaryRecord[]> {
  const paginationFilter = buildConversationCursorWhereClause(input.cursor);

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
  content: string;
  conversationId: string;
  senderId: string;
}): Promise<ThreadMessageRecord> {
  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        content: input.content,
        conversationId: input.conversationId,
        senderId: input.senderId
      },
      select: threadMessageSelect
    });

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

    return message;
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

import { AppError } from "../../lib/appError.js";
import type {
  CreateConversationMessageInput,
  ListConversationMessagesQueryInput,
  ListConversationsQueryInput,
  MarkConversationReadInput
} from "./messages.schema.js";
import {
  countUnreadMessagesForConversation,
  createConversationMessageRecord,
  createDirectConversationRecord,
  findActiveConversationPeerById,
  findConversationMessageByIdForUser,
  findConversationMessagesForUser,
  findConversationSummariesForUser,
  findConversationSummaryByDirectKeyForUser,
  findConversationSummaryByIdForUser,
  isConversationDirectKeyUniqueConflict,
  type ConversationSummaryRecord,
  type ThreadMessageRecord,
  upsertConversationReadState
} from "./messages.repository.js";

type ConversationPeerDto = {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
};

type ConversationMessagePreviewDto = {
  content: string;
  createdAt: Date;
  id: string;
  senderId: string;
};

type ConversationSummaryDto = {
  id: string;
  lastMessage: ConversationMessagePreviewDto | null;
  peer: ConversationPeerDto;
  unreadCount: number;
  updatedAt: Date;
};

type ConversationPageDto = {
  conversations: ConversationSummaryDto[];
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
};

type ConversationMessageDto = {
  content: string;
  conversationId: string;
  createdAt: Date;
  id: string;
  sender: ConversationPeerDto;
};

type ConversationThreadDto = {
  conversation: {
    id: string;
    peer: ConversationPeerDto;
  };
  messages: ConversationMessageDto[];
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
  readState: {
    conversationId: string;
    lastReadAt: Date | null;
    lastReadMessageId: string | null;
  };
};

type ConversationReadStateDto = {
  conversationId: string;
  lastReadAt: Date | null;
  lastReadMessageId: string | null;
};

function buildDirectConversationKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join(":");
}

function createUserNotFoundError(): AppError {
  return new AppError(404, "USER_NOT_FOUND", "User not found.");
}

function createConversationNotFoundError(): AppError {
  return new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
}

function createMessageNotFoundError(): AppError {
  return new AppError(404, "MESSAGE_NOT_FOUND", "Message not found.");
}

function createSelfConversationError(): AppError {
  return new AppError(
    400,
    "DIRECT_CONVERSATION_SELF_NOT_ALLOWED",
    "Users cannot start a direct conversation with themselves."
  );
}

function encodeConversationCursor(record: ConversationSummaryRecord): string {
  return Buffer.from(
    JSON.stringify({
      id: record.id,
      updatedAt: record.updatedAt.toISOString()
    }),
    "utf8"
  ).toString("base64url");
}

function encodeMessageCursor(record: ThreadMessageRecord): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: record.createdAt.toISOString(),
      id: record.id
    }),
    "utf8"
  ).toString("base64url");
}

function getConversationPeerOrThrow(
  participants: ConversationSummaryRecord["participants"],
  viewerId: string
): ConversationPeerDto {
  const peer = participants.find((participant) => participant.userId !== viewerId)?.user;

  if (!peer) {
    throw new Error("Conversation peer is missing.");
  }

  return {
    avatarUrl: peer.avatarUrl,
    displayName: peer.displayName,
    id: peer.id,
    username: peer.username
  };
}

function toConversationMessageDto(record: ThreadMessageRecord): ConversationMessageDto {
  return {
    content: record.content,
    conversationId: record.conversationId,
    createdAt: record.createdAt,
    id: record.id,
    sender: {
      avatarUrl: record.sender.avatarUrl,
      displayName: record.sender.displayName,
      id: record.sender.id,
      username: record.sender.username
    }
  };
}

async function toConversationSummaryDto(
  record: ConversationSummaryRecord,
  viewerId: string
): Promise<ConversationSummaryDto> {
  const lastMessage = record.messages[0] ?? null;
  const viewerReadState = record.readStates[0] ?? null;
  const unreadCount = await countUnreadMessagesForConversation({
    conversationId: record.id,
    lastReadAt: viewerReadState?.lastReadAt ?? null,
    viewerId
  });

  return {
    id: record.id,
    lastMessage: lastMessage
      ? {
          content: lastMessage.content,
          createdAt: lastMessage.createdAt,
          id: lastMessage.id,
          senderId: lastMessage.senderId
        }
      : null,
    peer: getConversationPeerOrThrow(record.participants, viewerId),
    unreadCount,
    updatedAt: record.updatedAt
  };
}

export async function createDirectConversation(input: {
  participantUserId: string;
  viewerId: string;
}): Promise<{ conversation: ConversationSummaryDto; created: boolean }> {
  if (input.viewerId === input.participantUserId) {
    throw createSelfConversationError();
  }

  const peer = await findActiveConversationPeerById(input.participantUserId);

  if (!peer) {
    throw createUserNotFoundError();
  }

  const directKey = buildDirectConversationKey(input.viewerId, input.participantUserId);
  const existingConversation = await findConversationSummaryByDirectKeyForUser({
    directKey,
    viewerId: input.viewerId
  });

  if (existingConversation) {
    return {
      conversation: await toConversationSummaryDto(existingConversation, input.viewerId),
      created: false
    };
  }

  let created = true;

  try {
    await createDirectConversationRecord({
      directKey,
      participantUserIds: [input.viewerId, input.participantUserId]
    });
  } catch (error) {
    if (!isConversationDirectKeyUniqueConflict(error)) {
      throw error;
    }

    created = false;
  }

  const createdConversation = await findConversationSummaryByDirectKeyForUser({
    directKey,
    viewerId: input.viewerId
  });

  if (!createdConversation) {
    throw createConversationNotFoundError();
  }

  return {
    conversation: await toConversationSummaryDto(createdConversation, input.viewerId),
    created
  };
}

export async function listConversations(input: {
  query: ListConversationsQueryInput;
  viewerId: string;
}): Promise<ConversationPageDto> {
  const fetchedConversations = await findConversationSummariesForUser({
    cursor: input.query.cursor,
    limit: input.query.limit,
    viewerId: input.viewerId
  });
  const hasNextPage = fetchedConversations.length > input.query.limit;
  const visibleConversations = hasNextPage
    ? fetchedConversations.slice(0, input.query.limit)
    : fetchedConversations;
  const lastVisibleConversation = visibleConversations.at(-1) ?? null;
  const conversations = await Promise.all(
    visibleConversations.map((conversation) =>
      toConversationSummaryDto(conversation, input.viewerId)
    )
  );

  return {
    conversations,
    pageInfo: {
      hasNextPage,
      limit: input.query.limit,
      nextCursor:
        hasNextPage && lastVisibleConversation
          ? encodeConversationCursor(lastVisibleConversation)
          : null
    }
  };
}

export async function getConversationMessages(input: {
  conversationId: string;
  query: ListConversationMessagesQueryInput;
  viewerId: string;
}): Promise<ConversationThreadDto> {
  const conversation = await findConversationSummaryByIdForUser({
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });

  if (!conversation) {
    throw createConversationNotFoundError();
  }

  const fetchedMessages = await findConversationMessagesForUser({
    conversationId: input.conversationId,
    cursor: input.query.cursor,
    limit: input.query.limit,
    viewerId: input.viewerId
  });
  const hasNextPage = fetchedMessages.length > input.query.limit;
  const visibleMessages = hasNextPage
    ? fetchedMessages.slice(0, input.query.limit)
    : fetchedMessages;
  const lastVisibleMessage = visibleMessages.at(-1) ?? null;
  const viewerReadState = conversation.readStates[0] ?? null;

  return {
    conversation: {
      id: conversation.id,
      peer: getConversationPeerOrThrow(conversation.participants, input.viewerId)
    },
    messages: visibleMessages.map(toConversationMessageDto),
    pageInfo: {
      hasNextPage,
      limit: input.query.limit,
      nextCursor: hasNextPage && lastVisibleMessage ? encodeMessageCursor(lastVisibleMessage) : null
    },
    readState: {
      conversationId: conversation.id,
      lastReadAt: viewerReadState?.lastReadAt ?? null,
      lastReadMessageId: viewerReadState?.lastReadMessageId ?? null
    }
  };
}

export async function createConversationMessage(input: {
  body: CreateConversationMessageInput;
  conversationId: string;
  viewerId: string;
}): Promise<ConversationMessageDto> {
  const conversation = await findConversationSummaryByIdForUser({
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });

  if (!conversation) {
    throw createConversationNotFoundError();
  }

  const createdMessage = await createConversationMessageRecord({
    content: input.body.content,
    conversationId: input.conversationId,
    senderId: input.viewerId
  });

  return toConversationMessageDto(createdMessage);
}

export async function markConversationRead(input: {
  body: MarkConversationReadInput;
  conversationId: string;
  viewerId: string;
}): Promise<ConversationReadStateDto> {
  const conversation = await findConversationSummaryByIdForUser({
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });

  if (!conversation) {
    throw createConversationNotFoundError();
  }

  const targetMessage = await findConversationMessageByIdForUser({
    conversationId: input.conversationId,
    messageId: input.body.messageId,
    viewerId: input.viewerId
  });

  if (!targetMessage) {
    throw createMessageNotFoundError();
  }

  const currentReadState = conversation.readStates[0] ?? null;

  if (
    currentReadState?.lastReadAt &&
    targetMessage.createdAt <= currentReadState.lastReadAt
  ) {
    return {
      conversationId: input.conversationId,
      lastReadAt: currentReadState.lastReadAt,
      lastReadMessageId: currentReadState.lastReadMessageId
    };
  }

  const updatedReadState = await upsertConversationReadState({
    conversationId: input.conversationId,
    lastReadAt: targetMessage.createdAt,
    lastReadMessageId: targetMessage.id,
    userId: input.viewerId
  });

  return {
    conversationId: updatedReadState.conversationId,
    lastReadAt: updatedReadState.lastReadAt,
    lastReadMessageId: updatedReadState.lastReadMessageId
  };
}

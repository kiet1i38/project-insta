import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/appError.js";
import type {
  CreateConversationMessageInput,
  ListConversationMessagesQueryInput,
  ListConversationsQueryInput,
  MarkConversationReadInput
} from "./messages.schema.js";
import {
  countUnreadMessagesForConversation,
  createConversationAuditLogRecord,
  createConversationMessageRecord,
  createDirectConversationRecord,
  findActiveConversationPeerById,
  findConversationMessageByIdForUser,
  findConversationMessagesForUser,
  findConversationRoomIdsForUser,
  findConversationSummariesForUser,
  findConversationSummaryByDirectKeyForUser,
  findConversationSummaryByIdForUser,
  isConversationDirectKeyUniqueConflict,
  type ConversationSummaryRecord,
  type ThreadMessageRecord,
  upsertConversationReadState
} from "./messages.repository.js";

export const MESSAGE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const MESSAGE_RATE_LIMIT_MAX = 20;

export type ConversationPeerDto = {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
};

export type ConversationMessagePreviewDto = {
  content: string;
  createdAt: Date;
  id: string;
  senderId: string;
};

export type ConversationSummaryDto = {
  id: string;
  lastMessage: ConversationMessagePreviewDto | null;
  peer: ConversationPeerDto;
  unreadCount: number;
  updatedAt: Date;
};

export type ConversationPageDto = {
  conversations: ConversationSummaryDto[];
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
};

export type ConversationMessageDto = {
  content: string;
  conversationId: string;
  createdAt: Date;
  id: string;
  sender: ConversationPeerDto;
};

export type ConversationThreadDto = {
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

export type ConversationReadStateDto = {
  conversationId: string;
  lastReadAt: Date | null;
  lastReadMessageId: string | null;
};

type ConversationMessageAuditContext = {
  ipAddress: string | null;
  transport: "REST" | "REALTIME";
  userAgent: string | null;
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

function createMessageRateLimitedError(): AppError {
  return new AppError(
    429,
    "MESSAGE_RATE_LIMITED",
    "Too many messages sent recently. Please try again later."
  );
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

async function getConversationSummaryRecordOrThrow(input: {
  conversationId: string;
  viewerId: string;
}): Promise<ConversationSummaryRecord> {
  const conversation = await findConversationSummaryByIdForUser({
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });

  if (!conversation) {
    throw createConversationNotFoundError();
  }

  return conversation;
}

function toConversationReadStateDto(
  conversationId: string,
  input: {
    lastReadAt: Date | null;
    lastReadMessageId: string | null;
  }
): ConversationReadStateDto {
  return {
    conversationId,
    lastReadAt: input.lastReadAt,
    lastReadMessageId: input.lastReadMessageId
  };
}

function getConversationParticipantUserIds(
  participants: ConversationSummaryRecord["participants"]
) {
  return participants.map((participant) => participant.userId);
}

async function createConversationMessageRateLimitAuditLog(input: {
  auditContext: ConversationMessageAuditContext;
  conversationId: string;
  recentMessageCount: number;
  viewerId: string;
}) {
  const actorMetadata = {
    conversationId: input.conversationId,
    rateLimitMax: MESSAGE_RATE_LIMIT_MAX,
    rateLimitWindowMs: MESSAGE_RATE_LIMIT_WINDOW_MS,
    recentMessageCount: input.recentMessageCount,
    transport: input.auditContext.transport
  } satisfies Prisma.InputJsonValue;

  await createConversationAuditLogRecord({
    action: "MESSAGE_RATE_LIMIT_TRIGGERED",
    actorId: input.viewerId,
    actorMetadata,
    entityId: input.conversationId,
    entityType: "CONVERSATION",
    ipAddress: input.auditContext.ipAddress,
    userAgent: input.auditContext.userAgent
  });
}

async function createConversationMessageInternal(input: {
  auditContext: ConversationMessageAuditContext;
  body: CreateConversationMessageInput & {
    clientMessageId?: string;
  };
  conversationId: string;
  viewerId: string;
}): Promise<{
  created: boolean;
  message: ConversationMessageDto;
  participantUserIds: string[];
}> {
  const conversation = await getConversationSummaryRecordOrThrow({
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });
  const createdMessage = await createConversationMessageRecord({
    clientMessageId: input.body.clientMessageId,
    content: input.body.content,
    conversationId: input.conversationId,
    rateLimit: {
      createdAfter: new Date(Date.now() - MESSAGE_RATE_LIMIT_WINDOW_MS),
      max: MESSAGE_RATE_LIMIT_MAX
    },
    senderId: input.viewerId
  });

  if (createdMessage.state === "rate_limited") {
    await createConversationMessageRateLimitAuditLog({
      auditContext: input.auditContext,
      conversationId: input.conversationId,
      recentMessageCount: createdMessage.recentMessageCount,
      viewerId: input.viewerId
    });
    throw createMessageRateLimitedError();
  }

  return {
    created: createdMessage.state === "created",
    message: toConversationMessageDto(createdMessage.message),
    participantUserIds: getConversationParticipantUserIds(
      conversation.participants
    )
  };
}

async function buildConversationThreadDto(input: {
  conversation: ConversationSummaryRecord;
  query: ListConversationMessagesQueryInput;
  viewerId: string;
}): Promise<ConversationThreadDto> {
  const fetchedMessages = await findConversationMessagesForUser({
    conversationId: input.conversation.id,
    cursor: input.query.cursor,
    limit: input.query.limit,
    viewerId: input.viewerId
  });
  const hasNextPage = fetchedMessages.length > input.query.limit;
  const visibleMessages = hasNextPage
    ? fetchedMessages.slice(0, input.query.limit)
    : fetchedMessages;
  const lastVisibleMessage = visibleMessages.at(-1) ?? null;
  const viewerReadState = input.conversation.readStates[0] ?? null;

  return {
    conversation: {
      id: input.conversation.id,
      peer: getConversationPeerOrThrow(input.conversation.participants, input.viewerId)
    },
    messages: visibleMessages.map(toConversationMessageDto),
    pageInfo: {
      hasNextPage,
      limit: input.query.limit,
      nextCursor: hasNextPage && lastVisibleMessage ? encodeMessageCursor(lastVisibleMessage) : null
    },
    readState: toConversationReadStateDto(input.conversation.id, {
      lastReadAt: viewerReadState?.lastReadAt ?? null,
      lastReadMessageId: viewerReadState?.lastReadMessageId ?? null
    })
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
  const conversation = await getConversationSummaryRecordOrThrow({
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });

  return buildConversationThreadDto({
    conversation,
    query: input.query,
    viewerId: input.viewerId
  });
}

export async function createConversationMessage(input: {
  auditContext: ConversationMessageAuditContext;
  body: CreateConversationMessageInput;
  conversationId: string;
  viewerId: string;
}): Promise<ConversationMessageDto> {
  const createdMessage = await createConversationMessageInternal({
    auditContext: input.auditContext,
    body: input.body,
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });

  return createdMessage.message;
}

export async function createConversationMessageRealtime(input: {
  auditContext: ConversationMessageAuditContext;
  body: CreateConversationMessageInput & { clientMessageId: string };
  conversationId: string;
  viewerId: string;
}): Promise<{
  created: boolean;
  message: ConversationMessageDto;
  participantUserIds: string[];
}> {
  return createConversationMessageInternal({
    auditContext: input.auditContext,
    body: input.body,
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });
}

export async function markConversationRead(input: {
  body: MarkConversationReadInput;
  conversationId: string;
  viewerId: string;
}): Promise<ConversationReadStateDto> {
  const conversation = await getConversationSummaryRecordOrThrow({
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });

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
    return toConversationReadStateDto(input.conversationId, {
      lastReadAt: currentReadState.lastReadAt,
      lastReadMessageId: currentReadState.lastReadMessageId
    });
  }

  const updatedReadState = await upsertConversationReadState({
    conversationId: input.conversationId,
    lastReadAt: targetMessage.createdAt,
    lastReadMessageId: targetMessage.id,
    userId: input.viewerId
  });

  return toConversationReadStateDto(updatedReadState.conversationId, {
    lastReadAt: updatedReadState.lastReadAt,
    lastReadMessageId: updatedReadState.lastReadMessageId
  });
}

export async function markConversationReadRealtime(input: {
  body: MarkConversationReadInput;
  conversationId: string;
  viewerId: string;
}): Promise<{
  participantUserIds: string[];
  readState: ConversationReadStateDto;
}> {
  const conversation = await getConversationSummaryRecordOrThrow({
    conversationId: input.conversationId,
    viewerId: input.viewerId
  });
  const readState = await markConversationRead(input);

  return {
    participantUserIds: conversation.participants.map((participant) => participant.userId),
    readState
  };
}

export async function getConversationSummary(input: {
  conversationId: string;
  viewerId: string;
}): Promise<ConversationSummaryDto> {
  const conversation = await getConversationSummaryRecordOrThrow(input);

  return toConversationSummaryDto(conversation, input.viewerId);
}

export async function listConversationRoomIds(input: {
  viewerId: string;
}): Promise<string[]> {
  return findConversationRoomIdsForUser(input.viewerId);
}

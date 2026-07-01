import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { io as createSocketClient, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { createSocketServer } from "../../realtime/socketServer.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "../auth/password.js";

type ServerAckError = {
  error: {
    code: string;
    message: string;
  };
};

type ConversationMessageAck = {
  message: {
    content: string;
    conversationId: string;
    createdAt: string;
    id: string;
    sender: {
      avatarUrl: string | null;
      displayName: string | null;
      id: string;
      username: string;
    };
  };
};

type ConversationSummaryEvent = {
  conversation: {
    id: string;
    unreadCount: number;
  };
};

type ConversationMessageEvent = {
  message: {
    content: string;
    conversationId: string;
    id: string;
    sender: {
      id: string;
      username: string;
    };
  };
};

type ConversationReadEvent = {
  conversationId: string;
  readState: {
    conversationId: string;
    lastReadAt: string;
    lastReadMessageId: string;
  };
  userId: string;
};

type SocketConnectionError = Error & {
  data?: {
    code?: string;
    message?: string;
  };
};

const allowedOrigin = "http://localhost:5173";

let httpServer: HttpServer;
let realtimeServerUrl: string;

async function createUserFixture(overrides: {
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string;
  password?: string;
  status?: "ACTIVE" | "BANNED";
  username?: string;
} = {}) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      avatarUrl: overrides.avatarUrl ?? null,
      displayName: overrides.displayName ?? "Realtime User",
      email: overrides.email ?? `${randomUUID()}@example.com`,
      passwordHash,
      status: overrides.status ?? "ACTIVE",
      username:
        overrides.username ??
        `realtime_${randomUUID().replace(/-/g, "").slice(0, 12)}`
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

async function createDirectConversationFixture(input: {
  accessToken: string;
  participantUserId: string;
}) {
  const response = await request(app)
    .post("/api/v1/conversations")
    .set("Origin", allowedOrigin)
    .set("Authorization", `Bearer ${input.accessToken}`)
    .send({
      participantUserId: input.participantUserId
    });

  expect([200, 201]).toContain(response.status);

  return response.body.conversation.id as string;
}

async function startRealtimeServer(): Promise<{
  httpServer: HttpServer;
  url: string;
}> {
  const server = createServer(app);
  createSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Realtime test server did not expose an address.");
  }

  return {
    httpServer: server,
    url: `http://127.0.0.1:${address.port}`
  };
}

async function stopRealtimeServer(server: HttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function connectRealtimeSocket(accessToken?: string): Promise<ClientSocket> {
  const socket = createSocketClient(realtimeServerUrl, {
    auth: accessToken ? { accessToken } : undefined,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"]
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (error) => reject(error));
  });

  return socket;
}

function waitForSocketEvent<T>(socket: ClientSocket, eventName: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(eventName, (payload: T) => {
      resolve(payload);
    });
  });
}

async function emitWithAck<TResponse>(
  socket: ClientSocket,
  eventName: string,
  payload: unknown
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    socket.timeout(2000).emit(
      eventName,
      payload,
      (error: Error | null, response: TResponse) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(response);
      }
    );
  });
}

async function waitForTick() {
  await new Promise((resolve) => {
    setTimeout(resolve, 200);
  });
}

describe("messages realtime transport", () => {
  beforeAll(async () => {
    const startedServer = await startRealtimeServer();
    httpServer = startedServer.httpServer;
    realtimeServerUrl = startedServer.url;
  });

  afterAll(async () => {
    await stopRealtimeServer(httpServer);
  });

  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("rejects socket connections without a valid active-user access token", async () => {
    const bannedUser = await createUserFixture({
      email: "banned-realtime@example.com",
      status: "BANNED",
      username: "banned_realtime"
    });
    const bannedAccessToken = await loginAndGetAccessToken(
      bannedUser.user.email,
      bannedUser.password
    ).catch(() => null);

    expect(bannedAccessToken).toBeNull();

    const unauthenticatedSocket = createSocketClient(realtimeServerUrl, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"]
    });
    const unauthenticatedError = (await waitForSocketEvent(
      unauthenticatedSocket,
      "connect_error"
    )) as SocketConnectionError;

    expect(unauthenticatedError.message).toBe("AUTH_UNAUTHORIZED");
    expect(unauthenticatedError.data?.code).toBe("AUTH_UNAUTHORIZED");
    unauthenticatedSocket.close();

    const activeUser = await createUserFixture({
      email: "active-realtime@example.com",
      username: "active_realtime"
    });
    const activeAccessToken = await loginAndGetAccessToken(
      activeUser.user.email,
      activeUser.password
    );
    const activeSocket = await connectRealtimeSocket(activeAccessToken);

    activeSocket.close();
  });

  test("delivers ordered message events, viewer-specific unread updates, and read-state broadcasts", async () => {
    const sender = await createUserFixture({
      displayName: "Realtime Sender",
      email: "sender-realtime@example.com",
      username: "sender_realtime"
    });
    const recipient = await createUserFixture({
      displayName: "Realtime Recipient",
      email: "recipient-realtime@example.com",
      username: "recipient_realtime"
    });
    const senderAccessToken = await loginAndGetAccessToken(
      sender.user.email,
      sender.password
    );
    const recipientAccessToken = await loginAndGetAccessToken(
      recipient.user.email,
      recipient.password
    );
    const conversationId = await createDirectConversationFixture({
      accessToken: senderAccessToken,
      participantUserId: recipient.user.id
    });
    const senderSocket = await connectRealtimeSocket(senderAccessToken);
    const recipientSocket = await connectRealtimeSocket(recipientAccessToken);

    try {
      const firstMessageEventPromise = waitForSocketEvent<ConversationMessageEvent>(
        recipientSocket,
        "conversation:message:created"
      );
      const firstSummaryEventPromise = waitForSocketEvent<ConversationSummaryEvent>(
        recipientSocket,
        "conversation:summary:updated"
      );
      const firstAck = await emitWithAck<ConversationMessageAck | ServerAckError>(
        senderSocket,
        "conversation:message:create",
        {
          clientMessageId: randomUUID(),
          content: "First realtime message",
          conversationId
        }
      );

      expect("message" in firstAck).toBe(true);

      const firstCreatedEvent = await firstMessageEventPromise;
      const firstSummaryEvent = await firstSummaryEventPromise;

      expect(firstCreatedEvent.message).toMatchObject({
        content: "First realtime message",
        conversationId,
        sender: {
          id: sender.user.id,
          username: "sender_realtime"
        }
      });
      expect(firstCreatedEvent.message.id).toBe((firstAck as ConversationMessageAck).message.id);
      expect(firstSummaryEvent.conversation).toMatchObject({
        id: conversationId,
        unreadCount: 1
      });

      const secondMessageEventPromise = waitForSocketEvent<ConversationMessageEvent>(
        recipientSocket,
        "conversation:message:created"
      );
      const secondSummaryEventPromise = waitForSocketEvent<ConversationSummaryEvent>(
        recipientSocket,
        "conversation:summary:updated"
      );
      const secondAck = await emitWithAck<ConversationMessageAck | ServerAckError>(
        senderSocket,
        "conversation:message:create",
        {
          clientMessageId: randomUUID(),
          content: "Second realtime message",
          conversationId
        }
      );

      expect("message" in secondAck).toBe(true);

      const secondCreatedEvent = await secondMessageEventPromise;
      const secondSummaryEvent = await secondSummaryEventPromise;

      expect(secondCreatedEvent.message.content).toBe("Second realtime message");
      expect(secondCreatedEvent.message.id).toBe(
        (secondAck as ConversationMessageAck).message.id
      );
      expect(secondSummaryEvent.conversation).toMatchObject({
        id: conversationId,
        unreadCount: 2
      });
      expect([
        firstCreatedEvent.message.id,
        secondCreatedEvent.message.id
      ]).toEqual([
        (firstAck as ConversationMessageAck).message.id,
        (secondAck as ConversationMessageAck).message.id
      ]);

      const readEventPromise = waitForSocketEvent<ConversationReadEvent>(
        senderSocket,
        "conversation:read:updated"
      );
      const readAck = await emitWithAck<
        | {
            readState: {
              conversationId: string;
              lastReadAt: string;
              lastReadMessageId: string;
            };
          }
        | ServerAckError
      >(recipientSocket, "conversation:read:update", {
        conversationId,
        messageId: (secondAck as ConversationMessageAck).message.id
      });

      expect("readState" in readAck).toBe(true);

      const readEvent = await readEventPromise;

      expect(readEvent).toMatchObject({
        conversationId,
        readState: {
          conversationId,
          lastReadMessageId: (secondAck as ConversationMessageAck).message.id
        },
        userId: recipient.user.id
      });
    } finally {
      senderSocket.close();
      recipientSocket.close();
    }
  });

  test("deduplicates retried delivery acks by clientMessageId and avoids rebroadcasting the same message", async () => {
    const sender = await createUserFixture({
      email: "duplicate-sender@example.com",
      username: "duplicate_sender"
    });
    const recipient = await createUserFixture({
      email: "duplicate-recipient@example.com",
      username: "duplicate_recipient"
    });
    const senderAccessToken = await loginAndGetAccessToken(
      sender.user.email,
      sender.password
    );
    const recipientAccessToken = await loginAndGetAccessToken(
      recipient.user.email,
      recipient.password
    );
    const conversationId = await createDirectConversationFixture({
      accessToken: senderAccessToken,
      participantUserId: recipient.user.id
    });
    const senderSocket = await connectRealtimeSocket(senderAccessToken);
    const recipientSocket = await connectRealtimeSocket(recipientAccessToken);
    const clientMessageId = randomUUID();

    try {
      const firstCreatedEventPromise = waitForSocketEvent<ConversationMessageEvent>(
        recipientSocket,
        "conversation:message:created"
      );
      const firstAck = await emitWithAck<ConversationMessageAck | ServerAckError>(
        senderSocket,
        "conversation:message:create",
        {
          clientMessageId,
          content: "Idempotent realtime message",
          conversationId
        }
      );

      expect("message" in firstAck).toBe(true);

      const firstCreatedEvent = await firstCreatedEventPromise;
      expect(firstCreatedEvent.message.id).toBe((firstAck as ConversationMessageAck).message.id);

      let duplicateEventReceived = false;
      recipientSocket.once("conversation:message:created", () => {
        duplicateEventReceived = true;
      });

      const retryAck = await emitWithAck<ConversationMessageAck | ServerAckError>(
        senderSocket,
        "conversation:message:create",
        {
          clientMessageId,
          content: "Idempotent realtime message",
          conversationId
        }
      );

      expect("message" in retryAck).toBe(true);
      expect((retryAck as ConversationMessageAck).message.id).toBe(
        (firstAck as ConversationMessageAck).message.id
      );

      await waitForTick();

      expect(duplicateEventReceived).toBe(false);

      const persistedMessages = await prisma.$queryRaw<
        Array<{ count: bigint }>
      >`
        SELECT COUNT(*)::bigint AS count
        FROM "Message"
        WHERE "conversationId" = ${conversationId}::uuid
      `;

      expect(persistedMessages[0]?.count).toBe(1n);
    } finally {
      senderSocket.close();
      recipientSocket.close();
    }
  });

  test("reconnect sync returns missed conversation state and live delivery resumes after reconnect", async () => {
    const sender = await createUserFixture({
      email: "sync-sender@example.com",
      username: "sync_sender"
    });
    const recipient = await createUserFixture({
      email: "sync-recipient@example.com",
      username: "sync_recipient"
    });
    const senderAccessToken = await loginAndGetAccessToken(
      sender.user.email,
      sender.password
    );
    const recipientAccessToken = await loginAndGetAccessToken(
      recipient.user.email,
      recipient.password
    );
    const conversationId = await createDirectConversationFixture({
      accessToken: senderAccessToken,
      participantUserId: recipient.user.id
    });
    const senderSocket = await connectRealtimeSocket(senderAccessToken);
    let recipientSocket = await connectRealtimeSocket(recipientAccessToken);

    try {
      recipientSocket.disconnect();

      const firstAck = await emitWithAck<ConversationMessageAck | ServerAckError>(
        senderSocket,
        "conversation:message:create",
        {
          clientMessageId: randomUUID(),
          content: "Missed while reconnecting",
          conversationId
        }
      );

      expect("message" in firstAck).toBe(true);

      recipientSocket = await connectRealtimeSocket(recipientAccessToken);

      const inboxSync = await emitWithAck<
        | {
            conversations: Array<{
              id: string;
              unreadCount: number;
            }>;
            pageInfo: {
              hasNextPage: boolean;
              limit: number;
              nextCursor: string | null;
            };
          }
        | ServerAckError
      >(recipientSocket, "conversations:sync", {
        limit: 20
      });

      expect("conversations" in inboxSync).toBe(true);
      expect((inboxSync as { conversations: Array<{ id: string; unreadCount: number }> }).conversations).toEqual([
        expect.objectContaining({
          id: conversationId,
          unreadCount: 1
        })
      ]);

      const threadSync = await emitWithAck<
        | {
            conversation: {
              id: string;
            };
            messages: Array<{
              content: string;
              id: string;
            }>;
            pageInfo: {
              hasNextPage: boolean;
              limit: number;
              nextCursor: string | null;
            };
            readState: {
              conversationId: string;
              lastReadAt: string | null;
              lastReadMessageId: string | null;
            };
          }
        | ServerAckError
      >(recipientSocket, "conversation:messages:sync", {
        conversationId,
        limit: 20
      });

      expect("messages" in threadSync).toBe(true);
      expect((threadSync as { messages: Array<{ content: string; id: string }> }).messages).toEqual([
        expect.objectContaining({
          content: "Missed while reconnecting",
          id: (firstAck as ConversationMessageAck).message.id
        })
      ]);

      const resumedDeliveryPromise = waitForSocketEvent<ConversationMessageEvent>(
        recipientSocket,
        "conversation:message:created"
      );
      const secondAck = await emitWithAck<ConversationMessageAck | ServerAckError>(
        senderSocket,
        "conversation:message:create",
        {
          clientMessageId: randomUUID(),
          content: "Delivered after reconnect",
          conversationId
        }
      );

      expect("message" in secondAck).toBe(true);

      const resumedDeliveryEvent = await resumedDeliveryPromise;

      expect(resumedDeliveryEvent.message).toMatchObject({
        content: "Delivered after reconnect",
        conversationId,
        id: (secondAck as ConversationMessageAck).message.id
      });
    } finally {
      senderSocket.close();
      recipientSocket.close();
    }
  });
});

import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "../auth/password.js";
import { MESSAGE_RATE_LIMIT_MAX } from "./messages.service.js";

const allowedOrigin = "http://localhost:5173";

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
      displayName: overrides.displayName ?? "Chat User",
      email: overrides.email ?? `${randomUUID()}@example.com`,
      passwordHash,
      status: overrides.status ?? "ACTIVE",
      username:
        overrides.username ?? `chat_${randomUUID().replace(/-/g, "").slice(0, 12)}`
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

function buildDirectConversationKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join(":");
}

async function insertDirectConversation(input: {
  createdAt?: Date;
  updatedAt?: Date;
  userAId: string;
  userBId: string;
}) {
  const conversationId = randomUUID();
  const createdAt = input.createdAt ?? new Date("2026-07-01T08:00:00.000Z");
  const updatedAt = input.updatedAt ?? createdAt;
  const directKey = buildDirectConversationKey(input.userAId, input.userBId);

  await prisma.$executeRaw`
    INSERT INTO "Conversation" (
      "id",
      "directKey",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${conversationId}::uuid,
      ${directKey},
      ${createdAt},
      ${updatedAt}
    )
  `;

  await prisma.$executeRaw`
    INSERT INTO "ConversationParticipant" (
      "conversationId",
      "userId",
      "createdAt"
    )
    VALUES
      (${conversationId}::uuid, ${input.userAId}::uuid, ${createdAt}),
      (${conversationId}::uuid, ${input.userBId}::uuid, ${createdAt})
  `;

  await prisma.$executeRaw`
    INSERT INTO "ConversationReadState" (
      "conversationId",
      "userId",
      "lastReadAt",
      "lastReadMessageId",
      "updatedAt"
    )
    VALUES
      (${conversationId}::uuid, ${input.userAId}::uuid, NULL, NULL, ${createdAt}),
      (${conversationId}::uuid, ${input.userBId}::uuid, NULL, NULL, ${createdAt})
  `;

  return {
    conversationId,
    directKey
  };
}

async function insertMessage(input: {
  content: string;
  conversationId: string;
  createdAt: Date;
  senderId: string;
}) {
  const messageId = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "Message" (
      "id",
      "conversationId",
      "senderId",
      "content",
      "createdAt"
    )
    VALUES (
      ${messageId}::uuid,
      ${input.conversationId}::uuid,
      ${input.senderId}::uuid,
      ${input.content},
      ${input.createdAt}
    )
  `;

  await prisma.$executeRaw`
    UPDATE "Conversation"
    SET "updatedAt" = ${input.createdAt}
    WHERE "id" = ${input.conversationId}::uuid
  `;

  return messageId;
}

async function updateReadState(input: {
  conversationId: string;
  lastReadAt: Date | null;
  lastReadMessageId: string | null;
  userId: string;
}) {
  await prisma.$executeRaw`
    UPDATE "ConversationReadState"
    SET
      "lastReadAt" = ${input.lastReadAt},
      "lastReadMessageId" = ${input.lastReadMessageId}::uuid,
      "updatedAt" = ${input.lastReadAt ?? new Date("2026-07-01T08:00:00.000Z")}
    WHERE
      "conversationId" = ${input.conversationId}::uuid
      AND "userId" = ${input.userId}::uuid
  `;
}

describe("messages conversations API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("POST /api/v1/conversations creates one direct conversation, both participants, and empty read states", async () => {
    const viewer = await createUserFixture({
      email: "viewer-conversation@example.com",
      username: "viewer_conversation"
    });
    const peer = await createUserFixture({
      displayName: "Peer Demo",
      email: "peer-conversation@example.com",
      username: "peer_conversation"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );

    const response = await request(app)
      .post("/api/v1/conversations")
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        participantUserId: peer.user.id
      });

    expect(response.status).toBe(201);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.body.conversation).toMatchObject({
      id: expect.any(String),
      lastMessage: null,
      peer: {
        avatarUrl: null,
        displayName: "Peer Demo",
        id: peer.user.id,
        username: "peer_conversation"
      },
      unreadCount: 0
    });

    const persistedConversations = await prisma.$queryRaw<
      Array<{ directKey: string; id: string }>
    >`
      SELECT "id", "directKey"
      FROM "Conversation"
    `;

    expect(persistedConversations).toEqual([
      {
        directKey: buildDirectConversationKey(viewer.user.id, peer.user.id),
        id: response.body.conversation.id as string
      }
    ]);

    const participants = await prisma.$queryRaw<
      Array<{ conversationId: string; userId: string }>
    >`
      SELECT "conversationId", "userId"
      FROM "ConversationParticipant"
      ORDER BY "userId" ASC
    `;

    expect(participants).toEqual(
      [peer.user.id, viewer.user.id]
        .sort()
        .map((userId) => ({
          conversationId: response.body.conversation.id as string,
          userId
        }))
    );

    const readStates = await prisma.$queryRaw<
      Array<{
        conversationId: string;
        lastReadAt: Date | null;
        lastReadMessageId: string | null;
        userId: string;
      }>
    >`
      SELECT
        "conversationId",
        "lastReadAt",
        "lastReadMessageId",
        "userId"
      FROM "ConversationReadState"
      ORDER BY "userId" ASC
    `;

    expect(readStates).toEqual(
      [peer.user.id, viewer.user.id]
        .sort()
        .map((userId) => ({
          conversationId: response.body.conversation.id as string,
          lastReadAt: null,
          lastReadMessageId: null,
          userId
        }))
    );
  });

  test("POST /api/v1/conversations reuses the same direct conversation when duplicate requests race", async () => {
    const viewer = await createUserFixture({
      email: "viewer-race@example.com",
      username: "viewer_race"
    });
    const peer = await createUserFixture({
      email: "peer-race@example.com",
      username: "peer_race"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );

    const [firstResponse, secondResponse] = await Promise.all([
      request(app)
        .post("/api/v1/conversations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ participantUserId: peer.user.id }),
      request(app)
        .post("/api/v1/conversations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ participantUserId: peer.user.id })
    ]);

    for (const response of [firstResponse, secondResponse]) {
      expect([200, 201]).toContain(response.status);
      expect(response.body.conversation.id).toEqual(expect.any(String));
    }

    expect(firstResponse.body.conversation.id).toBe(
      secondResponse.body.conversation.id
    );
    expect(
      [firstResponse.status, secondResponse.status].sort((left, right) => left - right)
    ).toEqual([200, 201]);

    const conversationCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Conversation"
    `;
    const participantCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "ConversationParticipant"
    `;

    expect(conversationCount[0]?.count).toBe(1n);
    expect(participantCount[0]?.count).toBe(2n);
  });

  test("POST /api/v1/conversations rejects self-conversations and hides banned targets behind USER_NOT_FOUND", async () => {
    const viewer = await createUserFixture({
      email: "viewer-self@example.com",
      username: "viewer_self"
    });
    const bannedPeer = await createUserFixture({
      email: "peer-banned@example.com",
      status: "BANNED",
      username: "peer_banned"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );

    const selfResponse = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ participantUserId: viewer.user.id });

    expect(selfResponse.status).toBe(400);
    expect(selfResponse.body.error.code).toBe(
      "DIRECT_CONVERSATION_SELF_NOT_ALLOWED"
    );

    const bannedResponse = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ participantUserId: bannedPeer.user.id });

    expect(bannedResponse.status).toBe(404);
    expect(bannedResponse.body.error.code).toBe("USER_NOT_FOUND");
    expect(bannedResponse.body.error.message).toBe("User not found.");
  });

  test("GET /api/v1/conversations returns the authenticated inbox ordered by latest activity with unread counts and cursor pagination", async () => {
    const viewer = await createUserFixture({
      displayName: "Inbox Viewer",
      email: "viewer-inbox@example.com",
      username: "viewer_inbox"
    });
    const newerPeer = await createUserFixture({
      displayName: "Newer Peer",
      email: "peer-newer@example.com",
      username: "peer_newer"
    });
    const olderPeer = await createUserFixture({
      displayName: "Older Peer",
      email: "peer-older@example.com",
      username: "peer_older"
    });
    const outsiderPeer = await createUserFixture({
      displayName: "Outsider Peer",
      email: "peer-outsider@example.com",
      username: "peer_outsider"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );

    const olderConversation = await insertDirectConversation({
      updatedAt: new Date("2026-07-01T08:05:00.000Z"),
      userAId: viewer.user.id,
      userBId: olderPeer.user.id
    });
    const newerConversation = await insertDirectConversation({
      updatedAt: new Date("2026-07-01T09:10:00.000Z"),
      userAId: viewer.user.id,
      userBId: newerPeer.user.id
    });
    await insertDirectConversation({
      updatedAt: new Date("2026-07-01T11:00:00.000Z"),
      userAId: outsiderPeer.user.id,
      userBId: newerPeer.user.id
    });

    const olderMessage = await insertMessage({
      content: "Earlier thread message",
      conversationId: olderConversation.conversationId,
      createdAt: new Date("2026-07-01T08:05:00.000Z"),
      senderId: olderPeer.user.id
    });
    const newerMessage = await insertMessage({
      content: "Most recent unread message",
      conversationId: newerConversation.conversationId,
      createdAt: new Date("2026-07-01T09:10:00.000Z"),
      senderId: newerPeer.user.id
    });

    await updateReadState({
      conversationId: olderConversation.conversationId,
      lastReadAt: new Date("2026-07-01T08:05:00.000Z"),
      lastReadMessageId: olderMessage,
      userId: viewer.user.id
    });

    const firstPageResponse = await request(app)
      .get("/api/v1/conversations")
      .query({ limit: "1" })
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstPageResponse.status).toBe(200);
    expect(firstPageResponse.headers["access-control-allow-origin"]).toBe(
      allowedOrigin
    );
    expect(firstPageResponse.body.conversations).toHaveLength(1);
    expect(firstPageResponse.body.conversations[0]).toMatchObject({
      id: newerConversation.conversationId,
      lastMessage: {
        content: "Most recent unread message",
        id: newerMessage,
        senderId: newerPeer.user.id
      },
      peer: {
        displayName: "Newer Peer",
        id: newerPeer.user.id,
        username: "peer_newer"
      },
      unreadCount: 1
    });
    expect(firstPageResponse.body.pageInfo).toMatchObject({
      hasNextPage: true,
      limit: 1
    });
    expect(firstPageResponse.body.pageInfo.nextCursor).toEqual(expect.any(String));

    const secondPageResponse = await request(app)
      .get("/api/v1/conversations")
      .query({
        cursor: firstPageResponse.body.pageInfo.nextCursor as string,
        limit: "1"
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondPageResponse.status).toBe(200);
    expect(secondPageResponse.body.conversations).toHaveLength(1);
    expect(secondPageResponse.body.conversations[0]).toMatchObject({
      id: olderConversation.conversationId,
      peer: {
        displayName: "Older Peer",
        id: olderPeer.user.id,
        username: "peer_older"
      },
      unreadCount: 0
    });
    expect(secondPageResponse.body.pageInfo).toMatchObject({
      hasNextPage: false,
      limit: 1,
      nextCursor: null
    });
  });

  test("GET /api/v1/conversations/:conversationId/messages returns paginated history for participants only", async () => {
    const viewer = await createUserFixture({
      email: "viewer-thread@example.com",
      username: "viewer_thread"
    });
    const peer = await createUserFixture({
      email: "peer-thread@example.com",
      username: "peer_thread"
    });
    const outsider = await createUserFixture({
      email: "outsider-thread@example.com",
      username: "outsider_thread"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );
    const outsiderToken = await loginAndGetAccessToken(
      outsider.user.email,
      outsider.password
    );
    const conversation = await insertDirectConversation({
      userAId: viewer.user.id,
      userBId: peer.user.id
    });
    const firstMessageId = await insertMessage({
      content: "Oldest message",
      conversationId: conversation.conversationId,
      createdAt: new Date("2026-07-01T08:00:00.000Z"),
      senderId: viewer.user.id
    });
    const secondMessageId = await insertMessage({
      content: "Newest message",
      conversationId: conversation.conversationId,
      createdAt: new Date("2026-07-01T09:00:00.000Z"),
      senderId: peer.user.id
    });

    const firstPageResponse = await request(app)
      .get(`/api/v1/conversations/${conversation.conversationId}/messages`)
      .query({ limit: "1" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstPageResponse.status).toBe(200);
    expect(firstPageResponse.body.messages).toEqual([
      expect.objectContaining({
        content: "Newest message",
        id: secondMessageId,
        sender: expect.objectContaining({
          id: peer.user.id,
          username: "peer_thread"
        })
      })
    ]);
    expect(firstPageResponse.body.pageInfo).toMatchObject({
      hasNextPage: true,
      limit: 1
    });

    const secondPageResponse = await request(app)
      .get(`/api/v1/conversations/${conversation.conversationId}/messages`)
      .query({
        cursor: firstPageResponse.body.pageInfo.nextCursor as string,
        limit: "1"
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondPageResponse.status).toBe(200);
    expect(secondPageResponse.body.messages).toEqual([
      expect.objectContaining({
        content: "Oldest message",
        id: firstMessageId,
        sender: expect.objectContaining({
          id: viewer.user.id,
          username: "viewer_thread"
        })
      })
    ]);
    expect(secondPageResponse.body.pageInfo.nextCursor).toBeNull();

    const outsiderResponse = await request(app)
      .get(`/api/v1/conversations/${conversation.conversationId}/messages`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(outsiderResponse.status).toBe(404);
    expect(outsiderResponse.body.error.code).toBe("CONVERSATION_NOT_FOUND");
  });

  test("POST /api/v1/conversations/:conversationId/messages creates a new message and updates the sender read state", async () => {
    const viewer = await createUserFixture({
      email: "viewer-send@example.com",
      username: "viewer_send"
    });
    const peer = await createUserFixture({
      email: "peer-send@example.com",
      username: "peer_send"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );
    const conversation = await insertDirectConversation({
      userAId: viewer.user.id,
      userBId: peer.user.id
    });

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.conversationId}/messages`)
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        content: "  Sending the first backend chat message.  "
      });

    expect(response.status).toBe(201);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.body.message).toMatchObject({
      content: "Sending the first backend chat message.",
      conversationId: conversation.conversationId,
      sender: {
        id: viewer.user.id,
        username: "viewer_send"
      }
    });

    const persistedMessages = await prisma.$queryRaw<
      Array<{ content: string; conversationId: string; senderId: string }>
    >`
      SELECT "content", "conversationId", "senderId"
      FROM "Message"
    `;

    expect(persistedMessages).toEqual([
      {
        content: "Sending the first backend chat message.",
        conversationId: conversation.conversationId,
        senderId: viewer.user.id
      }
    ]);

    const senderReadState = await prisma.$queryRaw<
      Array<{ lastReadAt: Date | null; lastReadMessageId: string | null }>
    >`
      SELECT "lastReadAt", "lastReadMessageId"
      FROM "ConversationReadState"
      WHERE
        "conversationId" = ${conversation.conversationId}::uuid
        AND "userId" = ${viewer.user.id}::uuid
    `;

    expect(senderReadState[0]?.lastReadAt).toBeInstanceOf(Date);
    expect(senderReadState[0]?.lastReadMessageId).toBe(
      response.body.message.id as string
    );
  });

  test("POST /api/v1/conversations/:conversationId/messages rate limits burst sends and records an audit entry", async () => {
    const viewer = await createUserFixture({
      email: "viewer-rate-limit@example.com",
      username: "viewer_rate_limit"
    });
    const peer = await createUserFixture({
      email: "peer-rate-limit@example.com",
      username: "peer_rate_limit"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );
    const conversation = await insertDirectConversation({
      userAId: viewer.user.id,
      userBId: peer.user.id
    });

    for (let index = 0; index < MESSAGE_RATE_LIMIT_MAX; index += 1) {
      await insertMessage({
        content: `Burst message ${index + 1}`,
        conversationId: conversation.conversationId,
        createdAt: new Date(Date.now() - 500 + index),
        senderId: viewer.user.id
      });
    }

    const response = await request(app)
      .post(`/api/v1/conversations/${conversation.conversationId}/messages`)
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("User-Agent", "CloneInsta burst test")
      .send({
        content: "This message should be rate limited."
      });

    expect(response.status).toBe(429);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.body.error.code).toBe("MESSAGE_RATE_LIMITED");

    const persistedMessageCount = await prisma.message.count({
      where: {
        senderId: viewer.user.id
      }
    });

    expect(persistedMessageCount).toBe(MESSAGE_RATE_LIMIT_MAX);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: "MESSAGE_RATE_LIMIT_TRIGGERED"
      }
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: "MESSAGE_RATE_LIMIT_TRIGGERED",
      actorId: viewer.user.id,
      entityId: conversation.conversationId,
      entityType: "CONVERSATION",
      userAgent: "CloneInsta burst test"
    });
    expect(auditLogs[0]?.actorMetadata).toMatchObject({
      conversationId: conversation.conversationId,
      rateLimitMax: MESSAGE_RATE_LIMIT_MAX,
      recentMessageCount: MESSAGE_RATE_LIMIT_MAX,
      transport: "REST"
    });
  });

  test("POST /api/v1/conversations/:conversationId/read marks the target message as read and clears unread count", async () => {
    const viewer = await createUserFixture({
      email: "viewer-read@example.com",
      username: "viewer_read"
    });
    const peer = await createUserFixture({
      email: "peer-read@example.com",
      username: "peer_read"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );
    const conversation = await insertDirectConversation({
      userAId: viewer.user.id,
      userBId: peer.user.id
    });
    const unreadMessageId = await insertMessage({
      content: "Unread message for read-state test",
      conversationId: conversation.conversationId,
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
      senderId: peer.user.id
    });

    const readResponse = await request(app)
      .post(`/api/v1/conversations/${conversation.conversationId}/read`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        messageId: unreadMessageId
      });

    expect(readResponse.status).toBe(200);
    expect(readResponse.body.readState).toMatchObject({
      conversationId: conversation.conversationId,
      lastReadMessageId: unreadMessageId
    });

    const inboxResponse = await request(app)
      .get("/api/v1/conversations")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(inboxResponse.status).toBe(200);
    expect(inboxResponse.body.conversations[0]).toMatchObject({
      id: conversation.conversationId,
      unreadCount: 0
    });
  });

  test("GET /api/v1/conversations requires auth and OPTIONS preflight exposes allowed methods", async () => {
    const unauthenticatedResponse = await request(app).get("/api/v1/conversations");

    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.body.error.code).toBe("AUTH_UNAUTHORIZED");

    const preflightResponse = await request(app)
      .options("/api/v1/conversations/test-conversation-id/messages")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(preflightResponse.status).toBe(204);
    expect(preflightResponse.headers["access-control-allow-origin"]).toBe(
      allowedOrigin
    );
    expect(preflightResponse.headers["access-control-allow-methods"]).toContain(
      "GET"
    );
    expect(preflightResponse.headers["access-control-allow-methods"]).toContain(
      "POST"
    );
  });
});

import { createHash, randomBytes } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import {
  MailDeliveryError,
  mailService,
  type MailMessage
} from "../mail/mail.service.js";
import {
  EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_MAX,
  EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_MAX
} from "./auth.service.js";

const genericRequestMessage =
  "If an unverified account matches that email, it may receive a verification email shortly.";
const sentMessages: MailMessage[] = [];

function getVerificationToken(message: MailMessage): string {
  const verificationUrl = message.text.match(/https?:\/\/\S+/)?.[0];

  expect(verificationUrl).toBeDefined();

  const token = new URL(verificationUrl!).searchParams.get("token");

  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return token!;
}

async function registerPendingUser(
  overrides: {
    email?: string;
    username?: string;
  } = {}
) {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({
      displayName: "Verification Fixture",
      email: overrides.email ?? "verification@example.com",
      username: overrides.username ?? "verification_fixture",
      password: "Password123!",
      confirmPassword: "Password123!"
    });

  expect(response.status).toBe(201);
  expect(sentMessages).toHaveLength(1);

  return {
    response,
    token: getVerificationToken(sentMessages[0]!)
  };
}

describe("email verification lifecycle API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
    sentMessages.length = 0;
    vi.spyOn(mailService, "sendMail").mockImplementation(async (message) => {
      sentMessages.push(message);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("registers a pending account, stores only a hashed 24-hour token, and uses PUBLIC_APP_URL instead of request host", async () => {
    const { response, token } = await registerPendingUser();

    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.user).toMatchObject({
      email: "verification@example.com",
      emailVerifiedAt: null,
      status: "PENDING_VERIFICATION"
    });
    expect(sentMessages[0]).toMatchObject({
      subject: "Verify your CloneInsta email",
      to: "verification@example.com"
    });
    expect(sentMessages[0]?.text).toContain(
      "http://localhost:5173/verify-email?token="
    );

    const storedToken = await prisma.actionToken.findFirstOrThrow({
      where: {
        userId: response.body.user.id
      }
    });

    expect(storedToken.tokenHash).toBe(
      createHash("sha256").update(token).digest("hex")
    );
    expect(storedToken.tokenHash).not.toBe(token);
    expect(storedToken.consumedAt).toBeNull();
    expect(storedToken.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60 * 1000
    );
  });

  test("rejects login for a pending account with the ordinary generic credential response", async () => {
    await registerPendingUser();

    const response = await request(app).post("/api/v1/auth/login").send({
      identifier: "verification@example.com",
      password: "Password123!"
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Invalid credentials."
    });
  });

  test("confirms exactly once, activates the account, and records token-safe audit data", async () => {
    const { response: registerResponse, token } = await registerPendingUser();

    const confirmResponse = await request(app)
      .post("/api/v1/auth/email-verification/confirm")
      .send({ token });

    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.body.user).toMatchObject({
      id: registerResponse.body.user.id,
      status: "ACTIVE"
    });
    expect(
      new Date(confirmResponse.body.user.emailVerifiedAt).getTime()
    ).toBeGreaterThan(0);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: registerResponse.body.user.id }
    });
    const storedToken = await prisma.actionToken.findFirstOrThrow({
      where: { userId: user.id }
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: { actorId: user.id },
      orderBy: { createdAt: "asc" }
    });

    expect(user.status).toBe("ACTIVE");
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(storedToken.consumedAt).not.toBeNull();
    expect(auditLogs.map((auditLog) => auditLog.action)).toEqual([
      "EMAIL_VERIFICATION_REQUESTED",
      "EMAIL_VERIFICATION_COMPLETED"
    ]);
    expect(JSON.stringify(auditLogs)).not.toContain(token);
    expect(JSON.stringify(auditLogs)).not.toContain("verification@example.com");

    const reusedResponse = await request(app)
      .post("/api/v1/auth/email-verification/confirm")
      .send({ token });

    expect(reusedResponse.status).toBe(400);
    expect(reusedResponse.body.error).toMatchObject({
      code: "AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED",
      message: "This verification link is invalid or expired."
    });
  });

  test("allows only one concurrent confirmation for the same token", async () => {
    const { token } = await registerPendingUser({
      email: "concurrent-verification@example.com",
      username: "concurrent_verify"
    });

    const responses = await Promise.all([
      request(app)
        .post("/api/v1/auth/email-verification/confirm")
        .send({ token }),
      request(app)
        .post("/api/v1/auth/email-verification/confirm")
        .send({ token })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 400
    ]);
    expect(
      responses.filter((response) => response.status === 400)[0]?.body.error
        .code
    ).toBe("AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED");
  });

  test("resend keeps known and unknown-email responses identical while consuming the earlier token", async () => {
    const { response: registerResponse, token: initialToken } =
      await registerPendingUser();

    const knownResponse = await request(app)
      .post("/api/v1/auth/email-verification/request")
      .send({ email: "verification@example.com" });
    const unknownResponse = await request(app)
      .post("/api/v1/auth/email-verification/request")
      .send({ email: "unknown@example.com" });

    expect(knownResponse.status).toBe(202);
    expect(unknownResponse.status).toBe(202);
    expect(knownResponse.body.message).toBe(genericRequestMessage);
    expect(unknownResponse.body.message).toBe(genericRequestMessage);
    expect(sentMessages).toHaveLength(2);

    const replacementToken = getVerificationToken(sentMessages[1]!);
    const tokens = await prisma.actionToken.findMany({
      where: { userId: registerResponse.body.user.id },
      orderBy: { createdAt: "asc" }
    });

    expect(tokens).toHaveLength(2);
    expect(
      tokens.filter((storedToken) => storedToken.consumedAt === null)
    ).toHaveLength(1);
    expect(
      tokens.some(
        (storedToken) =>
          storedToken.tokenHash ===
            createHash("sha256").update(initialToken).digest("hex") &&
          storedToken.consumedAt !== null
      )
    ).toBe(true);
    expect(
      tokens.some(
        (storedToken) =>
          storedToken.tokenHash ===
            createHash("sha256").update(replacementToken).digest("hex") &&
          storedToken.consumedAt === null
      )
    ).toBe(true);
  });

  test("enforces the request and confirmation limits without storing raw identifiers", async () => {
    for (
      let index = 0;
      index < EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_MAX;
      index += 1
    ) {
      const response = await request(app)
        .post("/api/v1/auth/email-verification/request")
        .send({ email: `unknown-${index}@example.com` });

      expect(response.status).toBe(202);
    }

    const blockedRequest = await request(app)
      .post("/api/v1/auth/email-verification/request")
      .send({ email: "unknown-blocked@example.com" });

    expect(blockedRequest.status).toBe(429);
    expect(blockedRequest.body.error.code).toBe(
      "AUTH_EMAIL_VERIFICATION_RATE_LIMITED"
    );

    await resetDatabaseTables(prisma);

    for (
      let index = 0;
      index < EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_MAX;
      index += 1
    ) {
      const response = await request(app)
        .post("/api/v1/auth/email-verification/confirm")
        .send({ token: `invalid-${index}` });

      expect(response.status).toBe(400);
    }

    const blockedConfirmation = await request(app)
      .post("/api/v1/auth/email-verification/confirm")
      .send({ token: "invalid-blocked" });

    expect(blockedConfirmation.status).toBe(429);
    expect(blockedConfirmation.body.error.code).toBe(
      "AUTH_EMAIL_VERIFICATION_RATE_LIMITED"
    );

    const attempts = await prisma.authActionAttempt.findMany();
    expect(JSON.stringify(attempts)).not.toContain("unknown-");
    expect(JSON.stringify(attempts)).not.toContain("invalid-");
    expect(attempts.every((attempt) => attempt.ipHash.length === 64)).toBe(
      true
    );
  });

  test("rejects expired tokens and leaves a pending account recoverable by resend", async () => {
    const rawToken = randomBytes(32).toString("base64url");
    const user = await prisma.user.create({
      data: {
        email: "expired@example.com",
        passwordHash: "already-hashed-for-token-test",
        status: "PENDING_VERIFICATION",
        username: "expired_fixture"
      }
    });
    await prisma.actionToken.create({
      data: {
        expiresAt: new Date(Date.now() - 1),
        purpose: "EMAIL_VERIFICATION",
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        userId: user.id
      }
    });

    const response = await request(app)
      .post("/api/v1/auth/email-verification/confirm")
      .send({ token: rawToken });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "AUTH_EMAIL_VERIFICATION_INVALID_OR_EXPIRED"
    );

    const pendingUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id }
    });
    expect(pendingUser.status).toBe("PENDING_VERIFICATION");
  });

  test("keeps a registered account pending when delivery fails and records no raw mail data in the audit log", async () => {
    vi.mocked(mailService.sendMail).mockRejectedValueOnce(
      new MailDeliveryError()
    );

    const response = await request(app).post("/api/v1/auth/register").send({
      displayName: "Delivery Failure",
      email: "delivery-failure@example.com",
      username: "delivery_failure",
      password: "Password123!",
      confirmPassword: "Password123!"
    });

    expect(response.status).toBe(201);
    expect(response.body.user.status).toBe("PENDING_VERIFICATION");

    const auditLogs = await prisma.auditLog.findMany({
      where: { actorId: response.body.user.id },
      orderBy: { createdAt: "asc" }
    });

    expect(auditLogs.map((auditLog) => auditLog.action)).toEqual([
      "EMAIL_VERIFICATION_REQUESTED",
      "EMAIL_VERIFICATION_DELIVERY_FAILED"
    ]);
    expect(JSON.stringify(auditLogs)).not.toContain(
      "delivery-failure@example.com"
    );
  });
});

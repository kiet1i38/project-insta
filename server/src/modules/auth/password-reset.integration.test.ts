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
import { hashPassword, verifyPassword } from "./password.js";

const genericRequestMessage =
  "If an active account matches that email, it may receive password reset instructions shortly.";
const sentMessages: MailMessage[] = [];

function getPasswordResetToken(message: MailMessage): string {
  const resetUrl = message.text.match(/https?:\/\/\S+/)?.[0];

  expect(resetUrl).toBeDefined();

  const token = new URL(resetUrl!).searchParams.get("token");

  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return token!;
}

async function createActiveUser(
  overrides: {
    email?: string;
    password?: string;
    username?: string;
  } = {}
) {
  const password = overrides.password ?? "Password123!";

  return prisma.user.create({
    data: {
      email: overrides.email ?? "reset@example.com",
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(password),
      status: "ACTIVE",
      username: overrides.username ?? "reset_fixture"
    }
  }).then((user) => ({ password, user }));
}

async function requestPasswordReset(email = "reset@example.com") {
  return request(app)
    .post("/api/v1/auth/password-reset/request")
    .send({ email });
}

async function confirmPasswordReset(token: string, password = "NewPassword123!") {
  return request(app)
    .post("/api/v1/auth/password-reset/confirm")
    .send({
      confirmPassword: password,
      password,
      token
    });
}

describe("password reset lifecycle API", () => {
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

  test("keeps active and unknown reset requests generic while storing only a hashed 60-minute token", async () => {
    const fixture = await createActiveUser();

    const knownResponse = await requestPasswordReset();
    const unknownResponse = await requestPasswordReset("unknown@example.com");

    expect(knownResponse.status).toBe(202);
    expect(unknownResponse.status).toBe(202);
    expect(knownResponse.body.message).toBe(genericRequestMessage);
    expect(unknownResponse.body.message).toBe(genericRequestMessage);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      subject: "Reset your CloneInsta password",
      to: fixture.user.email
    });
    expect(sentMessages[0]?.text).toContain(
      "http://localhost:5173/reset-password?token="
    );

    const token = getPasswordResetToken(sentMessages[0]!);
    const storedToken = await prisma.actionToken.findFirstOrThrow({
      where: { userId: fixture.user.id }
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: { actorId: fixture.user.id }
    });

    expect(storedToken.purpose).toBe("PASSWORD_RESET");
    expect(storedToken.tokenHash).toBe(
      createHash("sha256").update(token).digest("hex")
    );
    expect(storedToken.tokenHash).not.toBe(token);
    expect(storedToken.consumedAt).toBeNull();
    expect(storedToken.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 59 * 60 * 1000
    );
    expect(auditLogs.map((auditLog) => auditLog.action)).toEqual([
      "PASSWORD_RESET_REQUESTED"
    ]);
    expect(JSON.stringify(auditLogs)).not.toContain(fixture.user.email);
    expect(JSON.stringify(auditLogs)).not.toContain(token);
  });

  test("consumes an earlier reset token before issuing a replacement", async () => {
    const fixture = await createActiveUser();

    await requestPasswordReset();
    const firstToken = getPasswordResetToken(sentMessages[0]!);
    await requestPasswordReset();
    const replacementToken = getPasswordResetToken(sentMessages[1]!);

    const tokens = await prisma.actionToken.findMany({
      where: { userId: fixture.user.id },
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
            createHash("sha256").update(firstToken).digest("hex") &&
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

  test("does not issue reset tokens for pending or banned accounts", async () => {
    await prisma.user.createMany({
      data: [
        {
          email: "pending-reset@example.com",
          passwordHash: await hashPassword("Password123!"),
          status: "PENDING_VERIFICATION",
          username: "pending_reset"
        },
        {
          email: "banned-reset@example.com",
          emailVerifiedAt: new Date(),
          passwordHash: await hashPassword("Password123!"),
          status: "BANNED",
          username: "banned_reset"
        }
      ]
    });

    const pendingResponse = await requestPasswordReset(
      "pending-reset@example.com"
    );
    const bannedResponse = await requestPasswordReset(
      "banned-reset@example.com"
    );

    expect(pendingResponse.status).toBe(202);
    expect(bannedResponse.status).toBe(202);
    expect(pendingResponse.body.message).toBe(genericRequestMessage);
    expect(bannedResponse.body.message).toBe(genericRequestMessage);
    expect(sentMessages).toHaveLength(0);
    expect(await prisma.actionToken.count()).toBe(0);
  });

  test("changes the password once and revokes every active refresh session", async () => {
    const fixture = await createActiveUser();
    const firstLogin = await request(app).post("/api/v1/auth/login").send({
      identifier: fixture.user.email,
      password: fixture.password
    });
    const secondLogin = await request(app).post("/api/v1/auth/login").send({
      identifier: fixture.user.email,
      password: fixture.password
    });

    expect(firstLogin.status).toBe(200);
    expect(secondLogin.status).toBe(200);
    expect(
      await prisma.refreshToken.count({
        where: { userId: fixture.user.id, revokedAt: null }
      })
    ).toBe(2);

    await requestPasswordReset();
    const token = getPasswordResetToken(sentMessages[0]!);
    const resetResponse = await confirmPasswordReset(token);

    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.message).toBe(
      "Password reset successfully. Please sign in again."
    );
    expect(resetResponse.body.accessToken).toBeUndefined();

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: fixture.user.id }
    });
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: fixture.user.id }
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: { actorId: fixture.user.id },
      orderBy: { createdAt: "asc" }
    });

    await expect(verifyPassword(fixture.password, updatedUser.passwordHash)).resolves.toBe(false);
    await expect(verifyPassword("NewPassword123!", updatedUser.passwordHash)).resolves.toBe(true);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    expect(auditLogs.map((auditLog) => auditLog.action)).toEqual([
      "PASSWORD_RESET_REQUESTED",
      "PASSWORD_RESET_COMPLETED"
    ]);

    const oldPasswordLogin = await request(app).post("/api/v1/auth/login").send({
      identifier: fixture.user.email,
      password: fixture.password
    });
    const newPasswordLogin = await request(app).post("/api/v1/auth/login").send({
      identifier: fixture.user.email,
      password: "NewPassword123!"
    });

    expect(oldPasswordLogin.status).toBe(401);
    expect(newPasswordLogin.status).toBe(200);
  });

  test("allows only one concurrent confirmation and rejects reused or expired reset tokens", async () => {
    const fixture = await createActiveUser();
    await requestPasswordReset();
    const token = getPasswordResetToken(sentMessages[0]!);

    const responses = await Promise.all([
      confirmPasswordReset(token),
      confirmPasswordReset(token)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 400
    ]);
    expect(
      responses.find((response) => response.status === 400)?.body.error.code
    ).toBe("AUTH_PASSWORD_RESET_INVALID_OR_EXPIRED");

    const reusedResponse = await confirmPasswordReset(token);
    expect(reusedResponse.status).toBe(400);
    expect(reusedResponse.body.error.code).toBe(
      "AUTH_PASSWORD_RESET_INVALID_OR_EXPIRED"
    );

    const expiredToken = randomBytes(32).toString("base64url");
    await prisma.actionToken.create({
      data: {
        expiresAt: new Date(Date.now() - 1),
        purpose: "PASSWORD_RESET",
        tokenHash: createHash("sha256").update(expiredToken).digest("hex"),
        userId: fixture.user.id
      }
    });

    const expiredResponse = await confirmPasswordReset(expiredToken);
    expect(expiredResponse.status).toBe(400);
    expect(expiredResponse.body.error.code).toBe(
      "AUTH_PASSWORD_RESET_INVALID_OR_EXPIRED"
    );
  });

  test("limits reset requests and confirmations without storing raw email or token values", async () => {
    for (let index = 0; index < 3; index += 1) {
      const response = await requestPasswordReset(`unknown-${index}@example.com`);
      expect(response.status).toBe(202);
    }

    const blockedRequest = await requestPasswordReset("unknown-blocked@example.com");
    expect(blockedRequest.status).toBe(429);
    expect(blockedRequest.body.error.code).toBe("AUTH_PASSWORD_RESET_RATE_LIMITED");

    await resetDatabaseTables(prisma);

    for (let index = 0; index < 10; index += 1) {
      const response = await confirmPasswordReset(`invalid-${index}`);
      expect(response.status).toBe(400);
    }

    const blockedConfirmation = await confirmPasswordReset("invalid-blocked");
    expect(blockedConfirmation.status).toBe(429);
    expect(blockedConfirmation.body.error.code).toBe(
      "AUTH_PASSWORD_RESET_RATE_LIMITED"
    );

    const attempts = await prisma.authActionAttempt.findMany();
    expect(JSON.stringify(attempts)).not.toContain("unknown-");
    expect(JSON.stringify(attempts)).not.toContain("invalid-");
    expect(attempts.every((attempt) => attempt.ipHash.length === 64)).toBe(true);
  }, 15_000);

  test("keeps the request generic when delivery fails and audits no raw reset data", async () => {
    const fixture = await createActiveUser({
      email: "delivery-failure@example.com",
      username: "reset_delivery_failure"
    });
    vi.mocked(mailService.sendMail).mockRejectedValueOnce(
      new MailDeliveryError()
    );

    const response = await requestPasswordReset(fixture.user.email);
    const auditLogs = await prisma.auditLog.findMany({
      where: { actorId: fixture.user.id },
      orderBy: { createdAt: "asc" }
    });

    expect(response.status).toBe(202);
    expect(response.body.message).toBe(genericRequestMessage);
    expect(auditLogs.map((auditLog) => auditLog.action)).toEqual([
      "PASSWORD_RESET_REQUESTED",
      "PASSWORD_RESET_DELIVERY_FAILED"
    ]);
    expect(JSON.stringify(auditLogs)).not.toContain(fixture.user.email);
  });
});

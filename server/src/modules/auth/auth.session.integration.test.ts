import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "./password.js";

const localRefreshCookieName = "cloneinsta_refresh";

async function createUserFixture(overrides: {
  email?: string;
  username?: string;
  displayName?: string;
  password?: string;
  status?: "ACTIVE" | "BANNED";
} = {}) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? "session@example.com",
      username: overrides.username ?? "session_user",
      displayName: overrides.displayName ?? "Session User",
      passwordHash,
      status: overrides.status ?? "ACTIVE"
    }
  });

  return { password, user };
}

function readRefreshCookie(
  setCookieHeader: string | string[] | undefined
): { attributes: string[]; header: string; value: string } {
  const cookieHeaderList = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const cookieHeader = cookieHeaderList.find((entry) =>
    entry.startsWith(`${localRefreshCookieName}=`)
  );

  expect(cookieHeader).toBeDefined();

  const [cookieValuePart, ...attributes] = cookieHeader!.split("; ");

  return {
    attributes,
    header: cookieHeader!,
    value: cookieValuePart.slice(localRefreshCookieName.length + 1)
  };
}

describe("auth refresh-cookie and rotation flow", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("POST /api/v1/auth/login sets a local HttpOnly refresh cookie and stores only a hashed refresh token row", async () => {
    const fixture = await createUserFixture({
      email: "login@example.com",
      username: "login_user"
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      identifier: "login@example.com",
      password: fixture.password
    });

    expect(response.status).toBe(200);
    expect(response.body.refreshToken).toBeUndefined();

    const refreshCookie = readRefreshCookie(response.headers["set-cookie"]);

    expect(refreshCookie.value.split(".")).toHaveLength(3);
    expect(refreshCookie.attributes).toEqual(
      expect.arrayContaining(["HttpOnly", "Path=/", "SameSite=Strict"])
    );
    expect(refreshCookie.attributes).not.toContain("Secure");

    const storedSessions = await prisma.refreshToken.findMany({
      where: { userId: fixture.user.id }
    });

    expect(storedSessions).toHaveLength(1);
    expect(storedSessions[0]?.revokedAt).toBeNull();
    expect(storedSessions[0]?.tokenHash).not.toBe(refreshCookie.value);
    expect(storedSessions[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("POST /api/v1/auth/refresh rotates the refresh token and revokes the previous session row", async () => {
    const fixture = await createUserFixture({
      email: "rotate@example.com",
      username: "rotate_user"
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      identifier: "rotate@example.com",
      password: fixture.password
    });

    const originalCookie = readRefreshCookie(loginResponse.headers["set-cookie"]);
    const originalSession = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: fixture.user.id, revokedAt: null }
    });

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${localRefreshCookieName}=${originalCookie.value}`);

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    expect(refreshResponse.body.refreshToken).toBeUndefined();

    const rotatedCookie = readRefreshCookie(refreshResponse.headers["set-cookie"]);

    expect(rotatedCookie.value).not.toBe(originalCookie.value);

    const storedSessions = await prisma.refreshToken.findMany({
      where: { userId: fixture.user.id },
      orderBy: { createdAt: "asc" }
    });

    expect(storedSessions).toHaveLength(2);

    const revokedSession = storedSessions.find(
      (session) => session.id === originalSession.id
    );
    const activeSession = storedSessions.find((session) => session.revokedAt === null);

    expect(revokedSession?.revokedAt).not.toBeNull();
    expect(activeSession).toBeDefined();
    expect(activeSession?.id).not.toBe(originalSession.id);
    expect(activeSession?.tokenHash).not.toBe(rotatedCookie.value);
  });

  test("POST /api/v1/auth/refresh rejects requests with no refresh cookie", async () => {
    const response = await request(app).post("/api/v1/auth/refresh");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_INVALID_SESSION");
    expect(response.body.error.message).toBe("Invalid session.");
  });

  test("POST /api/v1/auth/refresh rejects a token when the stored token hash no longer matches", async () => {
    const fixture = await createUserFixture({
      email: "hash@example.com",
      username: "hash_user"
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      identifier: "hash@example.com",
      password: fixture.password
    });

    const refreshCookie = readRefreshCookie(loginResponse.headers["set-cookie"]);
    const storedSession = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: fixture.user.id, revokedAt: null }
    });

    await prisma.refreshToken.update({
      where: { id: storedSession.id },
      data: {
        tokenHash: "hash-mismatch"
      }
    });

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${localRefreshCookieName}=${refreshCookie.value}`);

    expect(refreshResponse.status).toBe(401);
    expect(refreshResponse.body.error.code).toBe("AUTH_INVALID_SESSION");
    expect(refreshResponse.body.error.message).toBe("Invalid session.");

    const stillActiveSessions = await prisma.refreshToken.findMany({
      where: { userId: fixture.user.id, revokedAt: null }
    });

    expect(stillActiveSessions).toHaveLength(1);
  });
});

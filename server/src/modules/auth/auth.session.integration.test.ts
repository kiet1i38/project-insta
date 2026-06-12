import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "./password.js";

const localRefreshCookieName = "cloneinsta_refresh";
const localCsrfCookieName = "cloneinsta_csrf";
const allowedOrigin = "http://localhost:5173";

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
  return readCookie(setCookieHeader, localRefreshCookieName);
}

function readCsrfCookie(
  setCookieHeader: string | string[] | undefined
): { attributes: string[]; header: string; value: string } {
  return readCookie(setCookieHeader, localCsrfCookieName);
}

function readCookie(
  setCookieHeader: string | string[] | undefined
  ,
  cookieName: string
): { attributes: string[]; header: string; value: string } {
  const cookieHeaderList = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const cookieHeader = cookieHeaderList.find((entry) =>
    entry.startsWith(`${cookieName}=`)
  );

  expect(cookieHeader).toBeDefined();

  const [cookieValuePart, ...attributes] = cookieHeader!.split("; ");

  return {
    attributes,
    header: cookieHeader!,
    value: cookieValuePart.slice(cookieName.length + 1)
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
    const originalCsrfCookie = readCsrfCookie(loginResponse.headers["set-cookie"]);
    const originalSession = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: fixture.user.id, revokedAt: null }
    });

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", originalCsrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${originalCookie.value}; ${localCsrfCookieName}=${originalCsrfCookie.value}`
      );

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
    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", "csrf-placeholder")
      .set("Cookie", `${localCsrfCookieName}=csrf-placeholder`);

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
    const csrfCookie = readCsrfCookie(loginResponse.headers["set-cookie"]);
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
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", csrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${refreshCookie.value}; ${localCsrfCookieName}=${csrfCookie.value}`
      );

    expect(refreshResponse.status).toBe(401);
    expect(refreshResponse.body.error.code).toBe("AUTH_INVALID_SESSION");
    expect(refreshResponse.body.error.message).toBe("Invalid session.");

    const stillActiveSessions = await prisma.refreshToken.findMany({
      where: { userId: fixture.user.id, revokedAt: null }
    });

    expect(stillActiveSessions).toHaveLength(1);
  });

  test("POST /api/v1/auth/refresh detects reuse of a revoked token and revokes only that token family", async () => {
    const fixture = await createUserFixture({
      email: "reuse@example.com",
      username: "reuse_user"
    });

    const firstLoginResponse = await request(app).post("/api/v1/auth/login").send({
      identifier: "reuse@example.com",
      password: fixture.password
    });
    const firstFamilyOriginalCookie = readRefreshCookie(
      firstLoginResponse.headers["set-cookie"]
    );
    const firstFamilyOriginalCsrfCookie = readCsrfCookie(
      firstLoginResponse.headers["set-cookie"]
    );

    const firstFamilyRefreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", firstFamilyOriginalCsrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${firstFamilyOriginalCookie.value}; ${localCsrfCookieName}=${firstFamilyOriginalCsrfCookie.value}`
      );

    expect(firstFamilyRefreshResponse.status).toBe(200);

    const firstFamilyActiveCookie = readRefreshCookie(
      firstFamilyRefreshResponse.headers["set-cookie"]
    );
    const firstFamilyActiveCsrfCookie = readCsrfCookie(
      firstFamilyRefreshResponse.headers["set-cookie"]
    );

    const secondLoginResponse = await request(app).post("/api/v1/auth/login").send({
      identifier: "reuse@example.com",
      password: fixture.password
    });
    const secondFamilyCookie = readRefreshCookie(secondLoginResponse.headers["set-cookie"]);
    const secondFamilyCsrfCookie = readCsrfCookie(secondLoginResponse.headers["set-cookie"]);

    const reuseResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", firstFamilyOriginalCsrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${firstFamilyOriginalCookie.value}; ${localCsrfCookieName}=${firstFamilyOriginalCsrfCookie.value}`
      );

    expect(reuseResponse.status).toBe(401);
    expect(reuseResponse.body.error.code).toBe("AUTH_INVALID_SESSION");
    expect(reuseResponse.body.error.message).toBe("Invalid session.");

    const revokedFamilyResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", firstFamilyActiveCsrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${firstFamilyActiveCookie.value}; ${localCsrfCookieName}=${firstFamilyActiveCsrfCookie.value}`
      );

    expect(revokedFamilyResponse.status).toBe(401);
    expect(revokedFamilyResponse.body.error.code).toBe("AUTH_INVALID_SESSION");
    expect(revokedFamilyResponse.body.error.message).toBe("Invalid session.");

    const otherFamilyResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", secondFamilyCsrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${secondFamilyCookie.value}; ${localCsrfCookieName}=${secondFamilyCsrfCookie.value}`
      );

    expect(otherFamilyResponse.status).toBe(200);
    expect(otherFamilyResponse.body.accessToken).toEqual(expect.any(String));

    const activeSessions = await prisma.refreshToken.findMany({
      where: { userId: fixture.user.id, revokedAt: null }
    });

    expect(activeSessions).toHaveLength(1);
  });

  test("POST /api/v1/auth/logout revokes the current refresh token and clears the cookie", async () => {
    const fixture = await createUserFixture({
      email: "logout@example.com",
      username: "logout_user"
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      identifier: "logout@example.com",
      password: fixture.password
    });

    const refreshCookie = readRefreshCookie(loginResponse.headers["set-cookie"]);
    const csrfCookie = readCsrfCookie(loginResponse.headers["set-cookie"]);
    const storedSession = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: fixture.user.id, revokedAt: null }
    });

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", csrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${refreshCookie.value}; ${localCsrfCookieName}=${csrfCookie.value}`
      );

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.text).toBe("");

    const clearedCookie = readRefreshCookie(logoutResponse.headers["set-cookie"]);

    expect(clearedCookie.value).toBe("");
    expect(clearedCookie.attributes).toEqual(
      expect.arrayContaining([
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        "HttpOnly",
        "Path=/",
        "SameSite=Strict"
      ])
    );

    const revokedSession = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: storedSession.id }
    });

    expect(revokedSession.revokedAt).not.toBeNull();

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", csrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${refreshCookie.value}; ${localCsrfCookieName}=${csrfCookie.value}`
      );

    expect(refreshResponse.status).toBe(401);
    expect(refreshResponse.body.error.code).toBe("AUTH_INVALID_SESSION");
    expect(refreshResponse.body.error.message).toBe("Invalid session.");
  });

  test("POST /api/v1/auth/logout stays idempotent for an already-revoked or missing session", async () => {
    const fixture = await createUserFixture({
      email: "logout-idempotent@example.com",
      username: "logout_idempotent_user"
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      identifier: "logout-idempotent@example.com",
      password: fixture.password
    });

    const refreshCookie = readRefreshCookie(loginResponse.headers["set-cookie"]);
    const csrfCookie = readCsrfCookie(loginResponse.headers["set-cookie"]);

    const firstLogoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", csrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${refreshCookie.value}; ${localCsrfCookieName}=${csrfCookie.value}`
      );

    expect(firstLogoutResponse.status).toBe(204);

    const secondLogoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", csrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${refreshCookie.value}; ${localCsrfCookieName}=${csrfCookie.value}`
      );

    expect(secondLogoutResponse.status).toBe(204);

    const missingCookieLogoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", "csrf-placeholder")
      .set("Cookie", `${localCsrfCookieName}=csrf-placeholder`);

    expect(missingCookieLogoutResponse.status).toBe(204);
  });
});

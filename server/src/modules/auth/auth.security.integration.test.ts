import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "./password.js";

const allowedOrigin = "http://localhost:5173";
const blockedOrigin = "http://evil.example.com";
const localCsrfCookieName = "cloneinsta_csrf";
const localRefreshCookieName = "cloneinsta_refresh";

async function createUserFixture(overrides: {
  email?: string;
  password?: string;
  username?: string;
} = {}) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? "security@example.com",
      passwordHash,
      username: overrides.username ?? "security_user"
    }
  });

  return { password, user };
}

function readCookie(
  setCookieHeader: string | string[] | undefined,
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

describe("auth cookie-endpoint security hardening", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("POST /api/v1/auth/login sets refresh and CSRF cookies plus auth security headers for the allowed client origin", async () => {
    const fixture = await createUserFixture({
      email: "login-security@example.com",
      username: "login_security_user"
    });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", allowedOrigin)
      .send({
        identifier: "login-security@example.com",
        password: fixture.password
      });

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["pragma"]).toBe("no-cache");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");

    const refreshCookie = readCookie(
      response.headers["set-cookie"],
      localRefreshCookieName
    );
    const csrfCookie = readCookie(response.headers["set-cookie"], localCsrfCookieName);

    expect(refreshCookie.value).not.toBe("");
    expect(csrfCookie.value).not.toBe("");
    expect(csrfCookie.attributes).toEqual(
      expect.arrayContaining(["Path=/", "SameSite=Strict"])
    );
    expect(csrfCookie.attributes).not.toContain("HttpOnly");
  });

  test("POST /api/v1/auth/refresh returns 403 when the CSRF header is missing", async () => {
    const fixture = await createUserFixture({
      email: "missing-csrf@example.com",
      username: "missing_csrf_user"
    });

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", allowedOrigin)
      .send({
        identifier: "missing-csrf@example.com",
        password: fixture.password
      });

    const refreshCookie = readCookie(
      loginResponse.headers["set-cookie"],
      localRefreshCookieName
    );
    const csrfCookie = readCookie(loginResponse.headers["set-cookie"], localCsrfCookieName);

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${refreshCookie.value}; ${localCsrfCookieName}=${csrfCookie.value}`
      );

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("AUTH_CSRF_INVALID");
    expect(response.body.error.message).toBe("Invalid CSRF token.");
  });

  test("POST /api/v1/auth/logout returns 403 when the Origin header is not allowed", async () => {
    const fixture = await createUserFixture({
      email: "blocked-origin@example.com",
      username: "blocked_origin_user"
    });

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", allowedOrigin)
      .send({
        identifier: "blocked-origin@example.com",
        password: fixture.password
      });

    const refreshCookie = readCookie(
      loginResponse.headers["set-cookie"],
      localRefreshCookieName
    );
    const csrfCookie = readCookie(loginResponse.headers["set-cookie"], localCsrfCookieName);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", blockedOrigin)
      .set("X-CSRF-Token", csrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${refreshCookie.value}; ${localCsrfCookieName}=${csrfCookie.value}`
      );

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("AUTH_ORIGIN_FORBIDDEN");
    expect(response.body.error.message).toBe("Origin is not allowed.");
  });

  test("OPTIONS /api/v1/auth/refresh returns credentialed CORS headers for the allowed origin", async () => {
    const response = await request(app)
      .options("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-csrf-token");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "X-CSRF-Token"
    );
  });

  test("POST /api/v1/auth/refresh allows the configured client origin when the CSRF token matches the cookie", async () => {
    const fixture = await createUserFixture({
      email: "allowed-refresh@example.com",
      username: "allowed_refresh_user"
    });

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", allowedOrigin)
      .send({
        identifier: "allowed-refresh@example.com",
        password: fixture.password
      });

    const refreshCookie = readCookie(
      loginResponse.headers["set-cookie"],
      localRefreshCookieName
    );
    const csrfCookie = readCookie(loginResponse.headers["set-cookie"], localCsrfCookieName);

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", allowedOrigin)
      .set("X-CSRF-Token", csrfCookie.value)
      .set(
        "Cookie",
        `${localRefreshCookieName}=${refreshCookie.value}; ${localCsrfCookieName}=${csrfCookie.value}`
      );

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");

    const rotatedCsrfCookie = readCookie(response.headers["set-cookie"], localCsrfCookieName);

    expect(rotatedCsrfCookie.value).not.toBe("");
  });
});

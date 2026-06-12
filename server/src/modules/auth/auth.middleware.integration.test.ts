import express from "express";
import request from "supertest";
import { prisma } from "../../db/prisma.js";
import { errorHandler, notFoundHandler } from "../../middleware/errorHandler.js";
import { requestIdMiddleware } from "../../middleware/requestId.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { issueAccessToken } from "./accessToken.js";
import { requireAdminRole, requireAuth } from "./auth.middleware.js";
import { hashPassword } from "./password.js";

async function createUserFixture(overrides: {
  displayName?: string;
  email?: string;
  password?: string;
  role?: "USER" | "ADMIN";
  status?: "ACTIVE" | "BANNED";
  username?: string;
} = {}) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      displayName: overrides.displayName ?? "Auth Middleware User",
      email: overrides.email ?? "middleware@example.com",
      passwordHash,
      role: overrides.role ?? "USER",
      status: overrides.status ?? "ACTIVE",
      username: overrides.username ?? "middleware_user"
    }
  });

  return { password, user };
}

function createProtectedApp() {
  const protectedApp = express();

  protectedApp.disable("x-powered-by");
  protectedApp.use(requestIdMiddleware);

  protectedApp.get("/protected", requireAuth, (req, res) => {
    res.status(200).json({
      requestId: req.requestId,
      user: req.authUser
    });
  });

  protectedApp.get("/admin", requireAuth, requireAdminRole, (req, res) => {
    res.status(200).json({
      requestId: req.requestId,
      user: req.authUser
    });
  });

  protectedApp.use(notFoundHandler);
  protectedApp.use(errorHandler);

  return protectedApp;
}

describe("auth middleware and role guards", () => {
  const protectedApp = createProtectedApp();

  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("GET /protected returns 401 when the Authorization header is missing", async () => {
    const response = await request(protectedApp).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("GET /protected returns 401 when the bearer token is invalid", async () => {
    const response = await request(protectedApp)
      .get("/protected")
      .set("Authorization", "Bearer definitely-not-a-jwt");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("GET /protected allows an ACTIVE user with a valid access token", async () => {
    const fixture = await createUserFixture({
      email: "active@example.com",
      username: "active_user"
    });
    const accessToken = await issueAccessToken(fixture.user);

    const response = await request(protectedApp)
      .get("/protected")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: fixture.user.id,
      role: "USER",
      status: "ACTIVE",
      username: "active_user"
    });
  });

  test("GET /protected returns 403 when the user was banned after the access token was issued", async () => {
    const fixture = await createUserFixture({
      email: "banned-later@example.com",
      username: "banned_later_user"
    });
    const accessToken = await issueAccessToken(fixture.user);

    await prisma.user.update({
      where: { id: fixture.user.id },
      data: { status: "BANNED" }
    });

    const response = await request(protectedApp)
      .get("/protected")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("AUTH_FORBIDDEN");
    expect(response.body.error.message).toBe("Forbidden.");
  });

  test("GET /admin returns 403 when the user is no longer an admin even if the old token still says ADMIN", async () => {
    const fixture = await createUserFixture({
      email: "downgraded-admin@example.com",
      role: "ADMIN",
      username: "downgraded_admin"
    });
    const accessToken = await issueAccessToken(fixture.user);

    await prisma.user.update({
      where: { id: fixture.user.id },
      data: { role: "USER" }
    });

    const response = await request(protectedApp)
      .get("/admin")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("AUTH_FORBIDDEN");
    expect(response.body.error.message).toBe("Forbidden.");
  });

  test("GET /admin allows a current ADMIN user with a valid access token", async () => {
    const fixture = await createUserFixture({
      email: "admin@example.com",
      role: "ADMIN",
      username: "admin_user"
    });
    const accessToken = await issueAccessToken(fixture.user);

    const response = await request(protectedApp)
      .get("/admin")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: fixture.user.id,
      role: "ADMIN",
      status: "ACTIVE",
      username: "admin_user"
    });
  });
});

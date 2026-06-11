import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { AUTH_INVALID_CREDENTIALS_MESSAGE } from "./auth.errors.js";
import { hashPassword, verifyPassword } from "./password.js";

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
      email: overrides.email ?? "fixture@example.com",
      username: overrides.username ?? "fixture_user",
      displayName: overrides.displayName ?? "Fixture User",
      passwordHash,
      status: overrides.status ?? "ACTIVE"
    }
  });

  return { password, user };
}

describe("auth register/login API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("POST /api/v1/auth/register creates an active user with a hashed password", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      displayName: "  Alice Demo  ",
      username: "  Alice_Demo  ",
      email: "  Alice.Demo@Example.COM  ",
      password: "Password123!",
      confirmPassword: "Password123!"
    });

    expect(response.status).toBe(201);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.body.user).toMatchObject({
      email: "alice.demo@example.com",
      username: "alice_demo",
      displayName: "Alice Demo",
      role: "USER",
      status: "ACTIVE"
    });
    expect(response.body.user.passwordHash).toBeUndefined();

    const createdUser = await prisma.user.findUnique({
      where: { email: "alice.demo@example.com" }
    });

    expect(createdUser).not.toBeNull();
    expect(createdUser?.passwordHash).not.toBe("Password123!");
    await expect(
      verifyPassword("Password123!", createdUser?.passwordHash ?? "")
    ).resolves.toBe(true);
  });

  test("POST /api/v1/auth/register rejects invalid request bodies with a validation error", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      displayName: "Bad Register",
      username: "bad-register",
      email: "not-an-email",
      password: "password",
      confirmPassword: "password"
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid request body.");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "email"
        })
      ])
    );
  });

  test("POST /api/v1/auth/register rejects duplicate email addresses", async () => {
    await createUserFixture({
      email: "duplicate@example.com",
      username: "existing_user"
    });

    const response = await request(app).post("/api/v1/auth/register").send({
      displayName: "Another User",
      username: "another_user",
      email: "duplicate@example.com",
      password: "Password123!",
      confirmPassword: "Password123!"
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("AUTH_EMAIL_IN_USE");
    expect(response.body.error.message).toBe("Email is already in use.");
  });

  test("POST /api/v1/auth/register rejects duplicate usernames", async () => {
    await createUserFixture({
      email: "existing@example.com",
      username: "existing_user"
    });

    const response = await request(app).post("/api/v1/auth/register").send({
      displayName: "Another User",
      username: "existing_user",
      email: "another@example.com",
      password: "Password123!",
      confirmPassword: "Password123!"
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("AUTH_USERNAME_IN_USE");
    expect(response.body.error.message).toBe("Username is already in use.");
  });

  test("POST /api/v1/auth/login returns an access token for active users without exposing refresh tokens", async () => {
    const fixture = await createUserFixture({
      email: "login@example.com",
      username: "login_user",
      displayName: "Login User",
      password: "Password123!"
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      identifier: "  LOGIN_USER  ",
      password: fixture.password
    });

    expect(response.status).toBe(200);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.accessToken.split(".")).toHaveLength(3);
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.user).toMatchObject({
      email: "login@example.com",
      username: "login_user",
      displayName: "Login User",
      role: "USER",
      status: "ACTIVE"
    });
  });

  test("POST /api/v1/auth/login rejects wrong passwords with a generic auth error", async () => {
    await createUserFixture({
      email: "login@example.com",
      username: "login_user",
      password: "Password123!"
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      identifier: "login@example.com",
      password: "WrongPassword123!"
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(response.body.error.message).toBe(AUTH_INVALID_CREDENTIALS_MESSAGE);
  });

  test("POST /api/v1/auth/login rejects banned users with the same generic auth error", async () => {
    const fixture = await createUserFixture({
      email: "banned@example.com",
      username: "banned_user",
      password: "Password123!",
      status: "BANNED"
    });

    const response = await request(app).post("/api/v1/auth/login").send({
      identifier: "banned@example.com",
      password: fixture.password
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(response.body.error.message).toBe(AUTH_INVALID_CREDENTIALS_MESSAGE);
  });
});

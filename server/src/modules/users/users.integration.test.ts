import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "../auth/password.js";

const allowedOrigin = "http://localhost:5173";

async function createUserFixture(overrides: {
  avatarUrl?: string | null;
  bio?: string | null;
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
      bio: overrides.bio ?? null,
      displayName: overrides.displayName ?? "Profile User",
      email: overrides.email ?? "profile@example.com",
      passwordHash,
      status: overrides.status ?? "ACTIVE",
      username: overrides.username ?? "profile_user"
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

describe("users me profile API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("GET /api/v1/users/me returns the authenticated user's safe profile with counts", async () => {
    const owner = await createUserFixture({
      avatarUrl: "https://cdn.example.com/alice.png",
      bio: "Building a clean student project.",
      displayName: "Alice Owner",
      email: "alice@example.com",
      username: "alice_owner"
    });
    const followerOne = await createUserFixture({
      email: "follower1@example.com",
      username: "follower_one"
    });
    const followerTwo = await createUserFixture({
      email: "follower2@example.com",
      username: "follower_two"
    });

    await prisma.post.createMany({
      data: [
        {
          authorId: owner.user.id,
          caption: "First profile post",
          imageUrl: "https://cdn.example.com/post-1.jpg"
        },
        {
          authorId: owner.user.id,
          caption: "Second profile post",
          imageUrl: "https://cdn.example.com/post-2.jpg"
        }
      ]
    });

    await prisma.follow.createMany({
      data: [
        {
          followerId: followerOne.user.id,
          followingId: owner.user.id
        },
        {
          followerId: followerTwo.user.id,
          followingId: owner.user.id
        },
        {
          followerId: owner.user.id,
          followingId: followerOne.user.id
        }
      ]
    });

    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );

    const response = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.body.profile).toMatchObject({
      avatarUrl: "https://cdn.example.com/alice.png",
      bio: "Building a clean student project.",
      counts: {
        followers: 2,
        following: 1,
        posts: 2
      },
      displayName: "Alice Owner",
      email: "alice@example.com",
      id: owner.user.id,
      role: "USER",
      status: "ACTIVE",
      username: "alice_owner"
    });
    expect(response.body.profile.passwordHash).toBeUndefined();
  });

  test("GET /api/v1/users/me counts only visible posts in the profile summary", async () => {
    const owner = await createUserFixture({
      email: "visible-post-count@example.com",
      username: "visible_post_count"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );

    await prisma.post.createMany({
      data: [
        {
          authorId: owner.user.id,
          caption: "Visible post",
          imageUrl: "https://cdn.example.com/posts/visible.png"
        },
        {
          authorId: owner.user.id,
          caption: "Hidden post",
          imageUrl: "https://cdn.example.com/posts/hidden.png",
          isHidden: true
        },
        {
          authorId: owner.user.id,
          caption: "Deleted post",
          deletedAt: new Date("2026-06-14T05:00:00.000Z"),
          imageUrl: "https://cdn.example.com/posts/deleted.png"
        }
      ]
    });

    const response = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.profile.counts.posts).toBe(1);
  });

  test("GET /api/v1/users/me requires an authenticated access token", async () => {
    const response = await request(app).get("/api/v1/users/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("OPTIONS /api/v1/users/me returns CORS headers for the allowed client origin before a browser PATCH request", async () => {
    const response = await request(app)
      .options("/api/v1/users/me")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Content-Type"
    );
  });

  test("GET /api/v1/users/me includes CORS headers for the allowed client origin on a bearer-token browser request", async () => {
    const owner = await createUserFixture({
      email: "cors-owner@example.com",
      username: "cors_owner"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );

    const response = await request(app)
      .get("/api/v1/users/me")
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
  });

  test("PATCH /api/v1/users/me updates only the authenticated user's profile fields and returns a safe DTO", async () => {
    const owner = await createUserFixture({
      avatarUrl: "https://cdn.example.com/original.png",
      bio: "Original bio",
      displayName: "Original Name",
      email: "owner@example.com",
      username: "owner_user"
    });
    const otherUser = await createUserFixture({
      displayName: "Second User",
      email: "other@example.com",
      username: "other_user"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.username,
      owner.password
    );

    const response = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        avatarUrl: "",
        bio: "  Updated bio for defense demo.  ",
        displayName: "  Updated Owner Name  "
      });

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({
      avatarUrl: null,
      bio: "Updated bio for defense demo.",
      counts: {
        followers: 0,
        following: 0,
        posts: 0
      },
      displayName: "Updated Owner Name",
      email: "owner@example.com",
      id: owner.user.id,
      role: "USER",
      status: "ACTIVE",
      username: "owner_user"
    });
    expect(response.body.profile.passwordHash).toBeUndefined();

    const updatedOwner = await prisma.user.findUniqueOrThrow({
      where: { id: owner.user.id }
    });
    const untouchedOtherUser = await prisma.user.findUniqueOrThrow({
      where: { id: otherUser.user.id }
    });

    expect(updatedOwner.displayName).toBe("Updated Owner Name");
    expect(updatedOwner.bio).toBe("Updated bio for defense demo.");
    expect(updatedOwner.avatarUrl).toBeNull();
    expect(updatedOwner.passwordHash).toBe(owner.user.passwordHash);
    expect(untouchedOtherUser.displayName).toBe("Second User");
  });

  test("PATCH /api/v1/users/me rejects server-managed or unexpected fields so one user cannot tamper with another profile", async () => {
    const owner = await createUserFixture({
      displayName: "Owner Name",
      email: "owner@example.com",
      username: "owner_user"
    });
    const otherUser = await createUserFixture({
      displayName: "Victim User",
      email: "victim@example.com",
      username: "victim_user"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );

    const response = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        bio: "Trying to hack another profile",
        id: otherUser.user.id,
        passwordHash: "plain-text-evil",
        role: "ADMIN",
        status: "BANNED"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid request body.");

    const refreshedOwner = await prisma.user.findUniqueOrThrow({
      where: { id: owner.user.id }
    });
    const refreshedOtherUser = await prisma.user.findUniqueOrThrow({
      where: { id: otherUser.user.id }
    });

    expect(refreshedOwner.bio).toBeNull();
    expect(refreshedOwner.role).toBe("USER");
    expect(refreshedOwner.status).toBe("ACTIVE");
    expect(refreshedOtherUser.displayName).toBe("Victim User");
  });

  test("PATCH /api/v1/users/me requires an authenticated access token", async () => {
    const response = await request(app).patch("/api/v1/users/me").send({
      bio: "No token"
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("GET /api/v1/users/search returns a safe paginated search result for active users only", async () => {
    const requester = await createUserFixture({
      displayName: "Requester User",
      email: "requester@example.com",
      username: "requester_user"
    });

    await createUserFixture({
      avatarUrl: "https://cdn.example.com/alice.png",
      bio: "Builds the search slice carefully.",
      displayName: "Alice Alpha",
      email: "alice@example.com",
      username: "alice_alpha"
    });
    await createUserFixture({
      avatarUrl: "https://cdn.example.com/alina.png",
      bio: "Second active result.",
      displayName: "Alina Beta",
      email: "alina@example.com",
      username: "alina_beta"
    });
    await createUserFixture({
      avatarUrl: "https://cdn.example.com/research.png",
      bio: "Matches through display name only.",
      displayName: "Ali Researcher",
      email: "research@example.com",
      username: "research_friend"
    });
    await createUserFixture({
      displayName: "Ali Hidden",
      email: "banned@example.com",
      status: "BANNED",
      username: "ali_hidden"
    });
    await createUserFixture({
      displayName: "Bob Outside",
      email: "bob@example.com",
      username: "bob_outside"
    });

    const accessToken = await loginAndGetAccessToken(
      requester.user.email,
      requester.password
    );

    const firstPageResponse = await request(app)
      .get("/api/v1/users/search")
      .query({ limit: "2", q: "  ali  " })
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstPageResponse.status).toBe(200);
    expect(firstPageResponse.body.requestId).toMatch(/^req_/);
    expect(firstPageResponse.headers["x-request-id"]).toBe(
      firstPageResponse.body.requestId
    );
    expect(firstPageResponse.headers["access-control-allow-origin"]).toBe(
      allowedOrigin
    );
    expect(firstPageResponse.body.users).toHaveLength(2);
    expect(firstPageResponse.body.users).toEqual([
      expect.objectContaining({
        avatarUrl: "https://cdn.example.com/alice.png",
        bio: "Builds the search slice carefully.",
        displayName: "Alice Alpha",
        username: "alice_alpha"
      }),
      expect.objectContaining({
        avatarUrl: "https://cdn.example.com/alina.png",
        bio: "Second active result.",
        displayName: "Alina Beta",
        username: "alina_beta"
      })
    ]);
    expect(firstPageResponse.body.users[0].email).toBeUndefined();
    expect(firstPageResponse.body.users[0].passwordHash).toBeUndefined();
    expect(firstPageResponse.body.users[0].status).toBeUndefined();
    expect(firstPageResponse.body.pageInfo).toMatchObject({
      hasNextPage: true,
      limit: 2,
      query: "ali"
    });
    expect(firstPageResponse.body.pageInfo.nextCursor).toEqual(
      expect.any(String)
    );

    const secondPageResponse = await request(app)
      .get("/api/v1/users/search")
      .query({
        cursor: firstPageResponse.body.pageInfo.nextCursor as string,
        limit: "2",
        q: "ali"
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondPageResponse.status).toBe(200);
    expect(secondPageResponse.body.users).toHaveLength(1);
    expect(secondPageResponse.body.users[0]).toMatchObject({
      avatarUrl: "https://cdn.example.com/research.png",
      bio: "Matches through display name only.",
      displayName: "Ali Researcher",
      username: "research_friend"
    });
    expect(secondPageResponse.body.pageInfo).toMatchObject({
      hasNextPage: false,
      limit: 2,
      nextCursor: null,
      query: "ali"
    });
  });

  test("GET /api/v1/users/search rejects an invalid pagination cursor", async () => {
    const requester = await createUserFixture({
      email: "cursor-owner@example.com",
      username: "cursor_owner"
    });
    const accessToken = await loginAndGetAccessToken(
      requester.user.email,
      requester.password
    );

    const response = await request(app)
      .get("/api/v1/users/search")
      .query({
        cursor: "not-a-real-cursor",
        q: "ali"
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid query string.");
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "cursor"
        })
      ])
    );
  });

  test("GET /api/v1/users/search requires an authenticated access token", async () => {
    const response = await request(app)
      .get("/api/v1/users/search")
      .query({ q: "ali" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("OPTIONS /api/v1/users/search returns CORS headers for the allowed client origin before a browser GET request", async () => {
    const response = await request(app)
      .options("/api/v1/users/search")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
  });
});

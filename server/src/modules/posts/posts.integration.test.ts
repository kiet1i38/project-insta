import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import request from "supertest";
import { app } from "../../app.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "../auth/password.js";
import {
  ensureLocalUploadDirectory,
  resolveLocalUploadDirectory
} from "./upload.service.js";

const allowedOrigin = "http://localhost:5173";
const uploadDirectory = resolveLocalUploadDirectory(env.LOCAL_UPLOAD_DIR);
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9W4WQAAAAASUVORK5CYII=",
  "base64"
);

async function createUserFixture(overrides: {
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string;
  password?: string;
  username?: string;
} = {}) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      avatarUrl: overrides.avatarUrl ?? null,
      displayName: overrides.displayName ?? null,
      email: overrides.email ?? "poster@example.com",
      passwordHash,
      username: overrides.username ?? "poster_user"
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

async function createPostFixture(overrides: {
  authorId: string;
  caption?: string | null;
  createdAt?: Date;
  deletedAt?: Date | null;
  imageUrl?: string;
  isHidden?: boolean;
}): Promise<string> {
  const createdPost = await prisma.post.create({
    data: {
      authorId: overrides.authorId,
      caption: overrides.caption ?? null,
      createdAt: overrides.createdAt,
      deletedAt: overrides.deletedAt ?? null,
      imageUrl: overrides.imageUrl ?? "https://cdn.example.com/post.png",
      isHidden: overrides.isHidden ?? false
    }
  });

  return createdPost.id;
}

async function createCommentFixture(overrides: {
  authorId: string;
  content?: string;
  deletedAt?: Date | null;
  isHidden?: boolean;
  postId: string;
}) {
  return prisma.comment.create({
    data: {
      authorId: overrides.authorId,
      content: overrides.content ?? "Existing comment",
      deletedAt: overrides.deletedAt ?? null,
      isHidden: overrides.isHidden ?? false,
      postId: overrides.postId
    }
  });
}

async function resetUploadFiles() {
  await ensureLocalUploadDirectory(uploadDirectory);
  const uploadEntries = await readdir(uploadDirectory, { withFileTypes: true });

  await Promise.all(
    uploadEntries.map(async (entry) => {
      if (entry.name === ".gitkeep") {
        return;
      }

      await rm(join(uploadDirectory, entry.name), {
        force: true,
        recursive: true
      });
    })
  );
}

function encodeFeedCursorForTest(input: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

describe("posts API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
    await resetUploadFiles();
  });

  test("GET /api/v1/posts/feed requires an authenticated access token", async () => {
    const response = await request(app).get("/api/v1/posts/feed");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("GET /api/v1/posts/feed returns visible self and followed posts in newest-first order with a stable cursor", async () => {
    const viewer = await createUserFixture({
      avatarUrl: "https://cdn.example.com/viewer.png",
      displayName: "Viewer User",
      email: "feed-viewer@example.com",
      username: "feed_viewer"
    });
    const followedAlpha = await createUserFixture({
      avatarUrl: "https://cdn.example.com/followed-alpha.png",
      displayName: "Followed Alpha",
      email: "followed-alpha@example.com",
      username: "followed_alpha"
    });
    const followedBeta = await createUserFixture({
      avatarUrl: "https://cdn.example.com/followed-beta.png",
      displayName: "Followed Beta",
      email: "followed-beta@example.com",
      username: "followed_beta"
    });
    const unfollowed = await createUserFixture({
      avatarUrl: "https://cdn.example.com/unfollowed.png",
      displayName: "Unfollowed User",
      email: "unfollowed@example.com",
      username: "unfollowed_user"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );

    await prisma.follow.createMany({
      data: [
        {
          followerId: viewer.user.id,
          followingId: followedAlpha.user.id
        },
        {
          followerId: viewer.user.id,
          followingId: followedBeta.user.id
        }
      ]
    });

    await createPostFixture({
      authorId: viewer.user.id,
      caption: "Old self post",
      createdAt: new Date("2026-06-13T08:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/self-old.png"
    });
    const latestSelfPostId = await createPostFixture({
      authorId: viewer.user.id,
      caption: "Latest self post",
      createdAt: new Date("2026-06-13T14:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/self-latest.png"
    });
    const sameTimeAlphaPostId = await createPostFixture({
      authorId: followedAlpha.user.id,
      caption: "Alpha tie post",
      createdAt: new Date("2026-06-13T10:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/alpha-tie.png"
    });
    const sameTimeBetaPostId = await createPostFixture({
      authorId: followedBeta.user.id,
      caption: "Beta tie post",
      createdAt: new Date("2026-06-13T10:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/beta-tie.png"
    });
    await createPostFixture({
      authorId: followedAlpha.user.id,
      caption: "Hidden followed post",
      createdAt: new Date("2026-06-13T11:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/hidden-followed.png",
      isHidden: true
    });
    await createPostFixture({
      authorId: followedBeta.user.id,
      caption: "Deleted followed post",
      createdAt: new Date("2026-06-13T12:00:00.000Z"),
      deletedAt: new Date("2026-06-13T12:05:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/deleted-followed.png"
    });
    await createPostFixture({
      authorId: unfollowed.user.id,
      caption: "Unfollowed post",
      createdAt: new Date("2026-06-13T13:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/unfollowed.png"
    });

    const response = await request(app)
      .get("/api/v1/posts/feed?limit=3")
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    const tiePosts = [
      {
        author: {
          avatarUrl: followedAlpha.user.avatarUrl,
          displayName: followedAlpha.user.displayName,
          id: followedAlpha.user.id,
          username: followedAlpha.user.username
        },
        caption: "Alpha tie post",
        createdAt: "2026-06-13T10:00:00.000Z",
        id: sameTimeAlphaPostId,
        imageUrl: "https://cdn.example.com/posts/alpha-tie.png"
      },
      {
        author: {
          avatarUrl: followedBeta.user.avatarUrl,
          displayName: followedBeta.user.displayName,
          id: followedBeta.user.id,
          username: followedBeta.user.username
        },
        caption: "Beta tie post",
        createdAt: "2026-06-13T10:00:00.000Z",
        id: sameTimeBetaPostId,
        imageUrl: "https://cdn.example.com/posts/beta-tie.png"
      }
    ].sort((left, right) => right.id.localeCompare(left.id));

    expect(response.status).toBe(200);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.body.pageInfo).toEqual({
      hasNextPage: true,
      limit: 3,
      nextCursor: encodeFeedCursorForTest({
        createdAt: "2026-06-13T10:00:00.000Z",
        id: tiePosts[1].id
      })
    });
    expect(response.body.posts).toEqual([
      {
        author: {
          avatarUrl: viewer.user.avatarUrl,
          displayName: viewer.user.displayName,
          id: viewer.user.id,
          username: viewer.user.username
        },
        caption: "Latest self post",
        createdAt: "2026-06-13T14:00:00.000Z",
        id: latestSelfPostId,
        imageUrl: "https://cdn.example.com/posts/self-latest.png",
        updatedAt: expect.any(String)
      },
      {
        ...tiePosts[0],
        updatedAt: expect.any(String)
      },
      {
        ...tiePosts[1],
        updatedAt: expect.any(String)
      }
    ]);
    expect(response.body.posts[0].isHidden).toBeUndefined();
    expect(response.body.posts[0].deletedAt).toBeUndefined();
  });

  test("GET /api/v1/posts/feed uses the cursor values directly so the next page stays stable even if the cursor post was later deleted", async () => {
    const viewer = await createUserFixture({
      email: "feed-cursor-viewer@example.com",
      username: "feed_cursor_viewer"
    });
    const followed = await createUserFixture({
      email: "feed-cursor-followed@example.com",
      username: "feed_cursor_followed"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );

    await prisma.follow.create({
      data: {
        followerId: viewer.user.id,
        followingId: followed.user.id
      }
    });

    const newestPostId = await createPostFixture({
      authorId: followed.user.id,
      caption: "Newest followed post",
      createdAt: new Date("2026-06-13T14:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/cursor-newest.png"
    });
    const cursorPostId = await createPostFixture({
      authorId: viewer.user.id,
      caption: "Cursor self post",
      createdAt: new Date("2026-06-13T13:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/cursor-middle.png"
    });
    const oldestPostId = await createPostFixture({
      authorId: followed.user.id,
      caption: "Oldest followed post",
      createdAt: new Date("2026-06-13T12:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/cursor-oldest.png"
    });

    const firstPageResponse = await request(app)
      .get("/api/v1/posts/feed?limit=2")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(firstPageResponse.status).toBe(200);
    expect(firstPageResponse.body.posts).toHaveLength(2);
    expect(firstPageResponse.body.posts[0].id).toBe(newestPostId);
    expect(firstPageResponse.body.posts[1].id).toBe(cursorPostId);
    expect(firstPageResponse.body.pageInfo.nextCursor).toBe(
      encodeFeedCursorForTest({
        createdAt: "2026-06-13T13:00:00.000Z",
        id: cursorPostId
      })
    );

    await prisma.post.update({
      data: {
        deletedAt: new Date("2026-06-13T13:30:00.000Z")
      },
      where: { id: cursorPostId }
    });

    const secondPageResponse = await request(app)
      .get(
        `/api/v1/posts/feed?limit=2&cursor=${firstPageResponse.body.pageInfo.nextCursor as string}`
      )
      .set("Authorization", `Bearer ${accessToken}`);

    expect(secondPageResponse.status).toBe(200);
    expect(secondPageResponse.body.pageInfo).toEqual({
      hasNextPage: false,
      limit: 2,
      nextCursor: null
    });
    expect(secondPageResponse.body.posts).toEqual([
      expect.objectContaining({
        caption: "Oldest followed post",
        createdAt: "2026-06-13T12:00:00.000Z",
        id: oldestPostId,
        imageUrl: "https://cdn.example.com/posts/cursor-oldest.png"
      })
    ]);
  });

  test("GET /api/v1/posts/feed rejects an invalid query string", async () => {
    const viewer = await createUserFixture({
      email: "feed-validation-viewer@example.com",
      username: "feed_validation_viewer"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );

    const response = await request(app)
      .get("/api/v1/posts/feed?limit=21&cursor=not-a-real-cursor")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid query string.");
    expect(response.body.error.details).toEqual([
      {
        message: "Cursor must be a valid feed cursor.",
        path: "cursor"
      },
      {
        message: "Limit must be 20 or fewer.",
        path: "limit"
      }
    ]);
  });

  test("GET /api/v1/posts/:postId returns a visible post detail with visible comments only", async () => {
    const viewer = await createUserFixture({
      email: "post-detail-viewer@example.com",
      username: "post_detail_viewer"
    });
    const author = await createUserFixture({
      avatarUrl: "https://cdn.example.com/author.png",
      displayName: "Author Detail",
      email: "post-detail-author@example.com",
      username: "post_detail_author"
    });
    const firstCommentAuthor = await createUserFixture({
      avatarUrl: "https://cdn.example.com/commenter-1.png",
      displayName: "Commenter One",
      email: "post-detail-commenter-1@example.com",
      username: "post_detail_commenter_one"
    });
    const secondCommentAuthor = await createUserFixture({
      avatarUrl: "https://cdn.example.com/commenter-2.png",
      displayName: "Commenter Two",
      email: "post-detail-commenter-2@example.com",
      username: "post_detail_commenter_two"
    });
    const hiddenCommentAuthor = await createUserFixture({
      email: "post-detail-hidden-commenter@example.com",
      username: "post_detail_hidden_commenter"
    });
    const accessToken = await loginAndGetAccessToken(
      viewer.user.email,
      viewer.password
    );
    const postId = await createPostFixture({
      authorId: author.user.id,
      caption: "Post detail target",
      createdAt: new Date("2026-06-30T10:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/post-detail-target.png"
    });
    const olderComment = await createCommentFixture({
      authorId: firstCommentAuthor.user.id,
      content: "Older visible comment",
      postId
    });
    const newerComment = await createCommentFixture({
      authorId: secondCommentAuthor.user.id,
      content: "Newer visible comment",
      postId
    });

    await createCommentFixture({
      authorId: hiddenCommentAuthor.user.id,
      content: "Hidden comment",
      isHidden: true,
      postId
    });
    await createCommentFixture({
      authorId: hiddenCommentAuthor.user.id,
      content: "Deleted comment",
      deletedAt: new Date("2026-06-30T10:30:00.000Z"),
      postId
    });

    const response = await request(app)
      .get(`/api/v1/posts/${postId}`)
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.body.post).toEqual({
      author: {
        avatarUrl: author.user.avatarUrl,
        displayName: author.user.displayName,
        id: author.user.id,
        username: author.user.username
      },
      caption: "Post detail target",
      comments: [
        {
          author: {
            avatarUrl: firstCommentAuthor.user.avatarUrl,
            displayName: firstCommentAuthor.user.displayName,
            id: firstCommentAuthor.user.id,
            username: firstCommentAuthor.user.username
          },
          content: "Older visible comment",
          createdAt: expect.any(String),
          id: olderComment.id,
          updatedAt: expect.any(String)
        },
        {
          author: {
            avatarUrl: secondCommentAuthor.user.avatarUrl,
            displayName: secondCommentAuthor.user.displayName,
            id: secondCommentAuthor.user.id,
            username: secondCommentAuthor.user.username
          },
          content: "Newer visible comment",
          createdAt: expect.any(String),
          id: newerComment.id,
          updatedAt: expect.any(String)
        }
      ],
      createdAt: "2026-06-30T10:00:00.000Z",
      id: postId,
      imageUrl: "https://cdn.example.com/posts/post-detail-target.png",
      updatedAt: expect.any(String)
    });
  });

  test("POST /api/v1/posts/:postId/likes creates one like row even when duplicate requests race", async () => {
    const author = await createUserFixture({
      email: "like-author@example.com",
      username: "like_author"
    });
    const liker = await createUserFixture({
      email: "like-viewer@example.com",
      username: "like_viewer"
    });
    const accessToken = await loginAndGetAccessToken(
      liker.user.email,
      liker.password
    );
    const postId = await createPostFixture({
      authorId: author.user.id,
      caption: "Likeable post",
      imageUrl: "https://cdn.example.com/posts/likeable.png"
    });

    const [firstResponse, secondResponse] = await Promise.all([
      request(app)
        .post(`/api/v1/posts/${postId}/likes`)
        .set("Origin", allowedOrigin)
        .set("Authorization", `Bearer ${accessToken}`),
      request(app)
        .post(`/api/v1/posts/${postId}/likes`)
        .set("Origin", allowedOrigin)
        .set("Authorization", `Bearer ${accessToken}`)
    ]);

    for (const response of [firstResponse, secondResponse]) {
      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
      expect(response.body).toEqual({
        postId,
        requestId: expect.stringMatching(/^req_/),
        viewerHasLiked: true
      });
    }

    const likeCount = await prisma.like.count({
      where: {
        postId,
        userId: liker.user.id
      }
    });

    expect(likeCount).toBe(1);
  });

  test("DELETE /api/v1/posts/:postId/likes removes only the authenticated user's like", async () => {
    const author = await createUserFixture({
      email: "unlike-author@example.com",
      username: "unlike_author"
    });
    const liker = await createUserFixture({
      email: "unlike-viewer@example.com",
      username: "unlike_viewer"
    });
    const otherLiker = await createUserFixture({
      email: "unlike-other@example.com",
      username: "unlike_other"
    });
    const accessToken = await loginAndGetAccessToken(
      liker.user.email,
      liker.password
    );
    const postId = await createPostFixture({
      authorId: author.user.id,
      caption: "Unlike me",
      imageUrl: "https://cdn.example.com/posts/unlike-me.png"
    });

    await prisma.like.createMany({
      data: [
        {
          postId,
          userId: liker.user.id
        },
        {
          postId,
          userId: otherLiker.user.id
        }
      ]
    });

    const response = await request(app)
      .delete(`/api/v1/posts/${postId}/likes`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      postId,
      requestId: expect.stringMatching(/^req_/),
      viewerHasLiked: false
    });

    const remainingLikes = await prisma.like.findMany({
      where: { postId }
    });

    expect(remainingLikes).toHaveLength(1);
    expect(remainingLikes[0]).toMatchObject({
      postId,
      userId: otherLiker.user.id
    });
  });

  test("POST /api/v1/posts/:postId/likes rejects a deleted post", async () => {
    const author = await createUserFixture({
      email: "deleted-like-author@example.com",
      username: "deleted_like_author"
    });
    const liker = await createUserFixture({
      email: "deleted-like-viewer@example.com",
      username: "deleted_like_viewer"
    });
    const accessToken = await loginAndGetAccessToken(
      liker.user.email,
      liker.password
    );
    const deletedPostId = await createPostFixture({
      authorId: author.user.id,
      caption: "Already deleted",
      deletedAt: new Date("2026-06-14T07:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/already-deleted.png"
    });

    const response = await request(app)
      .post(`/api/v1/posts/${deletedPostId}/likes`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("POST_NOT_FOUND");
    expect(response.body.error.message).toBe("Post not found.");
    expect(
      await prisma.like.count({
        where: {
          postId: deletedPostId,
          userId: liker.user.id
        }
      })
    ).toBe(0);
  });

  test("GET /api/v1/posts/me returns the authenticated user's visible posts in newest-first order", async () => {
    const owner = await createUserFixture({
      email: "profile-grid-owner@example.com",
      username: "profile_grid_owner"
    });
    const otherUser = await createUserFixture({
      email: "profile-grid-other@example.com",
      username: "profile_grid_other"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );

    const oldestVisiblePostId = await createPostFixture({
      authorId: owner.user.id,
      caption: "Oldest visible post",
      createdAt: new Date("2026-06-12T08:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/oldest-visible.png"
    });
    const newestVisiblePostId = await createPostFixture({
      authorId: owner.user.id,
      caption: "Newest visible post",
      createdAt: new Date("2026-06-12T10:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/newest-visible.png"
    });
    await createPostFixture({
      authorId: owner.user.id,
      caption: "Hidden post",
      createdAt: new Date("2026-06-12T11:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/hidden.png",
      isHidden: true
    });
    await createPostFixture({
      authorId: owner.user.id,
      caption: "Deleted post",
      createdAt: new Date("2026-06-12T12:00:00.000Z"),
      deletedAt: new Date("2026-06-12T12:05:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/deleted.png"
    });
    await createPostFixture({
      authorId: otherUser.user.id,
      caption: "Other user's post",
      createdAt: new Date("2026-06-12T13:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/other-user.png"
    });

    const response = await request(app)
      .get("/api/v1/posts/me")
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.body.posts).toEqual([
      {
        authorId: owner.user.id,
        caption: "Newest visible post",
        createdAt: "2026-06-12T10:00:00.000Z",
        id: newestVisiblePostId,
        imageUrl: "https://cdn.example.com/posts/newest-visible.png",
        updatedAt: expect.any(String)
      },
      {
        authorId: owner.user.id,
        caption: "Oldest visible post",
        createdAt: "2026-06-12T08:00:00.000Z",
        id: oldestVisiblePostId,
        imageUrl: "https://cdn.example.com/posts/oldest-visible.png",
        updatedAt: expect.any(String)
      }
    ]);
    expect(response.body.posts[0].isHidden).toBeUndefined();
    expect(response.body.posts[0].deletedAt).toBeUndefined();
  });

  test("DELETE /api/v1/posts/:postId soft deletes the owner's post and removes it from the profile grid feed", async () => {
    const owner = await createUserFixture({
      email: "delete-owner@example.com",
      username: "delete_owner"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );
    const ownedPostId = await createPostFixture({
      authorId: owner.user.id,
      caption: "Delete me",
      createdAt: new Date("2026-06-12T09:00:00.000Z"),
      imageUrl: "https://cdn.example.com/posts/delete-me.png"
    });

    const deleteResponse = await request(app)
      .delete(`/api/v1/posts/${ownedPostId}`)
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({
      deletedPostId: ownedPostId,
      requestId: expect.stringMatching(/^req_/)
    });
    expect(deleteResponse.headers["x-request-id"]).toBe(
      deleteResponse.body.requestId
    );
    expect(deleteResponse.headers["access-control-allow-origin"]).toBe(
      allowedOrigin
    );
    expect(deleteResponse.headers["access-control-allow-credentials"]).toBe(
      "true"
    );

    const deletedPost = await prisma.post.findUniqueOrThrow({
      where: { id: ownedPostId }
    });
    expect(deletedPost.deletedAt).toEqual(expect.any(Date));

    const profilePostsResponse = await request(app)
      .get("/api/v1/posts/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(profilePostsResponse.status).toBe(200);
    expect(profilePostsResponse.body.posts).toEqual([]);
  });

  test("DELETE /api/v1/posts/:postId rejects a non-owner non-admin user", async () => {
    const owner = await createUserFixture({
      email: "forbidden-owner@example.com",
      username: "forbidden_owner"
    });
    const intruder = await createUserFixture({
      email: "forbidden-intruder@example.com",
      username: "forbidden_intruder"
    });
    const accessToken = await loginAndGetAccessToken(
      intruder.user.email,
      intruder.password
    );
    const ownedPostId = await createPostFixture({
      authorId: owner.user.id,
      caption: "Owner post",
      imageUrl: "https://cdn.example.com/posts/owner-post.png"
    });

    const response = await request(app)
      .delete(`/api/v1/posts/${ownedPostId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("AUTH_FORBIDDEN");
    expect(response.body.error.message).toBe("Forbidden.");

    const untouchedPost = await prisma.post.findUniqueOrThrow({
      where: { id: ownedPostId }
    });
    expect(untouchedPost.deletedAt).toBeNull();
  });

  test("DELETE /api/v1/posts/:postId allows an admin to soft delete another user's post", async () => {
    const owner = await createUserFixture({
      email: "admin-delete-owner@example.com",
      username: "admin_delete_owner"
    });
    const adminPassword = "Password123!";
    const admin = await prisma.user.create({
      data: {
        email: "admin-delete@example.com",
        passwordHash: await hashPassword(adminPassword),
        role: "ADMIN",
        username: "admin_delete_user"
      }
    });
    const accessToken = await loginAndGetAccessToken(admin.email, adminPassword);
    const ownedPostId = await createPostFixture({
      authorId: owner.user.id,
      caption: "Admin can remove this",
      imageUrl: "https://cdn.example.com/posts/admin-delete.png"
    });

    const response = await request(app)
      .delete(`/api/v1/posts/${ownedPostId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.deletedPostId).toBe(ownedPostId);

    const deletedPost = await prisma.post.findUniqueOrThrow({
      where: { id: ownedPostId }
    });
    expect(deletedPost.deletedAt).toEqual(expect.any(Date));
  });

  test("POST /api/v1/posts creates a post, stores the local image file, and returns a safe DTO", async () => {
    const owner = await createUserFixture({
      email: "alice.poster@example.com",
      username: "alice_poster"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );

    const response = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("caption", "  First local post  ")
      .attach("image", onePixelPng, {
        contentType: "image/png",
        filename: "hello.png"
      });

    expect(response.status).toBe(201);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.body.post).toMatchObject({
      authorId: owner.user.id,
      caption: "First local post",
      imageUrl: expect.stringMatching(/^\/uploads\/post-.*\.png$/)
    });
    expect(response.body.post.isHidden).toBeUndefined();
    expect(response.body.post.deletedAt).toBeUndefined();

    const createdPost = await prisma.post.findUniqueOrThrow({
      where: { id: response.body.post.id }
    });
    expect(createdPost.authorId).toBe(owner.user.id);
    expect(createdPost.caption).toBe("First local post");
    expect(createdPost.imageUrl).toBe(response.body.post.imageUrl);

    const storedFilename = response.body.post.imageUrl.replace("/uploads/", "");
    const storedFilePath = join(uploadDirectory, storedFilename);
    const storedFileStats = await stat(storedFilePath);
    const storedFileBuffer = await readFile(storedFilePath);

    expect(storedFileStats.isFile()).toBe(true);
    expect(storedFileBuffer.equals(onePixelPng)).toBe(true);
  });

  test("POST /api/v1/posts requires an authenticated access token", async () => {
    const response = await request(app)
      .post("/api/v1/posts")
      .field("caption", "No auth")
      .attach("image", onePixelPng, {
        contentType: "image/png",
        filename: "no-auth.png"
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("POST /api/v1/posts rejects a request with no image file", async () => {
    const owner = await createUserFixture({
      email: "missing-image@example.com",
      username: "missing_image_user"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );

    const response = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("caption", "Missing image");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid multipart form data.");
    expect(response.body.error.details).toEqual([
      {
        message: "Image file is required.",
        path: "image"
      }
    ]);
  });

  test("POST /api/v1/posts rejects an unsupported upload type", async () => {
    const owner = await createUserFixture({
      email: "bad-image@example.com",
      username: "bad_image_user"
    });
    const accessToken = await loginAndGetAccessToken(
      owner.user.email,
      owner.password
    );

    const response = await request(app)
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("caption", "Bad upload")
      .attach("image", Buffer.from("<svg></svg>", "utf8"), {
        contentType: "image/svg+xml",
        filename: "bad.svg"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UPLOAD_INVALID_TYPE");
    expect(response.body.error.message).toBe(
      "Only JPEG, PNG, and WebP images are allowed."
    );
  });

  test("OPTIONS /api/v1/posts returns CORS headers for the allowed client origin before a browser POST request", async () => {
    const response = await request(app)
      .options("/api/v1/posts")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Content-Type"
    );
  });

  test("OPTIONS /api/v1/posts/feed returns CORS headers for the allowed client origin before a browser GET request with Authorization", async () => {
    const response = await request(app)
      .options("/api/v1/posts/feed")
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

  test("OPTIONS /api/v1/posts/:postId returns CORS headers for the allowed client origin before a browser DELETE request", async () => {
    const response = await request(app)
      .options("/api/v1/posts/test-post-id")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "DELETE")
      .set("Access-Control-Request-Headers", "authorization");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
  });

  test("OPTIONS /api/v1/posts/:postId/likes returns CORS headers for the allowed client origin before a browser POST request", async () => {
    const response = await request(app)
      .options("/api/v1/posts/test-post-id/likes")
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization"
    );
  });

  test("resetUploadFiles tolerates a missing local upload directory so CI can start from a clean checkout", async () => {
    await rm(uploadDirectory, { force: true, recursive: true });

    await resetUploadFiles();

    const directoryStats = await stat(uploadDirectory);
    expect(directoryStats.isDirectory()).toBe(true);
  });
});

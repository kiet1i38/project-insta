import request from "supertest";
import { app } from "../../app.js";
import { prisma } from "../../db/prisma.js";
import { resetDatabaseTables } from "../../test/testDatabase.js";
import { hashPassword } from "../auth/password.js";

const allowedOrigin = "http://localhost:5173";

async function createUserFixture(overrides: {
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
      email: overrides.email ?? "commenter@example.com",
      passwordHash,
      role: overrides.role ?? "USER",
      status: overrides.status ?? "ACTIVE",
      username: overrides.username ?? "commenter_user"
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
  deletedAt?: Date | null;
  imageUrl?: string;
  isHidden?: boolean;
}) {
  return prisma.post.create({
    data: {
      authorId: overrides.authorId,
      caption: overrides.caption ?? null,
      deletedAt: overrides.deletedAt ?? null,
      imageUrl: overrides.imageUrl ?? "https://cdn.example.com/posts/comment.png",
      isHidden: overrides.isHidden ?? false
    }
  });
}

async function createCommentFixture(overrides: {
  authorId: string;
  content?: string;
  deletedAt?: Date | null;
  postId: string;
}) {
  return prisma.comment.create({
    data: {
      authorId: overrides.authorId,
      content: overrides.content ?? "Existing comment",
      deletedAt: overrides.deletedAt ?? null,
      postId: overrides.postId
    }
  });
}

describe("comments API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
  });

  test("POST /api/v1/posts/:postId/comments creates a trimmed comment on a visible post and returns a safe DTO", async () => {
    const author = await createUserFixture({
      email: "comment-post-author@example.com",
      username: "comment_post_author"
    });
    const commenter = await createUserFixture({
      email: "comment-viewer@example.com",
      username: "comment_viewer"
    });
    const accessToken = await loginAndGetAccessToken(
      commenter.user.email,
      commenter.password
    );
    const post = await createPostFixture({
      authorId: author.user.id,
      caption: "Comment target"
    });

    const response = await request(app)
      .post(`/api/v1/posts/${post.id}/comments`)
      .set("Origin", allowedOrigin)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        content: "  First real comment.  "
      });

    expect(response.status).toBe(201);
    expect(response.body.requestId).toMatch(/^req_/);
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["vary"]).toContain("Origin");
    expect(response.body.comment).toEqual({
      authorId: commenter.user.id,
      content: "First real comment.",
      createdAt: expect.any(String),
      id: expect.any(String),
      postId: post.id,
      updatedAt: expect.any(String)
    });
    expect(response.body.comment.isHidden).toBeUndefined();
    expect(response.body.comment.deletedAt).toBeUndefined();

    const createdComment = await prisma.comment.findUniqueOrThrow({
      where: { id: response.body.comment.id as string }
    });

    expect(createdComment).toMatchObject({
      authorId: commenter.user.id,
      content: "First real comment.",
      postId: post.id
    });
    expect(createdComment.deletedAt).toBeNull();
  });

  test("POST /api/v1/posts/:postId/comments rejects an empty comment body", async () => {
    const author = await createUserFixture({
      email: "empty-comment-author@example.com",
      username: "empty_comment_author"
    });
    const commenter = await createUserFixture({
      email: "empty-comment-viewer@example.com",
      username: "empty_comment_viewer"
    });
    const accessToken = await loginAndGetAccessToken(
      commenter.user.email,
      commenter.password
    );
    const post = await createPostFixture({
      authorId: author.user.id
    });

    const response = await request(app)
      .post(`/api/v1/posts/${post.id}/comments`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        content: "   "
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Invalid request body.");
    expect(response.body.error.details).toEqual([
      {
        message: "Comment content is required.",
        path: "content"
      }
    ]);
    expect(
      await prisma.comment.count({
        where: {
          authorId: commenter.user.id,
          postId: post.id
        }
      })
    ).toBe(0);
  });

  test("POST /api/v1/posts/:postId/comments hides deleted posts behind POST_NOT_FOUND", async () => {
    const author = await createUserFixture({
      email: "deleted-post-author@example.com",
      username: "deleted_post_author"
    });
    const commenter = await createUserFixture({
      email: "deleted-post-commenter@example.com",
      username: "deleted_post_commenter"
    });
    const accessToken = await loginAndGetAccessToken(
      commenter.user.email,
      commenter.password
    );
    const deletedPost = await createPostFixture({
      authorId: author.user.id,
      deletedAt: new Date("2026-06-14T18:00:00.000Z")
    });

    const response = await request(app)
      .post(`/api/v1/posts/${deletedPost.id}/comments`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        content: "Should not be created"
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("POST_NOT_FOUND");
    expect(response.body.error.message).toBe("Post not found.");
    expect(
      await prisma.comment.count({
        where: {
          postId: deletedPost.id
        }
      })
    ).toBe(0);
  });

  test("POST /api/v1/posts/:postId/comments requires an authenticated access token", async () => {
    const author = await createUserFixture({
      email: "comment-auth-author@example.com",
      username: "comment_auth_author"
    });
    const post = await createPostFixture({
      authorId: author.user.id
    });

    const response = await request(app)
      .post(`/api/v1/posts/${post.id}/comments`)
      .send({
        content: "No token comment"
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.error.message).toBe("Authentication required.");
  });

  test("DELETE /api/v1/comments/:commentId lets the comment author soft delete their own comment", async () => {
    const postAuthor = await createUserFixture({
      email: "comment-delete-post-author@example.com",
      username: "comment_delete_post_author"
    });
    const commenter = await createUserFixture({
      email: "comment-delete-author@example.com",
      username: "comment_delete_author"
    });
    const accessToken = await loginAndGetAccessToken(
      commenter.user.email,
      commenter.password
    );
    const post = await createPostFixture({
      authorId: postAuthor.user.id
    });
    const comment = await createCommentFixture({
      authorId: commenter.user.id,
      content: "Delete my own comment",
      postId: post.id
    });

    const response = await request(app)
      .delete(`/api/v1/comments/${comment.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      deletedCommentId: comment.id,
      requestId: expect.stringMatching(/^req_/)
    });

    const deletedComment = await prisma.comment.findUniqueOrThrow({
      where: { id: comment.id }
    });
    expect(deletedComment.deletedAt).toEqual(expect.any(Date));
  });

  test("DELETE /api/v1/comments/:commentId lets the post owner soft delete another user's comment", async () => {
    const postAuthor = await createUserFixture({
      email: "comment-owner-post@example.com",
      username: "comment_owner_post"
    });
    const commenter = await createUserFixture({
      email: "comment-owner-commenter@example.com",
      username: "comment_owner_commenter"
    });
    const accessToken = await loginAndGetAccessToken(
      postAuthor.user.email,
      postAuthor.password
    );
    const post = await createPostFixture({
      authorId: postAuthor.user.id
    });
    const comment = await createCommentFixture({
      authorId: commenter.user.id,
      content: "Post owner can delete this",
      postId: post.id
    });

    const response = await request(app)
      .delete(`/api/v1/comments/${comment.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.deletedCommentId).toBe(comment.id);

    const deletedComment = await prisma.comment.findUniqueOrThrow({
      where: { id: comment.id }
    });
    expect(deletedComment.deletedAt).toEqual(expect.any(Date));
  });

  test("DELETE /api/v1/comments/:commentId lets an admin soft delete another user's comment", async () => {
    const postAuthor = await createUserFixture({
      email: "comment-admin-post@example.com",
      username: "comment_admin_post"
    });
    const commenter = await createUserFixture({
      email: "comment-admin-commenter@example.com",
      username: "comment_admin_commenter"
    });
    const admin = await createUserFixture({
      email: "comment-admin@example.com",
      role: "ADMIN",
      username: "comment_admin"
    });
    const accessToken = await loginAndGetAccessToken(
      admin.user.email,
      admin.password
    );
    const post = await createPostFixture({
      authorId: postAuthor.user.id
    });
    const comment = await createCommentFixture({
      authorId: commenter.user.id,
      content: "Admin can delete this",
      postId: post.id
    });

    const response = await request(app)
      .delete(`/api/v1/comments/${comment.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.deletedCommentId).toBe(comment.id);

    const deletedComment = await prisma.comment.findUniqueOrThrow({
      where: { id: comment.id }
    });
    expect(deletedComment.deletedAt).toEqual(expect.any(Date));
  });

  test("DELETE /api/v1/comments/:commentId rejects an unrelated non-admin user", async () => {
    const postAuthor = await createUserFixture({
      email: "comment-forbidden-post@example.com",
      username: "comment_forbidden_post"
    });
    const commenter = await createUserFixture({
      email: "comment-forbidden-commenter@example.com",
      username: "comment_forbidden_commenter"
    });
    const intruder = await createUserFixture({
      email: "comment-forbidden-intruder@example.com",
      username: "comment_forbidden_intruder"
    });
    const accessToken = await loginAndGetAccessToken(
      intruder.user.email,
      intruder.password
    );
    const post = await createPostFixture({
      authorId: postAuthor.user.id
    });
    const comment = await createCommentFixture({
      authorId: commenter.user.id,
      content: "Intruder should not delete this",
      postId: post.id
    });

    const response = await request(app)
      .delete(`/api/v1/comments/${comment.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("AUTH_FORBIDDEN");
    expect(response.body.error.message).toBe("Forbidden.");

    const untouchedComment = await prisma.comment.findUniqueOrThrow({
      where: { id: comment.id }
    });
    expect(untouchedComment.deletedAt).toBeNull();
  });

  test("OPTIONS /api/v1/posts/:postId/comments returns CORS headers for the allowed client origin before a browser POST request", async () => {
    const response = await request(app)
      .options("/api/v1/posts/test-post-id/comments")
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

  test("OPTIONS /api/v1/comments/:commentId returns CORS headers for the allowed client origin before a browser DELETE request", async () => {
    const response = await request(app)
      .options("/api/v1/comments/test-comment-id")
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
});

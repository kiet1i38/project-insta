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
  email?: string;
  password?: string;
  username?: string;
} = {}) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
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

describe("posts create API", () => {
  beforeEach(async () => {
    await resetDatabaseTables(prisma);
    await resetUploadFiles();
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

  test("resetUploadFiles tolerates a missing local upload directory so CI can start from a clean checkout", async () => {
    await rm(uploadDirectory, { force: true, recursive: true });

    await resetUploadFiles();

    const directoryStats = await stat(uploadDirectory);
    expect(directoryStats.isDirectory()).toBe(true);
  });
});

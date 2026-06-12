import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import {
  MAX_UPLOAD_DIMENSION_PX,
  MAX_UPLOAD_SIZE_BYTES,
  UPLOAD_DIMENSIONS_INVALID_CODE,
  UPLOAD_FILE_TOO_LARGE_CODE,
  UPLOAD_INVALID_IMAGE_CODE,
  UPLOAD_INVALID_TYPE_CODE,
  buildStoredImageFilename,
  ensureLocalUploadDirectory,
  resolveLocalUploadDirectory,
  validateImageUpload
} from "./upload.service.js";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9W4WQAAAAASUVORK5CYII=",
  "base64"
);

const tempDirectories: string[] = [];

function createPaddedImage(size: number): Buffer {
  return Buffer.concat([onePixelPng, Buffer.alloc(size - onePixelPng.length)]);
}

function createTallPng(height: number): Buffer {
  const buffer = Buffer.from(onePixelPng);

  buffer.writeUInt32BE(1, 16);
  buffer.writeUInt32BE(height, 20);

  return buffer;
}

function expectUploadError(action: () => unknown, expectedCode: string) {
  try {
    action();
    throw new Error("Expected upload validation to throw.");
  } catch (error) {
    expect(error).toMatchObject({
      code: expectedCode
    });
  }
}

describe("upload service", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  test("validateImageUpload accepts a real PNG at the configured maximum size and returns safe metadata", () => {
    const upload = validateImageUpload({
      buffer: createPaddedImage(MAX_UPLOAD_SIZE_BYTES),
      mimeType: "image/png",
      originalName: "../../../avatar.png"
    });

    expect(upload).toMatchObject({
      contentType: "image/png",
      extension: "png",
      height: 1,
      sizeBytes: MAX_UPLOAD_SIZE_BYTES,
      width: 1
    });
    expect(upload.storageFilename).toMatch(
      /^post-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/
    );
    expect(upload.storageFilename).not.toContain("avatar");
  });

  test("validateImageUpload rejects an unsupported mime type before any storage step", () => {
    expectUploadError(
      () =>
      validateImageUpload({
        buffer: Buffer.from("<svg></svg>", "utf8"),
        mimeType: "image/svg+xml",
        originalName: "avatar.svg"
      }),
      UPLOAD_INVALID_TYPE_CODE
    );
  });

  test("validateImageUpload rejects a mime type that does not match the image magic bytes", () => {
    expectUploadError(
      () =>
      validateImageUpload({
        buffer: onePixelPng,
        mimeType: "image/jpeg",
        originalName: "avatar.jpg"
      }),
      UPLOAD_INVALID_IMAGE_CODE
    );
  });

  test("validateImageUpload rejects a file that is one byte over the size limit", () => {
    expectUploadError(
      () =>
      validateImageUpload({
        buffer: createPaddedImage(MAX_UPLOAD_SIZE_BYTES + 1),
        mimeType: "image/png",
        originalName: "too-large.png"
      }),
      UPLOAD_FILE_TOO_LARGE_CODE
    );
  });

  test("validateImageUpload rejects an image with extreme dimensions", () => {
    expectUploadError(
      () =>
      validateImageUpload({
        buffer: createTallPng(MAX_UPLOAD_DIMENSION_PX + 1),
        mimeType: "image/png",
        originalName: "tall.png"
      }),
      UPLOAD_DIMENSIONS_INVALID_CODE
    );
  });

  test("buildStoredImageFilename returns unique generated names", () => {
    const first = buildStoredImageFilename("jpeg");
    const second = buildStoredImageFilename("jpeg");

    expect(first).toMatch(
      /^post-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/
    );
    expect(second).toMatch(
      /^post-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/
    );
    expect(first).not.toBe(second);
  });

  test("ensureLocalUploadDirectory creates the configured directory recursively", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "cloneinsta-upload-"));
    tempDirectories.push(tempRoot);
    const nestedUploadDirectory = join(tempRoot, "nested", "uploads");

    await ensureLocalUploadDirectory(nestedUploadDirectory);

    const directoryStats = await stat(nestedUploadDirectory);
    expect(directoryStats.isDirectory()).toBe(true);
  });

  test("resolveLocalUploadDirectory keeps repo-root relative upload paths stable", () => {
    const resolvedDirectory = resolveLocalUploadDirectory("server/uploads");

    expect(resolvedDirectory.endsWith(join("server", "uploads"))).toBe(true);
    expect(resolvedDirectory.endsWith(join("server", "server", "uploads"))).toBe(
      false
    );
  });
});

import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/appError.js";

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_DIMENSION_PX = 4096;
export const UPLOAD_INVALID_TYPE_CODE = "UPLOAD_INVALID_TYPE";
export const UPLOAD_INVALID_IMAGE_CODE = "UPLOAD_INVALID_IMAGE";
export const UPLOAD_FILE_TOO_LARGE_CODE = "UPLOAD_FILE_TOO_LARGE";
export const UPLOAD_DIMENSIONS_INVALID_CODE = "UPLOAD_DIMENSIONS_INVALID";

const allowedMimeTypeToImageType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

type AllowedImageMimeType = keyof typeof allowedMimeTypeToImageType;
type AllowedImageType = (typeof allowedMimeTypeToImageType)[AllowedImageMimeType];
type FilenameImageType = AllowedImageType | "jpeg";

type ValidateImageUploadInput = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
};

type ValidatedImageUpload = {
  contentType: AllowedImageMimeType;
  extension: AllowedImageType;
  height: number;
  originalName: string;
  sizeBytes: number;
  storageFilename: string;
  width: number;
};

const repositoryRootDirectory = fileURLToPath(
  new URL("../../../../", import.meta.url)
);

function createUploadInvalidTypeError(): AppError {
  return new AppError(
    400,
    UPLOAD_INVALID_TYPE_CODE,
    "Only JPEG, PNG, and WebP images are allowed."
  );
}

function createUploadInvalidImageError(): AppError {
  return new AppError(
    400,
    UPLOAD_INVALID_IMAGE_CODE,
    "Uploaded file is not a valid image."
  );
}

function createUploadFileTooLargeError(): AppError {
  return new AppError(
    413,
    UPLOAD_FILE_TOO_LARGE_CODE,
    "Image must be 5 MB or smaller."
  );
}

function createUploadDimensionsInvalidError(): AppError {
  return new AppError(
    400,
    UPLOAD_DIMENSIONS_INVALID_CODE,
    `Image width and height must be ${MAX_UPLOAD_DIMENSION_PX}px or smaller.`
  );
}

function isAllowedMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return mimeType in allowedMimeTypeToImageType;
}

function normalizeFilenameImageType(imageType: FilenameImageType): AllowedImageType {
  return imageType === "jpeg" ? "jpg" : imageType;
}

export function buildStoredImageFilename(imageType: FilenameImageType): string {
  return `post-${randomUUID()}.${normalizeFilenameImageType(imageType)}`;
}

export function resolveLocalUploadDirectory(directory: string): string {
  if (isAbsolute(directory)) {
    return directory;
  }

  return resolve(repositoryRootDirectory, directory);
}

export async function ensureLocalUploadDirectory(
  directory: string = env.LOCAL_UPLOAD_DIR
): Promise<string> {
  const resolvedDirectory = resolveLocalUploadDirectory(directory);

  await mkdir(resolvedDirectory, { recursive: true });

  return resolvedDirectory;
}

export function validateImageUpload(
  input: ValidateImageUploadInput
): ValidatedImageUpload {
  if (!isAllowedMimeType(input.mimeType)) {
    throw createUploadInvalidTypeError();
  }

  if (input.buffer.byteLength > MAX_UPLOAD_SIZE_BYTES) {
    throw createUploadFileTooLargeError();
  }

  let dimensions: ReturnType<typeof imageSize>;

  try {
    dimensions = imageSize(input.buffer);
  } catch {
    throw createUploadInvalidImageError();
  }

  const expectedType = allowedMimeTypeToImageType[input.mimeType];

  if (
    !dimensions.width ||
    !dimensions.height ||
    !dimensions.type ||
    dimensions.type !== expectedType
  ) {
    throw createUploadInvalidImageError();
  }

  if (
    dimensions.width > MAX_UPLOAD_DIMENSION_PX ||
    dimensions.height > MAX_UPLOAD_DIMENSION_PX
  ) {
    throw createUploadDimensionsInvalidError();
  }

  return {
    contentType: input.mimeType,
    extension: expectedType,
    height: dimensions.height,
    originalName: input.originalName,
    sizeBytes: input.buffer.byteLength,
    storageFilename: buildStoredImageFilename(expectedType),
    width: dimensions.width
  };
}

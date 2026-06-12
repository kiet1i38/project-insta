import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPostRecord } from "./posts.repository.js";
import {
  ensureLocalUploadDirectory,
  validateImageUpload
} from "./upload.service.js";

type CreatePostInput = {
  authorId: string;
  caption: string | null | undefined;
  image: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  };
};

type PostDto = {
  authorId: string;
  caption: string | null;
  createdAt: Date;
  id: string;
  imageUrl: string;
  updatedAt: Date;
};

function toPostDto(post: {
  authorId: string;
  caption: string | null;
  createdAt: Date;
  id: string;
  imageUrl: string;
  updatedAt: Date;
}): PostDto {
  return {
    authorId: post.authorId,
    caption: post.caption,
    createdAt: post.createdAt,
    id: post.id,
    imageUrl: post.imageUrl,
    updatedAt: post.updatedAt
  };
}

export async function createPost(input: CreatePostInput): Promise<PostDto> {
  const validatedImage = validateImageUpload({
    buffer: input.image.buffer,
    mimeType: input.image.mimeType,
    originalName: input.image.originalName
  });
  const uploadDirectory = await ensureLocalUploadDirectory();
  const storedFilePath = join(uploadDirectory, validatedImage.storageFilename);
  const imageUrl = `/uploads/${validatedImage.storageFilename}`;

  await writeFile(storedFilePath, input.image.buffer);

  try {
    const post = await createPostRecord({
      authorId: input.authorId,
      caption: input.caption,
      imageUrl
    });

    return toPostDto(post);
  } catch (error) {
    await rm(storedFilePath, { force: true });
    throw error;
  }
}

import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AppError } from "../../lib/appError.js";
import { createForbiddenError } from "../auth/auth.errors.js";
import {
  createPostRecord,
  findFeedPostsForViewer,
  findActivePostById,
  findVisiblePostsByAuthorId,
  type FeedPostRecord,
  softDeletePostById
} from "./posts.repository.js";
import type { FeedCursor } from "./posts.schema.js";
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

type DeletePostInput = {
  actor: {
    id: string;
    role: "USER" | "ADMIN";
  };
  postId: string;
};

type GetFeedInput = {
  cursor?: FeedCursor;
  limit: number;
  viewerId: string;
};

type FeedPostDto = {
  author: {
    avatarUrl: string | null;
    displayName: string | null;
    id: string;
    username: string;
  };
  caption: string | null;
  createdAt: Date;
  id: string;
  imageUrl: string;
  updatedAt: Date;
};

type FeedPostsDto = {
  pageInfo: {
    hasNextPage: boolean;
    limit: number;
    nextCursor: string | null;
  };
  posts: FeedPostDto[];
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

function toFeedPostDto(post: FeedPostRecord): FeedPostDto {
  return {
    author: {
      avatarUrl: post.author.avatarUrl,
      displayName: post.author.displayName,
      id: post.author.id,
      username: post.author.username
    },
    caption: post.caption,
    createdAt: post.createdAt,
    id: post.id,
    imageUrl: post.imageUrl,
    updatedAt: post.updatedAt
  };
}

function createPostNotFoundError(): AppError {
  return new AppError(404, "POST_NOT_FOUND", "Post not found.");
}

function encodeFeedCursor(post: FeedPostRecord): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: post.createdAt.toISOString(),
      id: post.id
    }),
    "utf8"
  ).toString("base64url");
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

export async function getOwnVisiblePosts(userId: string): Promise<PostDto[]> {
  const posts = await findVisiblePostsByAuthorId(userId);

  return posts.map(toPostDto);
}

export async function getFeed(input: GetFeedInput): Promise<FeedPostsDto> {
  const feedPosts = await findFeedPostsForViewer(input);
  const hasNextPage = feedPosts.length > input.limit;
  const visiblePosts = hasNextPage ? feedPosts.slice(0, input.limit) : feedPosts;
  const lastVisiblePost = visiblePosts.at(-1) ?? null;

  return {
    pageInfo: {
      hasNextPage,
      limit: input.limit,
      nextCursor:
        hasNextPage && lastVisiblePost ? encodeFeedCursor(lastVisiblePost) : null
    },
    posts: visiblePosts.map(toFeedPostDto)
  };
}

export async function deletePost(input: DeletePostInput): Promise<string> {
  const existingPost = await findActivePostById(input.postId);

  if (!existingPost) {
    throw createPostNotFoundError();
  }

  if (
    existingPost.authorId !== input.actor.id &&
    input.actor.role !== "ADMIN"
  ) {
    throw createForbiddenError();
  }

  const deletedPost = await softDeletePostById(input.postId, new Date());

  if (!deletedPost) {
    throw createPostNotFoundError();
  }

  return deletedPost.id;
}

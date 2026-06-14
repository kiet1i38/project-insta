import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";
import type { FeedCursor } from "./posts.schema.js";

const feedPostSelect = {
  author: {
    select: {
      avatarUrl: true,
      displayName: true,
      id: true,
      username: true
    }
  },
  caption: true,
  createdAt: true,
  id: true,
  imageUrl: true,
  updatedAt: true
} satisfies Prisma.PostSelect;

export type FeedPostRecord = Prisma.PostGetPayload<{
  select: typeof feedPostSelect;
}>;

export async function createPostRecord(input: {
  authorId: string;
  caption: string | null | undefined;
  imageUrl: string;
}) {
  return prisma.post.create({
    data: {
      authorId: input.authorId,
      caption: input.caption ?? null,
      imageUrl: input.imageUrl
    }
  });
}

export async function findVisiblePostsByAuthorId(authorId: string) {
  return prisma.post.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    where: {
      authorId,
      deletedAt: null,
      isHidden: false
    }
  });
}

export async function findFeedPostsForViewer(input: {
  cursor?: FeedCursor;
  limit: number;
  viewerId: string;
}): Promise<FeedPostRecord[]> {
  const paginationFilter = input.cursor
    ? {
        OR: [
          {
            createdAt: {
              lt: input.cursor.createdAt
            }
          },
          {
            AND: [
              {
                createdAt: input.cursor.createdAt
              },
              {
                id: {
                  lt: input.cursor.id
                }
              }
            ]
          }
        ]
      }
    : undefined;

  return prisma.post.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: feedPostSelect,
    take: input.limit + 1,
    where: {
      deletedAt: null,
      isHidden: false,
      AND: [
        {
          OR: [
            {
              authorId: input.viewerId
            },
            {
              author: {
                followers: {
                  some: {
                    followerId: input.viewerId
                  }
                }
              }
            }
          ]
        },
        ...(paginationFilter ? [paginationFilter] : [])
      ]
    }
  });
}

export async function findActivePostById(postId: string) {
  return prisma.post.findFirst({
    select: {
      authorId: true,
      id: true
    },
    where: {
      deletedAt: null,
      id: postId,
      isHidden: false
    }
  });
}

export async function createPostLike(input: { postId: string; userId: string }) {
  await prisma.like.createMany({
    data: [input],
    skipDuplicates: true
  });
}

export async function deletePostLike(input: { postId: string; userId: string }) {
  await prisma.like.deleteMany({
    where: {
      postId: input.postId,
      userId: input.userId
    }
  });
}

export async function softDeletePostById(postId: string, deletedAt: Date) {
  return prisma.$transaction(async (tx) => {
    const updateResult = await tx.post.updateMany({
      data: {
        deletedAt
      },
      where: {
        deletedAt: null,
        id: postId,
        isHidden: false
      }
    });

    if (updateResult.count !== 1) {
      return null;
    }

    return tx.post.findUnique({
      select: {
        id: true
      },
      where: { id: postId }
    });
  });
}

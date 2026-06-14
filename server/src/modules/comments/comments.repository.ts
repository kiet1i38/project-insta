import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/prisma.js";

const activeCommentDeleteSelect = {
  authorId: true,
  id: true,
  post: {
    select: {
      authorId: true
    }
  }
} satisfies Prisma.CommentSelect;

export type ActiveCommentDeleteRecord = Prisma.CommentGetPayload<{
  select: typeof activeCommentDeleteSelect;
}>;

export async function createCommentRecord(input: {
  authorId: string;
  content: string;
  postId: string;
}) {
  return prisma.comment.create({
    data: {
      authorId: input.authorId,
      content: input.content,
      postId: input.postId
    }
  });
}

export async function findActiveCommentById(
  commentId: string
): Promise<ActiveCommentDeleteRecord | null> {
  return prisma.comment.findFirst({
    select: activeCommentDeleteSelect,
    where: {
      deletedAt: null,
      id: commentId,
      isHidden: false,
      post: {
        deletedAt: null,
        isHidden: false
      }
    }
  });
}

export async function softDeleteCommentById(commentId: string, deletedAt: Date) {
  return prisma.$transaction(async (tx) => {
    const updateResult = await tx.comment.updateMany({
      data: {
        deletedAt
      },
      where: {
        deletedAt: null,
        id: commentId,
        isHidden: false,
        post: {
          deletedAt: null,
          isHidden: false
        }
      }
    });

    if (updateResult.count !== 1) {
      return null;
    }

    return tx.comment.findUnique({
      select: {
        id: true
      },
      where: { id: commentId }
    });
  });
}

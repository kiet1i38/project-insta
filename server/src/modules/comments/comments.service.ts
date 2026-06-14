import { AppError } from "../../lib/appError.js";
import { createForbiddenError } from "../auth/auth.errors.js";
import { findActivePostById } from "../posts/posts.repository.js";
import {
  createCommentRecord,
  findActiveCommentById,
  type ActiveCommentDeleteRecord,
  softDeleteCommentById
} from "./comments.repository.js";

type CommentDto = {
  authorId: string;
  content: string;
  createdAt: Date;
  id: string;
  postId: string;
  updatedAt: Date;
};

function toCommentDto(comment: {
  authorId: string;
  content: string;
  createdAt: Date;
  id: string;
  postId: string;
  updatedAt: Date;
}): CommentDto {
  return {
    authorId: comment.authorId,
    content: comment.content,
    createdAt: comment.createdAt,
    id: comment.id,
    postId: comment.postId,
    updatedAt: comment.updatedAt
  };
}

function createCommentNotFoundError(): AppError {
  return new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
}

function createPostNotFoundError(): AppError {
  return new AppError(404, "POST_NOT_FOUND", "Post not found.");
}

function canDeleteComment(input: {
  actor: {
    id: string;
    role: "USER" | "ADMIN";
  };
  comment: ActiveCommentDeleteRecord;
}) {
  return (
    input.actor.role === "ADMIN" ||
    input.actor.id === input.comment.authorId ||
    input.actor.id === input.comment.post.authorId
  );
}

export async function createComment(input: {
  actorId: string;
  content: string;
  postId: string;
}): Promise<CommentDto> {
  const existingPost = await findActivePostById(input.postId);

  if (!existingPost) {
    throw createPostNotFoundError();
  }

  const comment = await createCommentRecord({
    authorId: input.actorId,
    content: input.content,
    postId: input.postId
  });

  return toCommentDto(comment);
}

export async function deleteComment(input: {
  actor: {
    id: string;
    role: "USER" | "ADMIN";
  };
  commentId: string;
}): Promise<string> {
  const existingComment = await findActiveCommentById(input.commentId);

  if (!existingComment) {
    throw createCommentNotFoundError();
  }

  if (!canDeleteComment({ actor: input.actor, comment: existingComment })) {
    throw createForbiddenError();
  }

  const deletedComment = await softDeleteCommentById(
    input.commentId,
    new Date()
  );

  if (!deletedComment) {
    throw createCommentNotFoundError();
  }

  return deletedComment.id;
}

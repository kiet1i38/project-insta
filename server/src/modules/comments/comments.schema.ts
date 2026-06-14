import { z } from "zod";

export const createCommentBodySchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "Comment content is required.")
      .max(1000, "Comment content must be 1000 characters or fewer.")
  })
  .strict();

export const postCommentRouteParamsSchema = z
  .object({
    postId: z.string().uuid("Post id must be a valid UUID.")
  })
  .strict();

export const commentRouteParamsSchema = z
  .object({
    commentId: z.string().uuid("Comment id must be a valid UUID.")
  })
  .strict();

export type CommentRouteParamsInput = z.infer<typeof commentRouteParamsSchema>;
export type CreateCommentBodyInput = z.infer<typeof createCommentBodySchema>;
export type PostCommentRouteParamsInput = z.infer<
  typeof postCommentRouteParamsSchema
>;

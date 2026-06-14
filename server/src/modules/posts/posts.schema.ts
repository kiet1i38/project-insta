import { z } from "zod";

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? null : trimmedValue;
}

export const createPostBodySchema = z
  .object({
    caption: z.preprocess(
      normalizeNullableText,
      z
        .union([z.string().max(2200, "Caption must be 2200 characters or fewer."), z.null()])
        .optional()
    )
  })
  .strict();

export const postRouteParamsSchema = z
  .object({
    postId: z.string().uuid("Post id must be a valid UUID.")
  })
  .strict();

const feedCursorSchema = z.object({
  createdAt: z
    .string()
    .datetime("Cursor createdAt must be a valid ISO datetime.")
    .transform((value) => new Date(value)),
  id: z.string().uuid("Cursor id must be a valid UUID.")
});

function decodeFeedCursor(value: string) {
  const decodedValue = Buffer.from(value, "base64url").toString("utf8");
  const parsedValue = JSON.parse(decodedValue) as unknown;

  return feedCursorSchema.parse(parsedValue);
}

export const getFeedQuerySchema = z
  .object({
    cursor: z
      .string()
      .trim()
      .min(1, "Cursor is required when provided.")
      .transform((value, context) => {
        try {
          return decodeFeedCursor(value);
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cursor must be a valid feed cursor."
          });

          return z.NEVER;
        }
      })
      .optional(),
    limit: z.coerce
      .number()
      .int("Limit must be an integer.")
      .min(1, "Limit must be at least 1.")
      .max(20, "Limit must be 20 or fewer.")
      .default(10)
  })
  .strict();

export type CreatePostBodyInput = z.infer<typeof createPostBodySchema>;
export type FeedCursor = z.infer<typeof feedCursorSchema>;
export type GetFeedQueryInput = z.infer<typeof getFeedQuerySchema>;
export type PostRouteParamsInput = z.infer<typeof postRouteParamsSchema>;

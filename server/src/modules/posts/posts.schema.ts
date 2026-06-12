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

export type CreatePostBodyInput = z.infer<typeof createPostBodySchema>;

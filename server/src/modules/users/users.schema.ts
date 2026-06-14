import { z } from "zod";

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? null : trimmedValue;
}

const searchUsersCursorSchema = z.object({
  id: z.string().uuid("Cursor id must be a valid UUID."),
  username: z
    .string()
    .trim()
    .min(1, "Cursor username is required.")
    .max(30, "Cursor username must be 30 characters or fewer.")
});

function decodeSearchCursor(value: string) {
  const decodedValue = Buffer.from(value, "base64url").toString("utf8");
  const parsedValue = JSON.parse(decodedValue) as unknown;

  return searchUsersCursorSchema.parse(parsedValue);
}

const nullableBioSchema = z.preprocess(
  normalizeNullableText,
  z.union([z.string().max(160, "Bio must be 160 characters or fewer."), z.null()])
);

const nullableAvatarUrlSchema = z.preprocess(
  normalizeNullableText,
  z.union([
    z.string().url("Avatar URL must be a valid URL."),
    z.null()
  ])
);

export const userRouteParamsSchema = z
  .object({
    userId: z.string().uuid("User id must be a valid UUID.")
  })
  .strict();

export const updateOwnProfileSchema = z
  .object({
    avatarUrl: nullableAvatarUrlSchema.optional(),
    bio: nullableBioSchema.optional(),
    displayName: z
      .string()
      .trim()
      .min(1, "Display name is required.")
      .max(50, "Display name must be 50 characters or fewer.")
      .optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one profile field must be provided."
  });

export const searchUsersQuerySchema = z
  .object({
    cursor: z
      .string()
      .trim()
      .min(1, "Cursor is required when provided.")
      .transform((value, context) => {
        try {
          return decodeSearchCursor(value);
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cursor must be a valid search cursor."
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
      .default(10),
    q: z
      .string()
      .trim()
      .min(1, "Search query is required.")
      .max(50, "Search query must be 50 characters or fewer.")
  })
  .strict();

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
export type SearchUsersCursor = z.infer<typeof searchUsersCursorSchema>;
export type SearchUsersQueryInput = z.infer<typeof searchUsersQuerySchema>;
export type UserRouteParamsInput = z.infer<typeof userRouteParamsSchema>;

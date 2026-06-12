import { z } from "zod";

function normalizeNullableText(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? null : trimmedValue;
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

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

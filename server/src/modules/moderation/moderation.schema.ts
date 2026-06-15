import { z } from "zod";

function decodeModerationCursor(value: string) {
  const decodedValue = Buffer.from(value, "base64url").toString("utf8");
  const parsedValue = JSON.parse(decodedValue) as unknown;

  return moderationReportsCursorSchema.parse(parsedValue);
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

const auditNoteSchema = z
  .string({
    invalid_type_error: "Audit note is required.",
    required_error: "Audit note is required."
  })
  .trim()
  .min(1, "Audit note is required.")
  .max(500, "Audit note must be 500 characters or fewer.");

const optionalAuditNoteSchema = z.preprocess(
  normalizeOptionalText,
  z
    .string()
    .trim()
    .min(1, "Audit note must be 1 character or longer when provided.")
    .max(500, "Audit note must be 500 characters or fewer.")
    .optional()
);

export const moderationReportsCursorSchema = z.object({
  createdAt: z
    .string()
    .datetime("Cursor createdAt must be a valid ISO datetime.")
    .transform((value) => new Date(value)),
  id: z.string().uuid("Cursor id must be a valid UUID.")
});

export const moderationReportRouteParamsSchema = z
  .object({
    reportId: z.string().uuid("Report id must be a valid UUID.")
  })
  .strict();

export const listModerationReportsQuerySchema = z
  .object({
    cursor: z
      .string()
      .trim()
      .min(1, "Cursor is required when provided.")
      .transform((value, context) => {
        try {
          return decodeModerationCursor(value);
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cursor must be a valid moderation cursor."
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
    sort: z.enum(["newest", "oldest"]).default("newest"),
    status: z.enum(["PENDING", "RESOLVED", "DISMISSED"]).default("PENDING")
  })
  .strict();

export const dismissModerationReportBodySchema = z
  .object({
    note: optionalAuditNoteSchema
  })
  .strict();

export const destructiveModerationActionBodySchema = z
  .object({
    note: auditNoteSchema
  })
  .strict();

export type DismissModerationReportBodyInput = z.infer<
  typeof dismissModerationReportBodySchema
>;
export type DestructiveModerationActionBodyInput = z.infer<
  typeof destructiveModerationActionBodySchema
>;
export type ListModerationReportsCursorInput = z.infer<
  typeof moderationReportsCursorSchema
>;
export type ListModerationReportsQueryInput = z.infer<
  typeof listModerationReportsQuerySchema
>;
export type ModerationReportRouteParamsInput = z.infer<
  typeof moderationReportRouteParamsSchema
>;

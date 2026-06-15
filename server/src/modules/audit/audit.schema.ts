import { z } from "zod";

function decodeAuditCursor(value: string) {
  const decodedValue = Buffer.from(value, "base64url").toString("utf8");
  const parsedValue = JSON.parse(decodedValue) as unknown;

  return auditLogsCursorSchema.parse(parsedValue);
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

const isoDatetimeSchema = z
  .string()
  .datetime("Value must be a valid ISO datetime.")
  .transform((value) => new Date(value));

export const auditLogsCursorSchema = z.object({
  createdAt: z
    .string()
    .datetime("Cursor createdAt must be a valid ISO datetime.")
    .transform((value) => new Date(value)),
  id: z.string().uuid("Cursor id must be a valid UUID.")
});

export const listAuditLogsQuerySchema = z
  .object({
    action: z.preprocess(
      normalizeOptionalText,
      z
        .string()
        .trim()
        .min(1, "Action must be 1 character or longer when provided.")
        .max(100, "Action must be 100 characters or fewer.")
        .optional()
    ),
    actorId: z
      .preprocess(
        normalizeOptionalText,
        z.string().uuid("actorId must be a valid UUID.").optional()
      ),
    cursor: z
      .string()
      .trim()
      .min(1, "Cursor is required when provided.")
      .transform((value, context) => {
        try {
          return decodeAuditCursor(value);
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cursor must be a valid audit cursor."
          });

          return z.NEVER;
        }
      })
      .optional(),
    entityId: z.preprocess(
      normalizeOptionalText,
      z
        .string()
        .trim()
        .min(1, "entityId must be 1 character or longer when provided.")
        .max(50, "entityId must be 50 characters or fewer.")
        .optional()
    ),
    entityType: z.preprocess(
      normalizeOptionalText,
      z
        .string()
        .trim()
        .min(1, "entityType must be 1 character or longer when provided.")
        .max(50, "entityType must be 50 characters or fewer.")
        .optional()
    ),
    from: isoDatetimeSchema.optional(),
    limit: z.coerce
      .number()
      .int("Limit must be an integer.")
      .min(1, "Limit must be at least 1.")
      .max(50, "Limit must be 50 or fewer.")
      .default(20),
    sort: z.enum(["newest", "oldest"]).default("newest"),
    to: isoDatetimeSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from must be earlier than or equal to to.",
        path: ["from"]
      });
    }
  });

export type AuditLogsCursorInput = z.infer<typeof auditLogsCursorSchema>;
export type ListAuditLogsQueryInput = z.infer<typeof listAuditLogsQuerySchema>;

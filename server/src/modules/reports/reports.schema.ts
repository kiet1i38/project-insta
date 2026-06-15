import { z } from "zod";

export const reportReasonValues = [
  "SPAM",
  "HARASSMENT",
  "HATE_SPEECH",
  "VIOLENCE",
  "NUDITY",
  "SELF_HARM",
  "IMPERSONATION",
  "MISINFORMATION",
  "OTHER"
] as const;

export type ReportReason = (typeof reportReasonValues)[number];

const reportReasonSet = new Set<string>(reportReasonValues);

const reportReasonSchema = z
  .string()
  .trim()
  .min(1, "Report reason is required.")
  .refine((value): value is ReportReason => reportReasonSet.has(value), {
    message: "Reason must be a supported report reason."
  });

export const createReportBodySchema = z
  .object({
    reason: reportReasonSchema,
    reportedCommentId: z
      .string()
      .uuid("Reported comment id must be a valid UUID.")
      .nullable()
      .optional(),
    reportedPostId: z
      .string()
      .uuid("Reported post id must be a valid UUID.")
      .nullable()
      .optional(),
    reportedUserId: z
      .string()
      .uuid("Reported user id must be a valid UUID.")
      .nullable()
      .optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const targetCount = [
      value.reportedPostId,
      value.reportedCommentId,
      value.reportedUserId
    ].filter((target): target is string => typeof target === "string").length;

    if (targetCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one report target is required.",
        path: ["reportedTarget"]
      });
    }
  });

export type CreateReportBodyInput = z.infer<typeof createReportBodySchema>;

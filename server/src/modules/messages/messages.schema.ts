import { Buffer } from "node:buffer";
import { z } from "zod";

const paginationLimitSchema = z.coerce
  .number()
  .int()
  .min(1, "Limit must be at least 1.")
  .max(20, "Limit must be 20 or fewer.")
  .default(20);

const conversationFolderSchema = z
  .enum(["inbox", "requests"])
  .default("inbox");

const inboxCursorPayloadSchema = z
  .object({
    id: z.string().uuid(),
    updatedAt: z.string().datetime()
  })
  .transform((value) => ({
    id: value.id,
    updatedAt: new Date(value.updatedAt)
  }));

const messageCursorPayloadSchema = z
  .object({
    createdAt: z.string().datetime(),
    id: z.string().uuid()
  })
  .transform((value) => ({
    createdAt: new Date(value.createdAt),
    id: value.id
  }));

function decodeCursor<T>(
  rawCursor: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  message: string,
  ctx: z.RefinementCtx
) {
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    return schema.parse(parsed);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message
    });
    return z.NEVER;
  }
}

export const createDirectConversationSchema = z.object({
  participantUserId: z.string().uuid("participantUserId must be a valid UUID.")
});

export const listConversationsQuerySchema = z.object({
  cursor: z.string().optional().transform((rawCursor, ctx) => {
    if (!rawCursor) {
      return undefined;
    }

    return decodeCursor(
      rawCursor,
      inboxCursorPayloadSchema,
      "Cursor must be a valid conversation cursor.",
      ctx
    );
  }),
  folder: conversationFolderSchema,
  limit: paginationLimitSchema
});

export const conversationRouteParamsSchema = z.object({
  conversationId: z.string().uuid("conversationId must be a valid UUID.")
});

export const listConversationMessagesQuerySchema = z.object({
  cursor: z.string().optional().transform((rawCursor, ctx) => {
    if (!rawCursor) {
      return undefined;
    }

    return decodeCursor(
      rawCursor,
      messageCursorPayloadSchema,
      "Cursor must be a valid message cursor.",
      ctx
    );
  }),
  limit: paginationLimitSchema
});

export const createConversationMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message content is required.")
    .max(2000, "Message content must be 2000 characters or fewer.")
});

export const markConversationReadSchema = z.object({
  messageId: z.string().uuid("messageId must be a valid UUID.")
});

export const realtimeListConversationsSchema = listConversationsQuerySchema;

export const realtimeListConversationMessagesSchema =
  listConversationMessagesQuerySchema.extend({
    conversationId: z.string().uuid("conversationId must be a valid UUID.")
  });

export const realtimeCreateConversationMessageSchema =
  createConversationMessageSchema.extend({
    clientMessageId: z.string().uuid("clientMessageId must be a valid UUID."),
    conversationId: z.string().uuid("conversationId must be a valid UUID.")
  });

export const realtimeMarkConversationReadSchema = markConversationReadSchema.extend({
  conversationId: z.string().uuid("conversationId must be a valid UUID.")
});

export type CreateDirectConversationInput = z.infer<
  typeof createDirectConversationSchema
>;
export type ConversationRouteParamsInput = z.infer<
  typeof conversationRouteParamsSchema
>;
export type CreateConversationMessageInput = z.infer<
  typeof createConversationMessageSchema
>;
export type ConversationCursor = z.infer<typeof inboxCursorPayloadSchema>;
export type ListConversationsQueryInput = z.infer<
  typeof listConversationsQuerySchema
>;
export type ConversationFolderInput = z.infer<typeof conversationFolderSchema>;
export type MessageCursor = z.infer<typeof messageCursorPayloadSchema>;
export type ListConversationMessagesQueryInput = z.infer<
  typeof listConversationMessagesQuerySchema
>;
export type MarkConversationReadInput = z.infer<
  typeof markConversationReadSchema
>;
export type RealtimeListConversationsInput = z.infer<
  typeof realtimeListConversationsSchema
>;
export type RealtimeListConversationMessagesInput = z.infer<
  typeof realtimeListConversationMessagesSchema
>;
export type RealtimeCreateConversationMessageInput = z.infer<
  typeof realtimeCreateConversationMessageSchema
>;
export type RealtimeMarkConversationReadInput = z.infer<
  typeof realtimeMarkConversationReadSchema
>;

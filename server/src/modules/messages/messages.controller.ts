import type { RequestHandler } from "express";
import { createUnauthorizedError } from "../auth/auth.errors.js";
import {
  conversationRouteParamsSchema,
  createConversationMessageSchema,
  createDirectConversationSchema,
  listConversationMessagesQuerySchema,
  listConversationsQuerySchema,
  markConversationReadSchema
} from "./messages.schema.js";
import {
  createConversationMessage,
  createDirectConversation,
  getConversationMessages,
  listConversations,
  markConversationRead
} from "./messages.service.js";

function toValidationDetails(issues: Array<{ message: string; path: PropertyKey[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

function parseConversationRouteParams(rawConversationId: string | string[] | undefined) {
  const conversationId = Array.isArray(rawConversationId)
    ? rawConversationId[0]
    : rawConversationId;

  return conversationRouteParamsSchema.safeParse({ conversationId });
}

export const createDirectConversationController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedBody = createDirectConversationSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const result = await createDirectConversation({
      participantUserId: parsedBody.data.participantUserId,
      viewerId: req.authUser.id
    });

    res.status(result.created ? 201 : 200).json({
      conversation: result.conversation,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const listConversationsController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedQuery = listConversationsQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedQuery.error.issues),
        message: "Invalid query string."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const result = await listConversations({
      query: parsedQuery.data,
      viewerId: req.authUser.id
    });

    res.status(200).json({
      conversations: result.conversations,
      pageInfo: result.pageInfo,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const getConversationMessagesController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedParams = parseConversationRouteParams(req.params.conversationId);

  if (!parsedParams.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedParams.error.issues),
        message: "Invalid route parameters."
      },
      requestId: req.requestId
    });
    return;
  }

  const parsedQuery = listConversationMessagesQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedQuery.error.issues),
        message: "Invalid query string."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const result = await getConversationMessages({
      conversationId: parsedParams.data.conversationId,
      query: parsedQuery.data,
      viewerId: req.authUser.id
    });

    res.status(200).json({
      conversation: result.conversation,
      messages: result.messages,
      pageInfo: result.pageInfo,
      readState: result.readState,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const createConversationMessageController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedParams = parseConversationRouteParams(req.params.conversationId);

  if (!parsedParams.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedParams.error.issues),
        message: "Invalid route parameters."
      },
      requestId: req.requestId
    });
    return;
  }

  const parsedBody = createConversationMessageSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const message = await createConversationMessage({
      body: parsedBody.data,
      conversationId: parsedParams.data.conversationId,
      viewerId: req.authUser.id
    });

    res.status(201).json({
      message,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

export const markConversationReadController: RequestHandler = async (
  req,
  res,
  next
) => {
  const parsedParams = parseConversationRouteParams(req.params.conversationId);

  if (!parsedParams.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedParams.error.issues),
        message: "Invalid route parameters."
      },
      requestId: req.requestId
    });
    return;
  }

  const parsedBody = markConversationReadSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    if (!req.authUser) {
      throw createUnauthorizedError();
    }

    const readState = await markConversationRead({
      body: parsedBody.data,
      conversationId: parsedParams.data.conversationId,
      viewerId: req.authUser.id
    });

    res.status(200).json({
      readState,
      requestId: req.requestId
    });
  } catch (error) {
    next(error);
  }
};

import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  acceptConversationRequestController,
  createConversationMessageController,
  createDirectConversationController,
  declineConversationRequestController,
  getConversationMessagesController,
  listConversationsController,
  markConversationReadController
} from "./messages.controller.js";

const messagesRouter = Router();

messagesRouter.use(applyAuthCors);
messagesRouter.options("/", handleAuthCorsPreflight);
messagesRouter.options("/:conversationId/messages", handleAuthCorsPreflight);
messagesRouter.options("/:conversationId/read", handleAuthCorsPreflight);
messagesRouter.options(
  "/:conversationId/request/accept",
  handleAuthCorsPreflight
);
messagesRouter.options(
  "/:conversationId/request/decline",
  handleAuthCorsPreflight
);
messagesRouter.get("/", requireAuth, listConversationsController);
messagesRouter.post("/", requireAuth, createDirectConversationController);
messagesRouter.get(
  "/:conversationId/messages",
  requireAuth,
  getConversationMessagesController
);
messagesRouter.post(
  "/:conversationId/messages",
  requireAuth,
  createConversationMessageController
);
messagesRouter.post(
  "/:conversationId/read",
  requireAuth,
  markConversationReadController
);
messagesRouter.post(
  "/:conversationId/request/accept",
  requireAuth,
  acceptConversationRequestController
);
messagesRouter.post(
  "/:conversationId/request/decline",
  requireAuth,
  declineConversationRequestController
);

export { messagesRouter };

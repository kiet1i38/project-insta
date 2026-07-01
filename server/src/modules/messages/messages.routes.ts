import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createConversationMessageController,
  createDirectConversationController,
  getConversationMessagesController,
  listConversationsController,
  markConversationReadController
} from "./messages.controller.js";

const messagesRouter = Router();

messagesRouter.use(applyAuthCors);
messagesRouter.options("/", handleAuthCorsPreflight);
messagesRouter.options("/:conversationId/messages", handleAuthCorsPreflight);
messagesRouter.options("/:conversationId/read", handleAuthCorsPreflight);
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

export { messagesRouter };

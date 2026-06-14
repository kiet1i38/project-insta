import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createCommentController,
  deleteCommentController
} from "./comments.controller.js";

const commentsRouter = Router();

commentsRouter.use(applyAuthCors);
commentsRouter.options("/posts/:postId/comments", handleAuthCorsPreflight);
commentsRouter.options("/comments/:commentId", handleAuthCorsPreflight);
commentsRouter.post("/posts/:postId/comments", requireAuth, createCommentController);
commentsRouter.delete("/comments/:commentId", requireAuth, deleteCommentController);

export { commentsRouter };

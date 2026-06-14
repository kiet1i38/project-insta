import multer from "multer";
import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  createPostController,
  deletePostController,
  getFeedController,
  getOwnPostsController
} from "./posts.controller.js";

const postsRouter = Router();
const uploadPostImage = multer({
  storage: multer.memoryStorage()
});

postsRouter.use(applyAuthCors);
postsRouter.options("/feed", handleAuthCorsPreflight);
postsRouter.options("/me", handleAuthCorsPreflight);
postsRouter.options("/", handleAuthCorsPreflight);
postsRouter.options("/:postId", handleAuthCorsPreflight);
postsRouter.get("/feed", requireAuth, getFeedController);
postsRouter.get("/me", requireAuth, getOwnPostsController);
postsRouter.delete("/:postId", requireAuth, deletePostController);
postsRouter.post(
  "/",
  requireAuth,
  uploadPostImage.single("image"),
  createPostController
);

export { postsRouter };

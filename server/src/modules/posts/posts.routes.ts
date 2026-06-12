import multer from "multer";
import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { createPostController } from "./posts.controller.js";

const postsRouter = Router();
const uploadPostImage = multer({
  storage: multer.memoryStorage()
});

postsRouter.use(applyAuthCors);
postsRouter.options("/", handleAuthCorsPreflight);
postsRouter.post(
  "/",
  requireAuth,
  uploadPostImage.single("image"),
  createPostController
);

export { postsRouter };

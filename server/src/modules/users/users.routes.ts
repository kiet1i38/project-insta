import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  followUserController,
  getOwnProfileController,
  searchUsersController,
  unfollowUserController,
  updateOwnProfileController
} from "./users.controller.js";

const usersRouter = Router();

usersRouter.use(applyAuthCors);
usersRouter.options("/me", handleAuthCorsPreflight);
usersRouter.options("/search", handleAuthCorsPreflight);
usersRouter.options("/:userId/follow", handleAuthCorsPreflight);
usersRouter.get("/me", requireAuth, getOwnProfileController);
usersRouter.get("/search", requireAuth, searchUsersController);
usersRouter.patch("/me", requireAuth, updateOwnProfileController);
usersRouter.post("/:userId/follow", requireAuth, followUserController);
usersRouter.delete("/:userId/follow", requireAuth, unfollowUserController);

export { usersRouter };

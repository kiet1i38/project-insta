import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  getOwnProfileController,
  searchUsersController,
  updateOwnProfileController
} from "./users.controller.js";

const usersRouter = Router();

usersRouter.use(applyAuthCors);
usersRouter.options("/me", handleAuthCorsPreflight);
usersRouter.options("/search", handleAuthCorsPreflight);
usersRouter.get("/me", requireAuth, getOwnProfileController);
usersRouter.get("/search", requireAuth, searchUsersController);
usersRouter.patch("/me", requireAuth, updateOwnProfileController);

export { usersRouter };

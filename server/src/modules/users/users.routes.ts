import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  getOwnProfileController,
  updateOwnProfileController
} from "./users.controller.js";

const usersRouter = Router();

usersRouter.use(applyAuthCors);
usersRouter.options("/me", handleAuthCorsPreflight);
usersRouter.get("/me", requireAuth, getOwnProfileController);
usersRouter.patch("/me", requireAuth, updateOwnProfileController);

export { usersRouter };

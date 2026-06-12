import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  getOwnProfileController,
  updateOwnProfileController
} from "./users.controller.js";

const usersRouter = Router();

usersRouter.get("/me", requireAuth, getOwnProfileController);
usersRouter.patch("/me", requireAuth, updateOwnProfileController);

export { usersRouter };

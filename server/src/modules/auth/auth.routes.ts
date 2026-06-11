import { Router } from "express";
import {
  loginController,
  refreshController,
  registerController
} from "./auth.controller.js";

const authRouter = Router();

authRouter.post("/register", registerController);
authRouter.post("/login", loginController);
authRouter.post("/refresh", refreshController);

export { authRouter };

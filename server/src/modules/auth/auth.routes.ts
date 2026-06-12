import { Router } from "express";
import {
  loginController,
  logoutController,
  refreshController,
  registerController
} from "./auth.controller.js";
import {
  applyAuthCors,
  applyAuthSecurityHeaders,
  handleAuthCorsPreflight,
  requireCsrfProtection
} from "./auth.web.middleware.js";

const authRouter = Router();

authRouter.use(applyAuthSecurityHeaders);
authRouter.use(applyAuthCors);

authRouter.options("/login", handleAuthCorsPreflight);
authRouter.options("/refresh", handleAuthCorsPreflight);
authRouter.options("/logout", handleAuthCorsPreflight);

authRouter.post("/register", registerController);
authRouter.post("/login", loginController);
authRouter.post("/refresh", requireCsrfProtection, refreshController);
authRouter.post("/logout", requireCsrfProtection, logoutController);

export { authRouter };

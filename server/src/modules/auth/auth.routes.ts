import { Router } from "express";
import {
  confirmEmailVerificationController,
  confirmPasswordResetController,
  loginController,
  logoutController,
  requestEmailVerificationController,
  requestPasswordResetController,
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
authRouter.options("/email-verification/request", handleAuthCorsPreflight);
authRouter.options("/email-verification/confirm", handleAuthCorsPreflight);
authRouter.options("/password-reset/request", handleAuthCorsPreflight);
authRouter.options("/password-reset/confirm", handleAuthCorsPreflight);

authRouter.post("/register", registerController);
authRouter.post(
  "/email-verification/request",
  requestEmailVerificationController
);
authRouter.post(
  "/email-verification/confirm",
  confirmEmailVerificationController
);
authRouter.post("/password-reset/request", requestPasswordResetController);
authRouter.post("/password-reset/confirm", confirmPasswordResetController);
authRouter.post("/login", loginController);
authRouter.post("/refresh", requireCsrfProtection, refreshController);
authRouter.post("/logout", requireCsrfProtection, logoutController);

export { authRouter };

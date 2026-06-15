import { Router } from "express";
import {
  requireAdminRole,
  requireAuth
} from "../auth/auth.middleware.js";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import {
  banModerationReportTargetUserController,
  dismissModerationReportController,
  getModerationReportsController,
  hideModerationReportTargetController
} from "./moderation.controller.js";

const moderationRouter = Router();

moderationRouter.use(applyAuthCors);
moderationRouter.options("/admin/reports", handleAuthCorsPreflight);
moderationRouter.options(
  "/admin/reports/:reportId/dismiss",
  handleAuthCorsPreflight
);
moderationRouter.options(
  "/admin/reports/:reportId/hide-content",
  handleAuthCorsPreflight
);
moderationRouter.options(
  "/admin/reports/:reportId/ban-user",
  handleAuthCorsPreflight
);
moderationRouter.get(
  "/admin/reports",
  requireAuth,
  requireAdminRole,
  getModerationReportsController
);
moderationRouter.post(
  "/admin/reports/:reportId/dismiss",
  requireAuth,
  requireAdminRole,
  dismissModerationReportController
);
moderationRouter.post(
  "/admin/reports/:reportId/hide-content",
  requireAuth,
  requireAdminRole,
  hideModerationReportTargetController
);
moderationRouter.post(
  "/admin/reports/:reportId/ban-user",
  requireAuth,
  requireAdminRole,
  banModerationReportTargetUserController
);

export { moderationRouter };

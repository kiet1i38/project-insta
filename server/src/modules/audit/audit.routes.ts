import { Router } from "express";
import {
  requireAdminRole,
  requireAuth
} from "../auth/auth.middleware.js";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { getAuditLogsController } from "./audit.controller.js";

const auditRouter = Router();

auditRouter.use(applyAuthCors);
auditRouter.options("/admin/audit-logs", handleAuthCorsPreflight);
auditRouter.get(
  "/admin/audit-logs",
  requireAuth,
  requireAdminRole,
  getAuditLogsController
);

export { auditRouter };

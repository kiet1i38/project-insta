import { Router } from "express";
import {
  applyAuthCors,
  handleAuthCorsPreflight
} from "../auth/auth.web.middleware.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { createReportController } from "./reports.controller.js";

const reportsRouter = Router();

reportsRouter.use(applyAuthCors);
reportsRouter.options("/reports", handleAuthCorsPreflight);
reportsRouter.post("/reports", requireAuth, createReportController);

export { reportsRouter };

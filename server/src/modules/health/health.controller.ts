import type { RequestHandler } from "express";
import { env } from "../../config/env.js";
import { getHealthSnapshot } from "./health.service.js";

export const getHealth: RequestHandler = async (req, res) => {
  const health = await getHealthSnapshot();

  res.status(health.httpStatus).json({
    status: health.status,
    database: health.database,
    service: "cloneinsta-server",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
};

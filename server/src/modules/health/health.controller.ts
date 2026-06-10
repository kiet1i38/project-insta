import type { RequestHandler } from "express";
import { env } from "../../config/env.js";

export const getHealth: RequestHandler = (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "cloneinsta-server",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
};

import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incomingRequestId = req.get("x-request-id")?.trim();

  req.requestId =
    incomingRequestId && incomingRequestId.length > 0
      ? incomingRequestId
      : `req_${randomUUID()}`;

  res.setHeader("x-request-id", req.requestId);
  next();
};

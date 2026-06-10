import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../lib/appError.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} was not found.`
    },
    requestId: req.requestId
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON."
      },
      requestId: req.requestId
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      },
      requestId: req.requestId
    });
    return;
  }

  console.error(`[${req.requestId}]`, error);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong."
    },
    requestId: req.requestId
  });
};

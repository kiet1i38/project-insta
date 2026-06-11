import type { RequestHandler } from "express";
import { loginSchema, registerSchema } from "./auth.schema.js";
import { loginUser, registerUser } from "./auth.service.js";

function toValidationDetails(issues: Array<{ message: string; path: PropertyKey[] }>) {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join(".")
  }));
}

export const registerController: RequestHandler = async (req, res, next) => {
  const parsedBody = registerSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    const user = await registerUser(parsedBody.data);

    res.status(201).json({
      requestId: req.requestId,
      user
    });
  } catch (error) {
    next(error);
  }
};

export const loginController: RequestHandler = async (req, res, next) => {
  const parsedBody = loginSchema.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        details: toValidationDetails(parsedBody.error.issues),
        message: "Invalid request body."
      },
      requestId: req.requestId
    });
    return;
  }

  try {
    const result = await loginUser(parsedBody.data);

    res.status(200).json({
      accessToken: result.accessToken,
      requestId: req.requestId,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
};

import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { postsRouter } from "./modules/posts/posts.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

const app = express();

app.disable("x-powered-by");
app.use(requestIdMiddleware);
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.status(200).json({
    message: "CloneInsta API skeleton is running.",
    requestId: req.requestId
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/health", healthRouter);
app.use("/api/v1/posts", postsRouter);
app.use("/api/v1/users", usersRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };

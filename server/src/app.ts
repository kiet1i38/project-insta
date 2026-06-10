import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { healthRouter } from "./modules/health/health.routes.js";

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

app.use("/api/v1/health", healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };

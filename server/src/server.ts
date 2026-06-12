import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureLocalUploadDirectory } from "./modules/posts/upload.service.js";

async function startServer() {
  await ensureLocalUploadDirectory();

  app.listen(env.PORT, () => {
    console.log(
      `CloneInsta server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`
    );
  });
}

startServer().catch((error: unknown) => {
  console.error("CloneInsta server failed to start.", error);
  process.exitCode = 1;
});

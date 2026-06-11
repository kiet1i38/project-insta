import "dotenv/config";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultTestDatabaseUrl =
  "postgresql://cloneinsta:cloneinsta_dev_password@localhost:5432/cloneinsta_test?schema=public";

const currentDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(currentDir, "..");
const prismaCliPath = resolve(
  serverRoot,
  "..",
  "node_modules",
  "prisma",
  "build",
  "index.js"
);

const result = spawnSync(
  process.execPath,
  [prismaCliPath, "migrate", "deploy", "--config", "prisma.config.ts"],
  {
    cwd: serverRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl
    }
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

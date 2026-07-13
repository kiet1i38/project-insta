import type { PrismaClient } from "../generated/prisma/client.js";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(currentDir, "../..");
const repoRoot = resolve(serverRoot, "..");

const managedTables = [
  `"ConversationReadState"`,
  `"Message"`,
  `"ConversationParticipant"`,
  `"Conversation"`,
  `"AuditLog"`,
  `"ModerationAction"`,
  `"Report"`,
  `"Like"`,
  `"Follow"`,
  `"UserBlock"`,
  `"Comment"`,
  `"Post"`,
  `"RefreshToken"`,
  `"User"`
].join(", ");

export async function resetDatabaseTables(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${managedTables} RESTART IDENTITY CASCADE`);
}

export function runRepoScript(
  script: string,
  envOverrides: Record<string, string> = {}
): SpawnSyncReturns<string> {
  const npmExecPath = process.env.npm_execpath;

  if (!npmExecPath) {
    throw new Error("npm_execpath is not available in the current process");
  }

  return spawnSync(process.execPath, [npmExecPath, "run", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...envOverrides
    }
  });
}

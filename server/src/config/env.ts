import "dotenv/config";
import { z } from "zod";

const defaultDatabaseUrl =
  "postgresql://cloneinsta:cloneinsta_dev_password@localhost:5432/cloneinsta?schema=public";
const defaultTestDatabaseUrl =
  "postgresql://cloneinsta:cloneinsta_dev_password@localhost:5432/cloneinsta_test?schema=public";

const envSchema = z.object({
  ACCESS_TOKEN_SECRET: z
    .string()
    .min(32)
    .default("cloneinsta_local_access_token_secret_change_me_123"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(32)
    .default("cloneinsta_local_refresh_token_secret_change_me_123"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().url().default(defaultDatabaseUrl),
  TEST_DATABASE_URL: z.string().url().default(defaultTestDatabaseUrl),
  LOCAL_UPLOAD_DIR: z.string().default("server/uploads"),
  SMTP_HOST: z.string().trim().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_FROM: z.string().email().default("noreply@cloneinsta.local")
});

export function parseEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return envSchema.parse(environment);
}

let parsedEnv: ReturnType<typeof parseEnvironment>;

try {
  parsedEnv = parseEnvironment();
} catch (error) {
  const details = error instanceof z.ZodError ? error.flatten() : undefined;

  console.error("Invalid environment configuration", details);
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv;

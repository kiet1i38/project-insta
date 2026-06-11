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
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z
    .string()
    .url()
    .default("http://localhost:5173"),
  DATABASE_URL: z.string().url().default(defaultDatabaseUrl),
  TEST_DATABASE_URL: z.string().url().default(defaultTestDatabaseUrl),
  LOCAL_UPLOAD_DIR: z.string().default("server/uploads")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment configuration", parsedEnv.error.flatten());
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv.data;

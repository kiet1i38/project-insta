import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultDatabaseUrl =
  "postgresql://cloneinsta:cloneinsta_dev_password@localhost:5432/cloneinsta?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl
  }
});

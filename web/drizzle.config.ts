import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: process.env.DATABASE_URL?.startsWith("libsql:") ? "turso" : "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:calories.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});

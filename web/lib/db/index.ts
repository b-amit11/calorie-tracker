import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

// Local: a SQLite file. Production: a Turso database (libsql://...).
function createDb(url = process.env.DATABASE_URL ?? "file:calories.db"): { db: DB; client: Client } {
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return { db: drizzle(client, { schema }), client };
}

const g = globalThis as unknown as { __db?: Promise<DB> };

/** Opened lazily and migrated once per process, so builds never touch the database. */
export function getDb(): Promise<DB> {
  return (g.__db ??= (async () => {
    const { db, client } = createDb();
    if (!process.env.DATABASE_URL?.startsWith("libsql:")) await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA foreign_keys = ON");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    return db;
  })());
}

/** Fresh in-memory database for tests. */
export async function createTestDb(): Promise<DB> {
  const { db, client } = createDb(":memory:");
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export { schema };

import { DatabaseSync } from "node:sqlite";
import path from "node:path";

// Single local SQLite file. Override with DB_PATH if you want it elsewhere (e.g. iCloud Drive).
const file = process.env.DB_PATH ?? path.join(process.cwd(), "calories.db");

const globalForDb = globalThis as unknown as { db?: DatabaseSync };

function open() {
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Nutrition is stored per 100 g.
    CREATE TABLE IF NOT EXISTS foods (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT,
      barcode TEXT,
      source TEXT NOT NULL,          -- 'custom' | 'usda' | 'off'
      source_id TEXT,
      kcal REAL NOT NULL,
      protein REAL NOT NULL DEFAULT 0,
      carbs REAL NOT NULL DEFAULT 0,
      fat REAL NOT NULL DEFAULT 0,
      fiber REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (source, source_id)
    );

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,            -- YYYY-MM-DD, local
      meal TEXT NOT NULL,            -- breakfast | lunch | dinner | snacks
      food_id INTEGER NOT NULL REFERENCES foods(id),
      grams REAL NOT NULL,
      weighed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS entries_date ON entries(date);

    CREATE TABLE IF NOT EXISTS weights (
      date TEXT PRIMARY KEY,
      kg REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

/** Opened lazily on first query, so builds don't touch the file. */
export function db(): DatabaseSync {
  return (globalForDb.db ??= open());
}

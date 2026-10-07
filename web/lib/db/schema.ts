import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch('subsec') * 1000)`);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** Session ids are SHA-256 hashes of the cookie token, so a leaked DB can't be replayed. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/**
 * Nutrition per 100 g. Rows with ownerId = null are a shared cache of USDA / Open Food Facts
 * items; custom foods belong to one user.
 */
export const foods = sqliteTable(
  "foods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    barcode: text("barcode"),
    source: text("source", { enum: ["custom", "usda", "off"] }).notNull(),
    sourceId: text("source_id"),
    kcal: real("kcal").notNull(),
    protein: real("protein").notNull().default(0),
    carbs: real("carbs").notNull().default(0),
    fat: real("fat").notNull().default(0),
    fiber: real("fiber").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("foods_source").on(t.source, t.sourceId),
    index("foods_barcode").on(t.barcode),
    index("foods_owner").on(t.ownerId),
  ],
);

export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD in the user's local time
    meal: text("meal", { enum: ["breakfast", "lunch", "dinner", "snacks"] }).notNull(),
    foodId: integer("food_id").notNull().references(() => foods.id),
    grams: real("grams").notNull(),
    weighed: integer("weighed", { mode: "boolean" }).notNull().default(false),
    /** Set by the client so offline retries don't create duplicates. */
    clientId: text("client_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("entries_user_date").on(t.userId, t.date),
    uniqueIndex("entries_client").on(t.userId, t.clientId),
  ],
);

export const weights = sqliteTable(
  "weights",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    kg: real("kg").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const goals = sqliteTable("goals", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  kcal: real("kcal").notNull(),
  protein: real("protein").notNull(),
  carbs: real("carbs").notNull(),
  fat: real("fat").notNull(),
});

/** Fixed-window counters for login rate limiting (works across serverless instances). */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at", { mode: "timestamp_ms" }).notNull(),
});

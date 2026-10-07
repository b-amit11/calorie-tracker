import { and, asc, desc, eq, gte, inArray, isNull, or, sql, type AnyColumn } from "drizzle-orm";
import type { DB } from "./db";
import { entries, foods, goals, weights } from "./db/schema";
import { DEFAULT_GOALS, scale, type Entry, type Food, type Goals, type Meal, type NewFood } from "./types";

type FoodRow = typeof foods.$inferSelect;

export function toFood(r: FoodRow): Food {
  return {
    id: r.id, name: r.name, brand: r.brand, barcode: r.barcode, source: r.source, custom: r.ownerId !== null,
    kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber,
  };
}

/** Case-insensitive substring match with LIKE wildcards in the input escaped. */
const contains = (col: AnyColumn, q: string) => sql`${col} LIKE ${`%${q.replace(/[\\%_]/g, "\\$&")}%`} ESCAPE '\\'`;

/** Foods a user may see/log: the shared catalog plus their own custom foods. */
const visibleTo = (userId: string) => or(isNull(foods.ownerId), eq(foods.ownerId, userId));

/**
 * Cache foods fetched by the server from USDA / Open Food Facts into the shared catalog.
 * Only server-side code calls this, so users can't inject nutrition data for catalog items.
 */
export async function cacheCatalogFoods(db: DB, list: NewFood[]): Promise<Food[]> {
  if (!list.length) return [];
  const rows = await db
    .insert(foods)
    .values(list.map((f) => ({ ...f, ownerId: null })))
    .onConflictDoUpdate({
      target: [foods.source, foods.sourceId],
      set: {
        name: sql`excluded.name`, brand: sql`excluded.brand`, barcode: sql`excluded.barcode`,
        kcal: sql`excluded.kcal`, protein: sql`excluded.protein`, carbs: sql`excluded.carbs`,
        fat: sql`excluded.fat`, fiber: sql`excluded.fiber`,
      },
    })
    .returning();
  return rows.map(toFood);
}

export async function createCustomFood(db: DB, userId: string, f: Omit<NewFood, "source" | "sourceId">): Promise<Food> {
  const [row] = await db.insert(foods).values({ ...f, source: "custom", ownerId: userId }).returning();
  return toFood(row);
}

export async function getFood(db: DB, userId: string, id: number): Promise<Food | null> {
  const row = await db.query.foods.findFirst({ where: and(eq(foods.id, id), visibleTo(userId)) });
  return row ? toFood(row) : null;
}

/** The user's own custom foods and catalog foods they've logged before, most used first. */
export async function searchMyFoods(db: DB, userId: string, q: string): Promise<Food[]> {
  const uses = db
    .select({ foodId: entries.foodId, n: sql<number>`count(*)`.as("n") })
    .from(entries)
    .where(eq(entries.userId, userId))
    .groupBy(entries.foodId)
    .as("uses");
  const rows = await db
    .select({ food: foods })
    .from(foods)
    .leftJoin(uses, eq(uses.foodId, foods.id))
    .where(and(
      or(eq(foods.ownerId, userId), sql`${uses.n} > 0`),
      or(contains(foods.name, q), contains(foods.brand, q), eq(foods.barcode, q)),
    ))
    .orderBy(desc(sql`coalesce(${uses.n}, 0)`), asc(foods.name))
    .limit(15);
  return rows.map((r) => toFood(r.food));
}

export async function recentFoods(db: DB, userId: string, limit = 12): Promise<(Food & { lastGrams: number })[]> {
  const latest = await db
    .select({ foodId: entries.foodId, id: sql<number>`max(${entries.id})`.as("id") })
    .from(entries)
    .where(eq(entries.userId, userId))
    .groupBy(entries.foodId)
    .orderBy(desc(sql`max(${entries.id})`))
    .limit(limit);
  if (!latest.length) return [];
  const rows = await db
    .select({ food: foods, grams: entries.grams, id: entries.id })
    .from(entries)
    .innerJoin(foods, eq(foods.id, entries.foodId))
    .where(inArray(entries.id, latest.map((l) => l.id)))
    .orderBy(desc(entries.id));
  return rows.map((r) => ({ ...toFood(r.food), lastGrams: r.grams }));
}

export async function findByBarcode(db: DB, userId: string, code: string): Promise<Food | null> {
  const row = await db.query.foods.findFirst({ where: and(eq(foods.barcode, code), visibleTo(userId)) });
  return row ? toFood(row) : null;
}

export async function entriesForDate(db: DB, userId: string, date: string): Promise<Entry[]> {
  const rows = await db
    .select({ e: entries, f: foods })
    .from(entries)
    .innerJoin(foods, eq(foods.id, entries.foodId))
    .where(and(eq(entries.userId, userId), eq(entries.date, date)))
    .orderBy(asc(entries.createdAt), asc(entries.id));
  return rows.map(({ e, f }) => {
    const food = toFood(f);
    return { id: e.id, date: e.date, meal: e.meal, grams: e.grams, weighed: e.weighed, food, totals: scale(food, e.grams) };
  });
}

/** Idempotent on clientId: replaying the same offline entry returns the original id. */
export async function addEntry(
  db: DB,
  userId: string,
  e: { date: string; meal: Meal; foodId: number; grams: number; weighed: boolean; clientId?: string },
): Promise<{ id: number; created: boolean }> {
  const [row] = await db
    .insert(entries)
    .values({ ...e, userId, clientId: e.clientId ?? null })
    .onConflictDoNothing({ target: [entries.userId, entries.clientId] })
    .returning({ id: entries.id });
  if (row) return { id: row.id, created: true };
  const existing = await db.query.entries.findFirst({
    where: and(eq(entries.userId, userId), eq(entries.clientId, e.clientId!)),
  });
  return { id: existing!.id, created: false };
}

/** Returns false when the entry doesn't exist or belongs to someone else. */
export async function updateEntry(db: DB, userId: string, id: number, patch: { grams?: number; meal?: Meal }) {
  if (patch.grams == null && !patch.meal) return true;
  const res = await db
    .update(entries)
    .set({ ...(patch.grams != null && { grams: patch.grams }), ...(patch.meal && { meal: patch.meal }) })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning({ id: entries.id });
  return res.length > 0;
}

export async function deleteEntry(db: DB, userId: string, id: number) {
  const res = await db
    .delete(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning({ id: entries.id });
  return res.length > 0;
}

export async function getGoals(db: DB, userId: string): Promise<Goals> {
  const row = await db.query.goals.findFirst({ where: eq(goals.userId, userId) });
  return row ? { kcal: row.kcal, protein: row.protein, carbs: row.carbs, fat: row.fat } : DEFAULT_GOALS;
}

export async function setGoals(db: DB, userId: string, g: Goals) {
  await db.insert(goals).values({ userId, ...g }).onConflictDoUpdate({ target: goals.userId, set: g });
}

export async function listWeights(db: DB, userId: string, sinceDate: string) {
  return db
    .select({ date: weights.date, kg: weights.kg })
    .from(weights)
    .where(and(eq(weights.userId, userId), gte(weights.date, sinceDate)))
    .orderBy(asc(weights.date));
}

export async function setWeight(db: DB, userId: string, date: string, kg: number) {
  await db.insert(weights).values({ userId, date, kg }).onConflictDoUpdate({ target: [weights.userId, weights.date], set: { kg } });
}

export async function deleteWeight(db: DB, userId: string, date: string) {
  await db.delete(weights).where(and(eq(weights.userId, userId), eq(weights.date, date)));
}

/** Daily calorie totals since a date, for the trend chart. */
export async function dailyTotals(db: DB, userId: string, sinceDate: string) {
  const rows = await db
    .select({ date: entries.date, kcal: sql<number>`sum(${foods.kcal} * ${entries.grams} / 100.0)` })
    .from(entries)
    .innerJoin(foods, eq(foods.id, entries.foodId))
    .where(and(eq(entries.userId, userId), gte(entries.date, sinceDate)))
    .groupBy(entries.date)
    .orderBy(asc(entries.date));
  return rows.map((r) => ({ date: r.date, kcal: Number(r.kcal) }));
}

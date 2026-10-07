import { db } from "./db";
import { DEFAULT_GOALS, scale, type Entry, type Food, type Goals, type Meal } from "./types";

type FoodRow = Food & { id: number };

/** Insert a food (or return the existing row for the same source+id). */
export function upsertFood(f: Food): number {
  if (f.id) return f.id;
  if (f.source !== "custom" && f.source_id) {
    const existing = db()
      .prepare("SELECT id FROM foods WHERE source = ? AND source_id = ?")
      .get(f.source, f.source_id) as { id: number } | undefined;
    if (existing) return existing.id;
  }
  const r = db()
    .prepare(
      `INSERT INTO foods (name, brand, barcode, source, source_id, kcal, protein, carbs, fat, fiber)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(f.name, f.brand ?? null, f.barcode ?? null, f.source, f.source_id ?? null,
         f.kcal, f.protein, f.carbs, f.fat, f.fiber);
  return Number(r.lastInsertRowid);
}

export function searchLocalFoods(q: string): FoodRow[] {
  return db()
    .prepare(
      `SELECT f.* FROM foods f
       LEFT JOIN (SELECT food_id, COUNT(*) n, MAX(created_at) last FROM entries GROUP BY food_id) u ON u.food_id = f.id
       WHERE f.name LIKE ? OR f.brand LIKE ? OR f.barcode = ?
       ORDER BY COALESCE(u.n, 0) DESC, f.name LIMIT 15`,
    )
    .all(`%${q}%`, `%${q}%`, q) as FoodRow[];
}

export function recentFoods(limit = 12): (FoodRow & { last_grams: number })[] {
  return db()
    .prepare(
      `SELECT f.*, e.grams AS last_grams FROM foods f
       JOIN entries e ON e.id = (SELECT id FROM entries WHERE food_id = f.id ORDER BY created_at DESC, id DESC LIMIT 1)
       ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
    )
    .all(limit) as (FoodRow & { last_grams: number })[];
}

export function findByBarcode(code: string): FoodRow | undefined {
  return db().prepare("SELECT * FROM foods WHERE barcode = ? LIMIT 1").get(code) as FoodRow | undefined;
}

type EntryRow = {
  id: number; date: string; meal: Meal; grams: number; weighed: number;
  food_id: number; name: string; brand: string | null; barcode: string | null;
  source: Food["source"]; source_id: string | null;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
};

export function entriesForDate(date: string): Entry[] {
  const rows = db()
    .prepare(
      `SELECT e.id, e.date, e.meal, e.grams, e.weighed, f.id AS food_id, f.name, f.brand, f.barcode,
              f.source, f.source_id, f.kcal, f.protein, f.carbs, f.fat, f.fiber
       FROM entries e JOIN foods f ON f.id = e.food_id
       WHERE e.date = ? ORDER BY e.created_at, e.id`,
    )
    .all(date) as EntryRow[];
  return rows.map((r) => {
    const food: Food = {
      id: r.food_id, name: r.name, brand: r.brand, barcode: r.barcode, source: r.source, source_id: r.source_id,
      kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber,
    };
    return { id: r.id, date: r.date, meal: r.meal, grams: r.grams, weighed: !!r.weighed, food, totals: scale(food, r.grams) };
  });
}

export function addEntry(e: { date: string; meal: Meal; foodId: number; grams: number; weighed: boolean }) {
  const r = db()
    .prepare("INSERT INTO entries (date, meal, food_id, grams, weighed) VALUES (?, ?, ?, ?, ?)")
    .run(e.date, e.meal, e.foodId, e.grams, e.weighed ? 1 : 0);
  return Number(r.lastInsertRowid);
}

export function updateEntry(id: number, patch: { grams?: number; meal?: Meal }) {
  if (patch.grams != null) db().prepare("UPDATE entries SET grams = ? WHERE id = ?").run(patch.grams, id);
  if (patch.meal) db().prepare("UPDATE entries SET meal = ? WHERE id = ?").run(patch.meal, id);
}

export function deleteEntry(id: number) {
  db().prepare("DELETE FROM entries WHERE id = ?").run(id);
}

export function getGoals(): Goals {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'goals'").get() as { value: string } | undefined;
  return row ? { ...DEFAULT_GOALS, ...JSON.parse(row.value) } : DEFAULT_GOALS;
}

export function setGoals(g: Goals) {
  db().prepare("INSERT INTO settings (key, value) VALUES ('goals', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(g));
}

export function listWeights(days = 365): { date: string; kg: number }[] {
  return db()
    .prepare("SELECT date, kg FROM weights WHERE date >= date('now', ?) ORDER BY date")
    .all(`-${days} days`) as { date: string; kg: number }[];
}

export function setWeight(date: string, kg: number) {
  db().prepare("INSERT INTO weights (date, kg) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg").run(date, kg);
}

export function deleteWeight(date: string) {
  db().prepare("DELETE FROM weights WHERE date = ?").run(date);
}

/** Daily calorie totals for the trend chart. */
export function dailyTotals(days = 30): { date: string; kcal: number }[] {
  return db()
    .prepare(
      `SELECT e.date, SUM(f.kcal * e.grams / 100.0) AS kcal
       FROM entries e JOIN foods f ON f.id = e.food_id
       WHERE e.date >= date('now', ?) GROUP BY e.date ORDER BY e.date`,
    )
    .all(`-${days} days`) as { date: string; kcal: number }[];
}

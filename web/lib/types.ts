export const MEALS = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type Meal = (typeof MEALS)[number];

/** Nutrition per 100 g. */
export type Nutrition = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };

export type FoodSource = "custom" | "usda" | "off";

/** A food as returned by the API. Catalog foods are shared; custom foods belong to one user. */
export type Food = Nutrition & {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  source: FoodSource;
  custom: boolean;
};

/** A food before it's stored (e.g. fresh from USDA / Open Food Facts). */
export type NewFood = Nutrition & {
  name: string;
  brand: string | null;
  barcode: string | null;
  source: FoodSource;
  sourceId: string | null;
};

export type Entry = {
  id: number;
  date: string;
  meal: Meal;
  grams: number;
  weighed: boolean;
  food: Food;
  totals: Nutrition;
};

export type Goals = { kcal: number; protein: number; carbs: number; fat: number };
export const DEFAULT_GOALS: Goals = { kcal: 2000, protein: 120, carbs: 220, fat: 65 };

export function scale(n: Nutrition, grams: number): Nutrition {
  const f = grams / 100;
  return {
    kcal: n.kcal * f,
    protein: n.protein * f,
    carbs: n.carbs * f,
    fat: n.fat * f,
    fiber: n.fiber * f,
  };
}

export function sum(list: Nutrition[]): Nutrition {
  return list.reduce(
    (a, n) => ({
      kcal: a.kcal + n.kcal,
      protein: a.protein + n.protein,
      carbs: a.carbs + n.carbs,
      fat: a.fat + n.fat,
      fiber: a.fiber + n.fiber,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

/** Calories implied by macros (4/4/9 kcal per gram). */
export const macroKcal = (g: Pick<Goals, "protein" | "carbs" | "fat">) => g.protein * 4 + g.carbs * 4 + g.fat * 9;

export function todayISO(d = new Date()) {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/** Add days to a YYYY-MM-DD date (calendar math, timezone-independent). */
export function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

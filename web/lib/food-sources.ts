import type { NewFood } from "./types";

// Open Food Facts asks for an identifying User-Agent.
const UA = "PersonalCalorieTracker/0.1 (personal, non-commercial)";
const round = (n: unknown) => (typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : 0);

export type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  nutriments?: Record<string, number>;
};

/**
 * USDA's own ranking puts things like "Oil, oat" above "Oats" for "oats".
 * Prefer names that start with the query (singular or plural), then names containing it as a word,
 * then shorter (more generic) names. Stable for equal scores.
 */
export function rankByRelevance<T extends { name: string }>(q: string, list: T[]): T[] {
  const term = q.trim().toLowerCase();
  const stem = term.replace(/(es|s)$/, "");
  const score = (name: string) => {
    const n = name.toLowerCase();
    const first = n.split(/[\s,]+/)[0];
    if (n.startsWith(term) || first === stem || first === `${stem}s` || first === `${stem}es`) return 0;
    if (new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(n)) return 1;
    return 2;
  };
  return list
    .map((item, i) => ({ item, i, s: score(item.name) }))
    .sort((a, b) => a.s - b.s || a.item.name.length - b.item.name.length || a.i - b.i)
    .map((x) => x.item);
}

/** Map an Open Food Facts product to our shape; null if it lacks a name or sane calories. */
export function parseOffProduct(p: OffProduct): NewFood | null {
  const n = p.nutriments ?? {};
  const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : undefined);
  if (!p.product_name?.trim() || kcal == null || !p.code || kcal < 0 || kcal > 900) return null;
  return {
    name: p.product_name.trim(),
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0])?.trim() || null,
    barcode: p.code,
    source: "off",
    sourceId: p.code,
    kcal: round(kcal),
    protein: round(n["proteins_100g"]),
    carbs: round(n["carbohydrates_100g"]),
    fat: round(n["fat_100g"]),
    fiber: round(n["fiber_100g"]),
  };
}

/** Branded/packaged foods. */
export async function searchOpenFoodFacts(q: string): Promise<NewFood[]> {
  const url = new URL("https://search.openfoodfacts.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("page_size", "15");
  url.searchParams.set("fields", "code,product_name,brands,nutriments");
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { hits?: OffProduct[] };
  return (data.hits ?? []).map(parseOffProduct).filter((f): f is NewFood => f !== null);
}

export async function lookupBarcode(code: string): Promise<NewFood | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=code,product_name,brands,nutriments`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { product?: OffProduct };
  return data.product ? parseOffProduct({ ...data.product, code }) : null;
}

export type UsdaFood = {
  fdcId: number;
  description: string;
  foodNutrients: { nutrientId: number; value?: number }[];
};

// USDA nutrient ids. Foundation foods sometimes only carry the Atwater energy values (2047/2048).
const KCAL = [1008, 2047, 2048];
const PROTEIN = 1003, FAT = 1004, CARBS = 1005, FIBER = 1079;

/** Whole/generic foods (banana, chicken breast, rice...). Values are per 100 g. */
export async function searchUsda(q: string): Promise<NewFood[]> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  // DEMO_KEY is heavily rate limited; get a free key at https://fdc.nal.usda.gov/api-key-signup
  url.searchParams.set("api_key", process.env.USDA_API_KEY || "DEMO_KEY");
  url.searchParams.set("query", q);
  url.searchParams.set("pageSize", "25"); // re-ranked below, so fetch a few extra
  url.searchParams.set("dataType", "Foundation,SR Legacy");
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { foods?: UsdaFood[] };
  return rankByRelevance(q, (data.foods ?? []).map(parseUsdaFood).filter((f): f is NewFood => f !== null));
}

/** Map a USDA search hit (values per 100 g) to our shape; null if it has no usable energy value. */
export function parseUsdaFood(f: UsdaFood): NewFood | null {
  const get = (id: number) => f.foodNutrients.find((n) => n.nutrientId === id)?.value;
  const kcal = KCAL.map(get).find((v) => v != null);
  if (kcal == null || kcal < 0 || kcal > 900) return null;
  return {
    name: f.description,
    brand: null,
    barcode: null,
    source: "usda",
    sourceId: String(f.fdcId),
    kcal: round(kcal),
    protein: round(get(PROTEIN)),
    carbs: round(get(CARBS)),
    fat: round(get(FAT)),
    fiber: round(get(FIBER)),
  };
}

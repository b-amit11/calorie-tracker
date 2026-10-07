import type { Food } from "./types";

// Open Food Facts asks for an identifying User-Agent.
const UA = "PersonalCalorieTracker/0.1 (personal, non-commercial)";
const round = (n: unknown) => (typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : 0);

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  nutriments?: Record<string, number>;
};

function fromOff(p: OffProduct): Food | null {
  const n = p.nutriments ?? {};
  const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : undefined);
  if (!p.product_name || kcal == null || !p.code) return null;
  return {
    name: p.product_name,
    brand: Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0] ?? null,
    barcode: p.code,
    source: "off",
    source_id: p.code,
    kcal: round(kcal),
    protein: round(n["proteins_100g"]),
    carbs: round(n["carbohydrates_100g"]),
    fat: round(n["fat_100g"]),
    fiber: round(n["fiber_100g"]),
  };
}

/** Branded/packaged foods. */
export async function searchOpenFoodFacts(q: string): Promise<Food[]> {
  const url = new URL("https://search.openfoodfacts.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("page_size", "15");
  url.searchParams.set("fields", "code,product_name,brands,nutriments");
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { hits?: OffProduct[] };
  return (data.hits ?? []).map(fromOff).filter((f): f is Food => f !== null);
}

export async function lookupBarcode(code: string): Promise<Food | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=code,product_name,brands,nutriments`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { product?: OffProduct };
  return data.product ? fromOff({ ...data.product, code }) : null;
}

type UsdaFood = {
  fdcId: number;
  description: string;
  foodNutrients: { nutrientId: number; value?: number }[];
};

// USDA nutrient ids. Foundation foods sometimes only carry the Atwater energy values (2047/2048).
const KCAL = [1008, 2047, 2048];
const PROTEIN = 1003, FAT = 1004, CARBS = 1005, FIBER = 1079;

/** Whole/generic foods (banana, chicken breast, rice...). Values are per 100 g. */
export async function searchUsda(q: string): Promise<Food[]> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  // DEMO_KEY is heavily rate limited; get a free key at https://fdc.nal.usda.gov/api-key-signup
  url.searchParams.set("api_key", process.env.USDA_API_KEY || "DEMO_KEY");
  url.searchParams.set("query", q);
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("dataType", "Foundation,SR Legacy");
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { foods?: UsdaFood[] };
  return (data.foods ?? []).flatMap((f) => {
    const get = (id: number) => f.foodNutrients.find((n) => n.nutrientId === id)?.value;
    const kcal = KCAL.map(get).find((v) => v != null);
    if (kcal == null) return [];
    return [{
      name: f.description,
      brand: null,
      source: "usda" as const,
      source_id: String(f.fdcId),
      kcal: round(kcal),
      protein: round(get(PROTEIN)),
      carbs: round(get(CARBS)),
      fat: round(get(FAT)),
      fiber: round(get(FIBER)),
    }];
  });
}

import { addEntry, upsertFood } from "@/lib/repo";
import type { Food } from "@/lib/types";
import { BadRequest, date, handle, isMeal, num } from "@/lib/validate";

// Body: { date, meal, grams, weighed?, food: Food }  (food.id set if it already exists locally)
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  if (!isMeal(b.meal)) throw new BadRequest("invalid meal");
  const f = b.food as Food | undefined;
  if (!f || typeof f.name !== "string" || !f.name.trim()) throw new BadRequest("invalid food");
  const foodId = upsertFood({
    id: f.id ? num(f.id, "food.id", { min: 1, max: Number.MAX_SAFE_INTEGER }) : undefined,
    name: f.name.trim().slice(0, 200),
    brand: f.brand?.slice(0, 100) ?? null,
    barcode: f.barcode?.slice(0, 32) ?? null,
    source: f.source === "usda" || f.source === "off" ? f.source : "custom",
    source_id: f.source_id ?? null,
    kcal: num(f.kcal, "kcal", { max: 1000 }),
    protein: num(f.protein ?? 0, "protein", { max: 100 }),
    carbs: num(f.carbs ?? 0, "carbs", { max: 100 }),
    fat: num(f.fat ?? 0, "fat", { max: 100 }),
    fiber: num(f.fiber ?? 0, "fiber", { max: 100 }),
  });
  const id = addEntry({
    date: date(b.date),
    meal: b.meal,
    foodId,
    grams: num(b.grams, "grams", { min: 0.1, max: 10_000 }),
    weighed: !!b.weighed,
  });
  return Response.json({ id, foodId }, { status: 201 });
});

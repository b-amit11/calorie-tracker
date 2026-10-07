import { authed } from "@/lib/api";
import { createCustomFood } from "@/lib/repo";
import { jsonBody, num, str } from "@/lib/validate";

/** Create a custom food (nutrition per 100 g). */
export const POST = authed(async (req, { db, user }) => {
  const b = await jsonBody(req);
  const food = await createCustomFood(db, user.id, {
    name: str(b.name, "name")!,
    brand: str(b.brand, "brand", { max: 100, optional: true }),
    barcode: null,
    kcal: num(b.kcal, "kcal", { max: 900 }),
    protein: num(b.protein ?? 0, "protein", { max: 100 }),
    carbs: num(b.carbs ?? 0, "carbs", { max: 100 }),
    fat: num(b.fat ?? 0, "fat", { max: 100 }),
    fiber: num(b.fiber ?? 0, "fiber", { max: 100 }),
  });
  return Response.json(food, { status: 201 });
});

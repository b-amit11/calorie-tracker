import { authed } from "@/lib/api";
import { getGoals, setGoals } from "@/lib/repo";
import { jsonBody, num } from "@/lib/validate";

export const GET = authed(async (_req, { db, user }) => Response.json(await getGoals(db, user.id)));

export const PUT = authed(async (req, { db, user }) => {
  const b = await jsonBody(req);
  const goals = {
    kcal: num(b.kcal, "kcal", { min: 500, max: 10_000 }),
    protein: num(b.protein, "protein", { max: 1000 }),
    carbs: num(b.carbs, "carbs", { max: 2000 }),
    fat: num(b.fat, "fat", { max: 1000 }),
  };
  await setGoals(db, user.id, goals);
  return Response.json(goals);
});

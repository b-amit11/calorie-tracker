import { getGoals, setGoals } from "@/lib/repo";
import { handle, num } from "@/lib/validate";

export function GET() {
  return Response.json(getGoals());
}

export const PUT = handle(async (req: Request) => {
  const b = await req.json();
  const goals = {
    kcal: num(b.kcal, "kcal", { min: 500, max: 10_000 }),
    protein: num(b.protein, "protein", { max: 1000 }),
    carbs: num(b.carbs, "carbs", { max: 2000 }),
    fat: num(b.fat, "fat", { max: 1000 }),
  };
  setGoals(goals);
  return Response.json(goals);
});

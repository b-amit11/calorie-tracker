import { searchOpenFoodFacts, searchUsda } from "@/lib/food-sources";
import { searchLocalFoods } from "@/lib/repo";
import type { Food } from "@/lib/types";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json({ local: [], usda: [], off: [] });

  const local = searchLocalFoods(q);
  const known = new Set(local.map((f) => `${f.source}:${f.source_id}`));
  const notKnown = (f: Food) => !known.has(`${f.source}:${f.source_id}`);

  // Remote sources are best-effort: one being down shouldn't break search.
  const [usda, off] = await Promise.allSettled([searchUsda(q), searchOpenFoodFacts(q)]);
  return Response.json({
    local,
    usda: usda.status === "fulfilled" ? usda.value.filter(notKnown) : [],
    off: off.status === "fulfilled" ? off.value.filter(notKnown) : [],
  });
}

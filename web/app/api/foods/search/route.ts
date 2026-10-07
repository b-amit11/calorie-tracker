import { authed } from "@/lib/api";
import { searchOpenFoodFacts, searchUsda } from "@/lib/food-sources";
import { cacheCatalogFoods, searchMyFoods } from "@/lib/repo";
import type { Food } from "@/lib/types";

export const GET = authed(async (req, { db, user }) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return Response.json({ mine: [], usda: [], off: [] });

  // Remote sources are best-effort: one being down shouldn't break search.
  const [mine, usda, off] = await Promise.all([
    searchMyFoods(db, user.id, q),
    searchUsda(q).then((r) => cacheCatalogFoods(db, r)).catch(() => [] as Food[]),
    searchOpenFoodFacts(q).then((r) => cacheCatalogFoods(db, r)).catch(() => [] as Food[]),
  ]);
  const seen = new Set(mine.map((f) => f.id));
  const fresh = (list: Food[]) => list.filter((f) => !seen.has(f.id));
  return Response.json({ mine, usda: fresh(usda), off: fresh(off) });
});

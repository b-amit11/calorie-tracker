import { entriesForDate, getGoals } from "@/lib/repo";
import { sum } from "@/lib/types";
import { date, handle } from "@/lib/validate";

export const GET = handle((req: Request) => {
  const d = date(new URL(req.url).searchParams.get("date"));
  const entries = entriesForDate(d);
  return Response.json({ date: d, entries, totals: sum(entries.map((e) => e.totals)), goals: getGoals() });
});

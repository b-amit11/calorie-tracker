import { authed } from "@/lib/api";
import { entriesForDate, getGoals } from "@/lib/repo";
import { sum } from "@/lib/types";
import { date } from "@/lib/validate";

export const GET = authed(async (req, { db, user }) => {
  const d = date(new URL(req.url).searchParams.get("date"));
  const [entries, goals] = await Promise.all([entriesForDate(db, user.id, d), getGoals(db, user.id)]);
  return Response.json({ date: d, entries, totals: sum(entries.map((e) => e.totals)), goals });
});

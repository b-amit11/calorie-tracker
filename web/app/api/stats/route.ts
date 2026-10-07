import { authed } from "@/lib/api";
import { dailyTotals, getGoals } from "@/lib/repo";
import { date } from "@/lib/validate";

export const GET = authed(async (req, { db, user }) => {
  const since = date(new URL(req.url).searchParams.get("since"));
  const [days, goals] = await Promise.all([dailyTotals(db, user.id, since), getGoals(db, user.id)]);
  return Response.json({ days, goals });
});

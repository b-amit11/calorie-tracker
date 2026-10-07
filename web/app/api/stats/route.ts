import { dailyTotals, getGoals } from "@/lib/repo";

export function GET() {
  return Response.json({ days: dailyTotals(30), goals: getGoals() });
}

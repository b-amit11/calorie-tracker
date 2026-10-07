import { recentFoods } from "@/lib/repo";

export function GET() {
  return Response.json(recentFoods());
}

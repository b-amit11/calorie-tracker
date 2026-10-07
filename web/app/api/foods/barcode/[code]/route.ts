import { lookupBarcode } from "@/lib/food-sources";
import { findByBarcode } from "@/lib/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/foods/barcode/[code]">) {
  const { code } = await ctx.params;
  if (!/^\d{6,14}$/.test(code)) return Response.json({ error: "invalid barcode" }, { status: 400 });
  const food = findByBarcode(code) ?? (await lookupBarcode(code).catch(() => null));
  return food ? Response.json(food) : Response.json({ error: "not found" }, { status: 404 });
}

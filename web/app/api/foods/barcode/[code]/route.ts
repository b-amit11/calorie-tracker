import { authed } from "@/lib/api";
import { lookupBarcode } from "@/lib/food-sources";
import { cacheCatalogFoods, findByBarcode } from "@/lib/repo";
import { BadRequest, NotFound } from "@/lib/validate";

export const GET = authed<{ code: string }>(async (_req, { db, user }, { params }) => {
  const { code } = await params;
  if (!/^\d{6,14}$/.test(code)) throw new BadRequest("invalid barcode");
  const local = await findByBarcode(db, user.id, code);
  if (local) return Response.json(local);
  const remote = await lookupBarcode(code).catch(() => null);
  if (!remote) throw new NotFound("no product found for that barcode");
  const [food] = await cacheCatalogFoods(db, [remote]);
  return Response.json(food);
});

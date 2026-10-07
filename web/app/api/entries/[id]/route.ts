import { deleteEntry, updateEntry } from "@/lib/repo";
import { BadRequest, handle, isMeal, num } from "@/lib/validate";

type Ctx = RouteContext<"/api/entries/[id]">;

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const id = num((await ctx.params).id, "id", { min: 1, max: Number.MAX_SAFE_INTEGER });
  const b = await req.json();
  if (b.meal != null && !isMeal(b.meal)) throw new BadRequest("invalid meal");
  updateEntry(id, {
    grams: b.grams != null ? num(b.grams, "grams", { min: 0.1, max: 10_000 }) : undefined,
    meal: b.meal,
  });
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  deleteEntry(num((await ctx.params).id, "id", { min: 1, max: Number.MAX_SAFE_INTEGER }));
  return Response.json({ ok: true });
});

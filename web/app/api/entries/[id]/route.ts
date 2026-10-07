import { authed } from "@/lib/api";
import { deleteEntry, updateEntry } from "@/lib/repo";
import { BadRequest, id, isMeal, jsonBody, num, NotFound } from "@/lib/validate";

type Params = { id: string };

export const PATCH = authed<Params>(async (req, { db, user }, { params }) => {
  const entryId = id((await params).id);
  const b = await jsonBody(req);
  if (b.meal != null && !isMeal(b.meal)) throw new BadRequest("invalid meal");
  const ok = await updateEntry(db, user.id, entryId, {
    grams: b.grams != null ? num(b.grams, "grams", { min: 0.1, max: 10_000 }) : undefined,
    meal: b.meal ?? undefined,
  });
  if (!ok) throw new NotFound("entry not found");
  return Response.json({ ok: true });
});

export const DELETE = authed<Params>(async (_req, { db, user }, { params }) => {
  if (!(await deleteEntry(db, user.id, id((await params).id)))) throw new NotFound("entry not found");
  return Response.json({ ok: true });
});

import { authed } from "@/lib/api";
import { deleteWeight, listWeights, setWeight } from "@/lib/repo";
import { date, jsonBody, num } from "@/lib/validate";

export const GET = authed(async (req, { db, user }) => {
  const since = date(new URL(req.url).searchParams.get("since"));
  return Response.json(await listWeights(db, user.id, since));
});

export const POST = authed(async (req, { db, user }) => {
  const b = await jsonBody(req);
  await setWeight(db, user.id, date(b.date), num(b.kg, "kg", { min: 20, max: 400 }));
  return Response.json({ ok: true });
});

export const DELETE = authed(async (req, { db, user }) => {
  await deleteWeight(db, user.id, date(new URL(req.url).searchParams.get("date")));
  return Response.json({ ok: true });
});

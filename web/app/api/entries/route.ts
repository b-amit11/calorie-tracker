import { authed } from "@/lib/api";
import { addEntry, getFood } from "@/lib/repo";
import { BadRequest, date, id, isMeal, jsonBody, num, NotFound } from "@/lib/validate";

// Body: { date, meal, foodId, grams, weighed?, clientId? }
export const POST = authed(async (req, { db, user }) => {
  const b = await jsonBody(req);
  if (!isMeal(b.meal)) throw new BadRequest("invalid meal");
  const entry = {
    date: date(b.date),
    meal: b.meal,
    foodId: id(b.foodId, "foodId"),
    grams: num(b.grams, "grams", { min: 0.1, max: 10_000 }),
    weighed: b.weighed === true,
    clientId: typeof b.clientId === "string" && /^[\w-]{8,64}$/.test(b.clientId) ? b.clientId : undefined,
  };
  // Validate everything before touching the database; only the owner's or shared foods may be logged.
  if (!(await getFood(db, user.id, entry.foodId))) throw new NotFound("food not found");
  const res = await addEntry(db, user.id, entry);
  return Response.json({ id: res.id }, { status: res.created ? 201 : 200 });
});

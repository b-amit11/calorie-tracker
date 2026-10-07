import { deleteWeight, listWeights, setWeight } from "@/lib/repo";
import { date, handle, num } from "@/lib/validate";

export function GET() {
  return Response.json(listWeights());
}

export const POST = handle(async (req: Request) => {
  const b = await req.json();
  setWeight(date(b.date), num(b.kg, "kg", { min: 20, max: 400 }));
  return Response.json({ ok: true });
});

export const DELETE = handle((req: Request) => {
  deleteWeight(date(new URL(req.url).searchParams.get("date")));
  return Response.json({ ok: true });
});

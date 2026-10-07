import { handle } from "@/lib/api";
import { clientKey, demoEnabled, startSession } from "@/lib/auth/routes";
import { createDemoUser } from "@/lib/auth/service";
import { rateLimit } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { seedDemoData } from "@/lib/demo";
import { date, jsonBody } from "@/lib/validate";

/** Creates a throwaway account pre-filled with sample data. Body: { today: "YYYY-MM-DD" } */
export const POST = handle(async (req: Request) => {
  if (!demoEnabled()) return Response.json({ error: "demo is disabled" }, { status: 403 });
  const db = await getDb();
  if (!(await rateLimit(db, `demo:${clientKey(req)}`, 10, 60 * 60_000))) {
    return Response.json({ error: "too many demo sessions, try again later" }, { status: 429 });
  }
  const today = date((await jsonBody(req)).today);
  const user = await createDemoUser(db);
  await seedDemoData(db, user.id, today);
  return startSession(user);
});

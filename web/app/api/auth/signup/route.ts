import { handle } from "@/lib/api";
import { clientKey, signupEnabled, startSession } from "@/lib/auth/routes";
import { signUp } from "@/lib/auth/service";
import { rateLimit } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { email, jsonBody, str } from "@/lib/validate";

export const POST = handle(async (req: Request) => {
  if (!signupEnabled()) return Response.json({ error: "sign-ups are closed" }, { status: 403 });
  const db = await getDb();
  if (!(await rateLimit(db, `signup:${clientKey(req)}`, 5, 60 * 60_000))) {
    return Response.json({ error: "too many sign-ups, try again later" }, { status: 429 });
  }
  const b = await jsonBody(req);
  const user = await signUp(db, email(b.email), str(b.password, "password", { max: 1000 })!);
  return startSession(user);
});

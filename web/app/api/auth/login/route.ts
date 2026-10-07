import { handle } from "@/lib/api";
import { clientKey, startSession } from "@/lib/auth/routes";
import { logIn, TooManyAttempts } from "@/lib/auth/service";
import { getDb } from "@/lib/db";
import { email, jsonBody, str } from "@/lib/validate";

export const POST = handle(async (req: Request) => {
  const b = await jsonBody(req);
  try {
    const user = await logIn(await getDb(), email(b.email), str(b.password, "password", { max: 1000 })!, clientKey(req));
    if (!user) return Response.json({ error: "wrong email or password" }, { status: 401 });
    return startSession(user);
  } catch (e) {
    if (e instanceof TooManyAttempts) return Response.json({ error: e.message }, { status: 429 });
    throw e;
  }
});

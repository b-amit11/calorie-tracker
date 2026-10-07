import { currentUser } from "@/lib/auth/session";
import { demoEnabled, signupEnabled } from "@/lib/auth/routes";
import { getDb } from "@/lib/db";

export async function GET() {
  const user = await currentUser(await getDb());
  return Response.json({ user, signupEnabled: signupEnabled(), demoEnabled: demoEnabled() });
}

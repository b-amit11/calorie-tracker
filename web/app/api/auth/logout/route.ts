import { cookies } from "next/headers";
import { clearSessionCookie, deleteSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  await clearSessionCookie();
  return Response.json({ ok: true });
}

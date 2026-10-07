import { getDb } from "../db";
import { createSession, setSessionCookie, type SessionUser } from "./session";

export const signupEnabled = () => process.env.ALLOW_SIGNUP !== "false";
export const demoEnabled = () => process.env.DEMO_ENABLED !== "false";

/** Best-effort client identifier for rate limiting (set by the hosting proxy, e.g. Vercel). */
export function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export async function startSession(user: SessionUser) {
  const { token, expiresAt } = await createSession(await getDb(), user.id);
  await setSessionCookie(token, expiresAt);
  return Response.json({ email: user.email, isDemo: user.isDemo });
}

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { DB } from "../db";
import { rateLimits, sessions, users } from "../db/schema";

export const SESSION_COOKIE = "session";
const SESSION_DAYS = 30;
const DAY = 86_400_000;

export type SessionUser = { id: string; email: string; isDemo: boolean };

export class Unauthorized extends Error {}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a session and returns the raw token (only the hash is stored). */
export async function createSession(db: DB, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/** Looks up a session token. Sessions are extended when less than half their lifetime remains. */
export async function validateSession(db: DB, token: string): Promise<SessionUser | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  if (row.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY) {
    await db.update(sessions).set({ expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) }).where(eq(sessions.id, id));
  }
  return { id: row.user.id, email: row.user.email, isDemo: row.user.isDemo };
}

export async function deleteSession(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteExpiredSessions(db: DB) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Current user from the request cookie, or null. */
export async function currentUser(db: DB): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? validateSession(db, token) : null;
}

export async function requireUser(db: DB): Promise<SessionUser> {
  const user = await currentUser(db);
  if (!user) throw new Unauthorized("Not signed in");
  return user;
}

/**
 * Fixed-window rate limit stored in the database, so it holds across serverless instances.
 * Returns true if the action is allowed.
 */
export async function rateLimit(db: DB, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: new Date(now.getTime() + windowMs) })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Start a new window if the old one has expired, otherwise count up.
        count: sql`CASE WHEN ${rateLimits.resetAt} < ${now.getTime()} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} < ${now.getTime()} THEN ${now.getTime() + windowMs} ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning({ count: rateLimits.count });
  return row.count <= max;
}

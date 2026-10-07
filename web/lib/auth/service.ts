import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { DB } from "../db";
import { users } from "../db/schema";
import { BadRequest } from "../validate";
import { dummyHash, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { rateLimit, type SessionUser } from "./session";

export async function signUp(db: DB, email: string, password: string): Promise<SessionUser> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new BadRequest(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (password.length > 256) throw new BadRequest("password is too long");
  const passwordHash = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({ id: randomUUID(), email, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!row) throw new BadRequest("an account with that email already exists");
  return { id: row.id, email: row.email, isDemo: false };
}

export class TooManyAttempts extends Error {}

/** Returns the user on success, null on bad credentials. Throws TooManyAttempts when rate limited. */
export async function logIn(db: DB, email: string, password: string, clientKey: string): Promise<SessionUser | null> {
  // Per-account and per-client limits: 10 attempts / 15 min.
  const window = 15 * 60_000;
  const okAccount = await rateLimit(db, `login:email:${email}`, 10, window);
  const okClient = await rateLimit(db, `login:client:${clientKey}`, 30, window);
  if (!okAccount || !okClient) throw new TooManyAttempts("too many attempts, try again later");

  const user = await db.query.users.findFirst({ where: and(eq(users.email, email), eq(users.isDemo, false)) });
  // Always run a hash so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  return user && ok ? { id: user.id, email: user.email, isDemo: false } : null;
}

/** Throwaway demo accounts expire after a day; cascading deletes clean up their data. */
export async function createDemoUser(db: DB): Promise<SessionUser> {
  await db.delete(users).where(and(eq(users.isDemo, true), lt(users.createdAt, new Date(Date.now() - 86_400_000))));
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: `demo-${id}@demo.invalid`,
    passwordHash: "!", // can't log in with a password
    isDemo: true,
  });
  return { id, email: "demo", isDemo: true };
}

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db";
import { entries, rateLimits, sessions, users } from "../db/schema";
import { seedDemoData } from "../demo";
import { BadRequest } from "../validate";
import { createDemoUser, logIn, signUp, TooManyAttempts } from "./service";
import { createSession, deleteSession, rateLimit, validateSession } from "./session";
import { createTestDb } from "@/test/helpers";

let db: DB;
beforeEach(async () => { db = await createTestDb(); });

describe("sign up and log in", () => {
  it("creates an account and logs in with the same password", async () => {
    const u = await signUp(db, "a@test.dev", "long enough");
    expect(await logIn(db, "a@test.dev", "long enough", "ip")).toEqual(u);
    expect(await logIn(db, "a@test.dev", "wrong password", "ip")).toBeNull();
    expect(await logIn(db, "nobody@test.dev", "long enough", "ip")).toBeNull();
  });

  it("rejects duplicate emails and short passwords", async () => {
    await signUp(db, "a@test.dev", "long enough");
    await expect(signUp(db, "a@test.dev", "long enough")).rejects.toThrow("already exists");
    await expect(signUp(db, "b@test.dev", "short")).rejects.toThrow(BadRequest);
  });

  it("locks an account after 10 attempts in the window", async () => {
    await signUp(db, "a@test.dev", "long enough");
    for (let i = 0; i < 10; i++) await logIn(db, "a@test.dev", "wrong password", `ip${i}`);
    await expect(logIn(db, "a@test.dev", "long enough", "fresh-ip")).rejects.toThrow(TooManyAttempts);
  });
});

describe("rateLimit", () => {
  it("allows up to max per window, then resets", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(db, "k", 3, 60_000));
    expect(results).toEqual([true, true, true, false]);
    await db.update(rateLimits).set({ resetAt: new Date(Date.now() - 1) }); // window expires
    expect(await rateLimit(db, "k", 3, 60_000)).toBe(true);
    expect(await rateLimit(db, "other", 3, 60_000)).toBe(true); // keys are independent
  });
});

describe("sessions", () => {
  it("validates tokens, stores only their hash, and can be revoked", async () => {
    const u = await signUp(db, "a@test.dev", "long enough");
    const { token } = await createSession(db, u.id);
    expect(await validateSession(db, token)).toEqual(u);
    expect(await db.query.sessions.findFirst({ where: eq(sessions.id, token) })).toBeUndefined();
    expect(await validateSession(db, `${token}x`)).toBeNull();
    await deleteSession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const u = await signUp(db, "a@test.dev", "long enough");
    const { token } = await createSession(db, u.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await validateSession(db, token)).toBeNull();
  });
});

describe("demo accounts", () => {
  it("seeds data and deletes demo accounts older than a day", async () => {
    const old = await createDemoUser(db);
    await seedDemoData(db, old.id, "2026-10-07");
    expect((await db.select().from(entries).where(eq(entries.userId, old.id))).length).toBeGreaterThan(50);
    await db.update(users).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(users.id, old.id));

    await createDemoUser(db);
    expect(await db.query.users.findFirst({ where: eq(users.id, old.id) })).toBeUndefined();
    expect(await db.select().from(entries).where(eq(entries.userId, old.id))).toEqual([]); // cascaded
  });

  it("can't be logged into with a password", async () => {
    const demo = await createDemoUser(db);
    const row = await db.query.users.findFirst({ where: eq(users.id, demo.id) });
    expect(await logIn(db, row!.email, "!", "ip")).toBeNull();
  });
});

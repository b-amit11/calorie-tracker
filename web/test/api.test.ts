import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/lib/db";
import { createTestDb } from "./helpers";

// Route handlers read cookies through next/headers and the DB through getDb();
// swap both for in-memory versions so the real handlers run end to end.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

let db: DB;
vi.mock("@/lib/db", async (orig) => ({
  ...(await orig<typeof import("@/lib/db")>()),
  getDb: async () => db,
}));

const { POST: signup } = await import("@/app/api/auth/signup/route");
const { POST: logout } = await import("@/app/api/auth/logout/route");
const { POST: addEntry } = await import("@/app/api/entries/route");
const { PATCH: patchEntry, DELETE: deleteEntry } = await import("@/app/api/entries/[id]/route");
const { POST: createFood } = await import("@/app/api/foods/route");
const { GET: getDay } = await import("@/app/api/day/route");
const { GET: getGoals, PUT: putGoals } = await import("@/app/api/goals/route");

const req = (url: string, init?: { method?: string; json?: unknown }) =>
  new Request(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
const params = <T>(p: T) => ({ params: Promise.resolve(p) });

async function signUpAs(email: string) {
  jar.clear();
  const res = await signup(req("/api/auth/signup", { method: "POST", json: { email, password: "long enough" } }));
  expect(res.status).toBe(200);
  return jar.get("session")!;
}

beforeEach(async () => {
  db = await createTestDb();
  jar.clear();
});

describe("API", () => {
  it("requires a session", async () => {
    const res = await getGoals(req("/api/goals"), params({}));
    expect(res.status).toBe(401);
  });

  it("logs food and returns the day's totals", async () => {
    await signUpAs("a@test.dev");
    const food = await (await createFood(req("/api/foods", { method: "POST", json: { name: "Toast", kcal: 250, protein: 9 } }), params({}))).json();

    const created = await addEntry(req("/api/entries", {
      method: "POST", json: { date: "2026-10-07", meal: "breakfast", foodId: food.id, grams: 40, weighed: true },
    }), params({}));
    expect(created.status).toBe(201);

    const day = await (await getDay(req("/api/day?date=2026-10-07"), params({}))).json();
    expect(day.entries).toHaveLength(1);
    expect(day.totals.kcal).toBe(100);
    expect(day.goals.kcal).toBe(2000);
  });

  it("validates input with 400s", async () => {
    await signUpAs("a@test.dev");
    const bad = [
      { date: "2026-10-07", meal: "brunch", foodId: 1, grams: 10 },
      { date: "yesterday", meal: "lunch", foodId: 1, grams: 10 },
      { date: "2026-10-07", meal: "lunch", foodId: 1, grams: -5 },
      { date: "2026-10-07", meal: "lunch", foodId: "x", grams: 10 },
    ];
    for (const json of bad) {
      expect((await addEntry(req("/api/entries", { method: "POST", json }), params({}))).status).toBe(400);
    }
    expect((await putGoals(req("/api/goals", { method: "PUT", json: { kcal: 10, protein: 1, carbs: 1, fat: 1 } }), params({}))).status).toBe(400);
  });

  it("hides other users' entries behind 404s", async () => {
    await signUpAs("a@test.dev");
    const food = await (await createFood(req("/api/foods", { method: "POST", json: { name: "Toast", kcal: 250 } }), params({}))).json();
    const { id } = await (await addEntry(req("/api/entries", {
      method: "POST", json: { date: "2026-10-07", meal: "lunch", foodId: food.id, grams: 40 },
    }), params({}))).json();

    await signUpAs("b@test.dev");
    expect((await patchEntry(req(`/api/entries/${id}`, { method: "PATCH", json: { grams: 1 } }), params({ id: String(id) }))).status).toBe(404);
    expect((await deleteEntry(req(`/api/entries/${id}`, { method: "DELETE" }), params({ id: String(id) }))).status).toBe(404);
    // b can't log a's custom food either
    expect((await addEntry(req("/api/entries", {
      method: "POST", json: { date: "2026-10-07", meal: "lunch", foodId: food.id, grams: 40 },
    }), params({}))).status).toBe(404);
  });

  it("logout revokes the session server-side", async () => {
    const token = await signUpAs("a@test.dev");
    await logout();
    jar.set("session", token); // replay the old cookie
    expect((await getGoals(req("/api/goals"), params({}))).status).toBe(401);
  });
});

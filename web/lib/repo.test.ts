import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "./db";
import {
  addEntry, cacheCatalogFoods, createCustomFood, dailyTotals, deleteEntry, entriesForDate, findByBarcode,
  getFood, getGoals, listWeights, recentFoods, searchMyFoods, setGoals, setWeight, updateEntry,
} from "./repo";
import { DEFAULT_GOALS } from "./types";
import { createTestDb, food, makeUser } from "@/test/helpers";

let db: DB;
let alice: string;
let bob: string;

beforeEach(async () => {
  db = await createTestDb();
  alice = await makeUser(db);
  bob = await makeUser(db);
});

const D = "2026-10-07";

describe("food catalog", () => {
  it("caches remote foods once per source id and refreshes their data", async () => {
    const [a] = await cacheCatalogFoods(db, [food({ sourceId: "1", kcal: 100 })]);
    const [b] = await cacheCatalogFoods(db, [food({ sourceId: "1", kcal: 120 })]);
    expect(b.id).toBe(a.id);
    expect(b.kcal).toBe(120);
    expect(b.custom).toBe(false);
  });

  it("keeps custom foods private to their owner", async () => {
    const mine = await createCustomFood(db, alice, { ...food(), name: "Grandma's stew" });
    expect(mine.custom).toBe(true);
    expect(await getFood(db, alice, mine.id)).not.toBeNull();
    expect(await getFood(db, bob, mine.id)).toBeNull();
    expect(await searchMyFoods(db, bob, "stew")).toEqual([]);
  });

  it("finds barcodes in the shared catalog but not in other users' foods", async () => {
    await cacheCatalogFoods(db, [food({ source: "off", sourceId: "123", barcode: "123" })]);
    expect(await findByBarcode(db, bob, "123")).not.toBeNull();
    expect(await findByBarcode(db, bob, "999")).toBeNull();
  });
});

describe("searchMyFoods", () => {
  it("returns custom foods and catalog foods the user has logged, most used first", async () => {
    const [oats, rice, unused] = await cacheCatalogFoods(db, [
      food({ name: "Oats, rolled" }), food({ name: "Rice, oat-fed" }), food({ name: "Oat milk" }),
    ]);
    await addEntry(db, alice, { date: D, meal: "breakfast", foodId: oats.id, grams: 50, weighed: false });
    for (let i = 0; i < 3; i++) await addEntry(db, alice, { date: D, meal: "lunch", foodId: rice.id, grams: 50, weighed: false });
    const results = await searchMyFoods(db, alice, "oat");
    expect(results.map((f) => f.id)).toEqual([rice.id, oats.id]);
    expect(results.find((f) => f.id === unused.id)).toBeUndefined();
  });

  it("treats LIKE wildcards in the query literally", async () => {
    await createCustomFood(db, alice, { ...food(), name: "100% juice" });
    await createCustomFood(db, alice, { ...food(), name: "Apple" });
    expect((await searchMyFoods(db, alice, "%")).map((f) => f.name)).toEqual(["100% juice"]);
    expect(await searchMyFoods(db, alice, "_")).toEqual([]);
  });
});

describe("entries", () => {
  it("computes per-entry totals from grams", async () => {
    const [f] = await cacheCatalogFoods(db, [food({ kcal: 200 })]);
    await addEntry(db, alice, { date: D, meal: "dinner", foodId: f.id, grams: 150, weighed: true });
    const [e] = await entriesForDate(db, alice, D);
    expect(e.totals.kcal).toBe(300);
    expect(e.weighed).toBe(true);
  });

  it("is idempotent on clientId (offline retries)", async () => {
    const [f] = await cacheCatalogFoods(db, [food()]);
    const e = { date: D, meal: "lunch" as const, foodId: f.id, grams: 80, weighed: false, clientId: "offline-1" };
    const first = await addEntry(db, alice, e);
    const retry = await addEntry(db, alice, e);
    expect(first.created).toBe(true);
    expect(retry).toEqual({ id: first.id, created: false });
    expect(await entriesForDate(db, alice, D)).toHaveLength(1);
    // Another user may reuse the same clientId.
    expect((await addEntry(db, bob, e)).created).toBe(true);
  });

  it("only lets the owner update or delete an entry", async () => {
    const [f] = await cacheCatalogFoods(db, [food()]);
    const { id } = await addEntry(db, alice, { date: D, meal: "lunch", foodId: f.id, grams: 80, weighed: false });
    expect(await updateEntry(db, bob, id, { grams: 1 })).toBe(false);
    expect(await deleteEntry(db, bob, id)).toBe(false);
    expect(await updateEntry(db, alice, id, { grams: 90, meal: "dinner" })).toBe(true);
    expect((await entriesForDate(db, alice, D))[0]).toMatchObject({ grams: 90, meal: "dinner" });
    expect(await deleteEntry(db, alice, id)).toBe(true);
    expect(await entriesForDate(db, alice, D)).toEqual([]);
  });

  it("lists recent foods with the last amount used", async () => {
    const [a, b] = await cacheCatalogFoods(db, [food({ name: "A" }), food({ name: "B" })]);
    await addEntry(db, alice, { date: D, meal: "lunch", foodId: a.id, grams: 10, weighed: false });
    await addEntry(db, alice, { date: D, meal: "lunch", foodId: b.id, grams: 20, weighed: false });
    await addEntry(db, alice, { date: D, meal: "lunch", foodId: a.id, grams: 30, weighed: false });
    expect((await recentFoods(db, alice)).map((f) => [f.name, f.lastGrams])).toEqual([["A", 30], ["B", 20]]);
    expect(await recentFoods(db, bob)).toEqual([]);
  });

  it("sums daily calories per user", async () => {
    const [f] = await cacheCatalogFoods(db, [food({ kcal: 100 })]);
    await addEntry(db, alice, { date: "2026-10-05", meal: "lunch", foodId: f.id, grams: 200, weighed: false });
    await addEntry(db, alice, { date: D, meal: "lunch", foodId: f.id, grams: 50, weighed: false });
    await addEntry(db, alice, { date: D, meal: "dinner", foodId: f.id, grams: 50, weighed: false });
    await addEntry(db, bob, { date: D, meal: "dinner", foodId: f.id, grams: 999, weighed: false });
    expect(await dailyTotals(db, alice, "2026-10-01")).toEqual([
      { date: "2026-10-05", kcal: 200 },
      { date: D, kcal: 100 },
    ]);
    expect(await dailyTotals(db, alice, "2026-10-06")).toHaveLength(1);
  });
});

describe("goals and weights", () => {
  it("defaults goals and upserts them", async () => {
    expect(await getGoals(db, alice)).toEqual(DEFAULT_GOALS);
    await setGoals(db, alice, { kcal: 1800, protein: 150, carbs: 150, fat: 60 });
    await setGoals(db, alice, { kcal: 1900, protein: 150, carbs: 160, fat: 60 });
    expect((await getGoals(db, alice)).kcal).toBe(1900);
    expect(await getGoals(db, bob)).toEqual(DEFAULT_GOALS);
  });

  it("keeps one weight per day", async () => {
    await setWeight(db, alice, D, 72.4);
    await setWeight(db, alice, D, 72.1);
    await setWeight(db, alice, "2026-01-01", 75);
    expect(await listWeights(db, alice, "2026-06-01")).toEqual([{ date: D, kg: 72.1 }]);
  });
});

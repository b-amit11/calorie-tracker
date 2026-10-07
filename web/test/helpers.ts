import { randomUUID } from "node:crypto";
import { createTestDb, type DB } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { NewFood } from "@/lib/types";

export { createTestDb };

export async function makeUser(db: DB, email = `${randomUUID()}@test.dev`) {
  const id = randomUUID();
  await db.insert(users).values({ id, email, passwordHash: "!" });
  return id;
}

export const food = (over: Partial<NewFood> = {}): NewFood => ({
  name: "Oats",
  brand: null,
  barcode: null,
  source: "usda",
  sourceId: randomUUID(),
  kcal: 379,
  protein: 13,
  carbs: 68,
  fat: 6.5,
  fiber: 10,
  ...over,
});

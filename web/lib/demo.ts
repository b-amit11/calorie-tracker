import type { DB } from "./db";
import { addEntry, createCustomFood, setGoals, setWeight } from "./repo";
import { shiftDate, type Meal } from "./types";

const FOODS = [
  { name: "Rolled oats", kcal: 379, protein: 13.2, carbs: 67.7, fat: 6.5, fiber: 10.1 },
  { name: "Greek yogurt, nonfat", kcal: 59, protein: 10.3, carbs: 3.6, fat: 0.4, fiber: 0 },
  { name: "Banana", kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6 },
  { name: "Chicken breast, cooked", kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
  { name: "White rice, cooked", kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4 },
  { name: "Broccoli, steamed", kcal: 35, protein: 2.4, carbs: 7.2, fat: 0.4, fiber: 3.3 },
  { name: "Almonds", kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9, fiber: 12.5 },
  { name: "Salmon, baked", kcal: 206, protein: 22.1, carbs: 0, fat: 12.4, fiber: 0 },
  { name: "Sweet potato, baked", kcal: 90, protein: 2, carbs: 20.7, fat: 0.2, fiber: 3.3 },
  { name: "Dark chocolate 70%", kcal: 598, protein: 7.8, carbs: 45.9, fat: 42.6, fiber: 10.9 },
];

// [food index, meal, grams, weighed on trackpad]
const DAY_PLANS: [number, Meal, number, boolean][][] = [
  [[0, "breakfast", 60, false], [1, "breakfast", 170, false], [2, "breakfast", 118, true], [3, "lunch", 150, false], [4, "lunch", 180, false], [5, "lunch", 90, true], [6, "snacks", 28, true], [7, "dinner", 140, false], [8, "dinner", 200, false]],
  [[0, "breakfast", 50, false], [2, "breakfast", 110, true], [3, "lunch", 170, false], [4, "lunch", 200, false], [9, "snacks", 20, true], [7, "dinner", 160, false], [5, "dinner", 120, false]],
  [[1, "breakfast", 200, false], [6, "breakfast", 15, true], [3, "lunch", 140, false], [8, "lunch", 180, false], [2, "snacks", 120, true], [7, "dinner", 150, false], [4, "dinner", 150, false]],
];

/** Fills a fresh demo account with two weeks of plausible data, ending on `today`. */
export async function seedDemoData(db: DB, userId: string, today: string) {
  await setGoals(db, userId, { kcal: 2100, protein: 140, carbs: 220, fat: 70 });
  const foods = [];
  for (const f of FOODS) foods.push(await createCustomFood(db, userId, { ...f, brand: null, barcode: null }));

  for (let i = 13; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const plan = DAY_PLANS[i % DAY_PLANS.length];
    // Today only has breakfast and lunch logged so far.
    for (const [fi, meal, grams, weighed] of i === 0 ? plan.filter(([, m]) => m === "breakfast" || m === "lunch") : plan) {
      // Weighed snacks stay small; scale the rest up to realistic ~2,000 kcal days.
      const g = weighed ? grams : Math.round((grams * 1.4) / 5) * 5;
      await addEntry(db, userId, { date, meal, foodId: foods[fi].id, grams: g, weighed });
    }
    if (i % 2 === 0) await setWeight(db, userId, date, Math.round((74.2 - (13 - i) * 0.08 + ((i * 7) % 5) * 0.06) * 10) / 10);
  }
}

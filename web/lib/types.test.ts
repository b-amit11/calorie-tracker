import { describe, expect, it } from "vitest";
import { macroKcal, scale, shiftDate, sum } from "./types";

describe("scale", () => {
  it("converts per-100 g values to a portion", () => {
    expect(scale({ kcal: 200, protein: 10, carbs: 20, fat: 5, fiber: 2 }, 150)).toEqual({
      kcal: 300, protein: 15, carbs: 30, fat: 7.5, fiber: 3,
    });
  });

  it("returns zeros for 0 g", () => {
    expect(scale({ kcal: 200, protein: 10, carbs: 20, fat: 5, fiber: 2 }, 0).kcal).toBe(0);
  });
});

describe("sum", () => {
  it("adds nutrition and handles an empty list", () => {
    const a = { kcal: 100, protein: 1, carbs: 2, fat: 3, fiber: 4 };
    expect(sum([a, a]).kcal).toBe(200);
    expect(sum([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });
});

describe("shiftDate", () => {
  it.each([
    ["2026-10-07", 1, "2026-10-08"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2028-02-28", 1, "2028-02-29"], // leap year
    ["2026-03-08", 1, "2026-03-09"], // US DST change doesn't matter
    ["2026-10-07", -29, "2026-09-08"],
  ])("%s %+d days = %s", (from, days, to) => {
    expect(shiftDate(from, days)).toBe(to);
  });
});

it("macroKcal uses 4/4/9", () => {
  expect(macroKcal({ protein: 100, carbs: 200, fat: 50 })).toBe(400 + 800 + 450);
});

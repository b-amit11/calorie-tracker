import { afterEach, describe, expect, it, vi } from "vitest";
import { parseOffProduct, parseUsdaFood, rankByRelevance, searchUsda } from "./food-sources";

describe("parseOffProduct", () => {
  it("maps nutriments per 100 g", () => {
    expect(parseOffProduct({
      code: "3017624010701",
      product_name: " Nutella ",
      brands: "Ferrero, Nutella",
      nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
    })).toEqual({
      name: "Nutella", brand: "Ferrero", barcode: "3017624010701", source: "off", sourceId: "3017624010701",
      kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0,
    });
  });

  it("falls back to kJ when kcal is missing", () => {
    const f = parseOffProduct({ code: "1", product_name: "X", nutriments: { energy_100g: 418.4 } });
    expect(f?.kcal).toBe(100);
  });

  it.each([
    [{ code: "1", nutriments: { "energy-kcal_100g": 1 } }],
    [{ code: "1", product_name: "X", nutriments: {} }],
    [{ code: "1", product_name: "X", nutriments: { "energy-kcal_100g": 5000 } }],
    [{ product_name: "X", nutriments: { "energy-kcal_100g": 5 } }],
  ])("rejects incomplete or implausible products", (p) => {
    expect(parseOffProduct(p)).toBeNull();
  });
});

describe("parseUsdaFood", () => {
  const usda = (nutrients: [number, number][]) => ({
    fdcId: 173944,
    description: "Bananas, raw",
    foodNutrients: nutrients.map(([nutrientId, value]) => ({ nutrientId, value })),
  });

  it("reads energy, macros and fiber by nutrient id", () => {
    expect(parseUsdaFood(usda([[1008, 89], [1003, 1.09], [1005, 22.84], [1004, 0.33], [1079, 2.6]]))).toMatchObject({
      name: "Bananas, raw", source: "usda", sourceId: "173944", kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6,
    });
  });

  it("uses Atwater energy when 1008 is absent (Foundation foods)", () => {
    expect(parseUsdaFood(usda([[2047, 97]]))?.kcal).toBe(97);
  });

  it("skips foods without energy", () => {
    expect(parseUsdaFood(usda([[1003, 5]]))).toBeNull();
  });
});

describe("rankByRelevance", () => {
  const names = (q: string, list: string[]) => rankByRelevance(q, list.map((name) => ({ name }))).map((f) => f.name);

  it("puts the generic food above things that merely mention it", () => {
    expect(names("oats", ["Oil, oat", "Cereals, oats, instant", "Oats"])).toEqual(["Oats", "Oil, oat", "Cereals, oats, instant"]);
  });

  it("matches plural queries against singular names", () => {
    expect(names("bananas", ["Plantains", "Banana chips", "Banana"])[0]).toBe("Banana");
  });

  it("keeps original order for ties and handles regex characters", () => {
    expect(names("c++", ["b", "a"])).toEqual(["b", "a"]);
  });
});

describe("searchUsda", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns ranked results and survives a bad response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      foods: [
        { fdcId: 1, description: "Oil, oat", foodNutrients: [{ nutrientId: 1008, value: 884 }] },
        { fdcId: 2, description: "Oats", foodNutrients: [{ nutrientId: 1008, value: 379 }] },
        { fdcId: 3, description: "No energy", foodNutrients: [] },
      ],
    })));
    expect((await searchUsda("oats")).map((f) => f.name)).toEqual(["Oats", "Oil, oat"]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    expect(await searchUsda("oats")).toEqual([]);
  });
});

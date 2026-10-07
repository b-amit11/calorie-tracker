import { describe, expect, it } from "vitest";
import { BadRequest, date, email, id, isDate, isMeal, jsonBody, num, str } from "./validate";

describe("num", () => {
  it("accepts numbers and numeric strings in range", () => {
    expect(num(5, "x")).toBe(5);
    expect(num("2.5", "x")).toBe(2.5);
  });

  it.each([NaN, Infinity, -1, 100_001, "", "abc", null, undefined, {}])("rejects %s", (v) => {
    expect(() => num(v, "x")).toThrow(BadRequest);
  });

  it("respects custom bounds", () => {
    expect(() => num(0, "grams", { min: 0.1 })).toThrow("invalid grams");
  });
});

it("id requires a positive integer", () => {
  expect(id("12")).toBe(12);
  expect(() => id("1.5")).toThrow(BadRequest);
  expect(() => id(0)).toThrow(BadRequest);
});

describe("date", () => {
  it("accepts real calendar dates only", () => {
    expect(date("2026-10-07")).toBe("2026-10-07");
    expect(isDate("2026-13-01")).toBe(false);
    expect(isDate("2026-1-1")).toBe(false);
    expect(isDate("yesterday")).toBe(false);
  });
});

it("isMeal", () => {
  expect(isMeal("lunch")).toBe(true);
  expect(isMeal("brunch")).toBe(false);
});

describe("str / email", () => {
  it("trims and truncates", () => {
    expect(str("  hi  ", "n")).toBe("hi");
    expect(str("x".repeat(500), "n", { max: 10 })).toHaveLength(10);
    expect(str("", "n", { optional: true })).toBeNull();
    expect(() => str("", "n")).toThrow("n is required");
    expect(() => str(42, "n")).toThrow(BadRequest);
  });

  it("normalizes emails", () => {
    expect(email(" Me@Example.COM ")).toBe("me@example.com");
    expect(() => email("not-an-email")).toThrow(BadRequest);
  });
});

describe("jsonBody", () => {
  const req = (body: string) => new Request("http://x", { method: "POST", body });
  it("parses objects", async () => {
    expect(await jsonBody(req('{"a":1}'))).toEqual({ a: 1 });
  });
  it.each(["nope", "[1,2]", "null", "3"])("rejects %s", async (body) => {
    await expect(jsonBody(req(body))).rejects.toThrow(BadRequest);
  });
});

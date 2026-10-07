import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^scrypt\$\d+\$8\$1\$/);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("treats unicode-equivalent passwords as equal (NFKC)", async () => {
    const h = await hashPassword("café");
    expect(await verifyPassword("café", h)).toBe(true);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "!")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$whatever")).toBe(false);
  });
});

import { MEALS, type Meal } from "./types";

export class BadRequest extends Error {}
export class NotFound extends Error {}

export const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(`${s}T00:00:00Z`));
export const isMeal = (s: unknown): s is Meal => MEALS.includes(s as Meal);

export function num(v: unknown, name: string, { min = 0, max = 100_000 } = {}): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !isFinite(n) || n < min || n > max) throw new BadRequest(`invalid ${name}`);
  return n;
}

export const id = (v: unknown, name = "id") => {
  const n = num(v, name, { min: 1, max: Number.MAX_SAFE_INTEGER });
  if (!Number.isInteger(n)) throw new BadRequest(`invalid ${name}`);
  return n;
};

export function date(v: unknown): string {
  if (!isDate(v)) throw new BadRequest("invalid date (YYYY-MM-DD)");
  return v;
}

export function str(v: unknown, name: string, { max = 200, optional = false } = {}): string | null {
  if (v == null || (typeof v === "string" && v.trim() === "")) {
    if (optional) return null;
    throw new BadRequest(`${name} is required`);
  }
  if (typeof v !== "string") throw new BadRequest(`invalid ${name}`);
  return v.trim().slice(0, max);
}

export function email(v: unknown): string {
  const s = str(v, "email", { max: 254 })!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new BadRequest("invalid email");
  return s;
}

/** Parse a JSON object body, rejecting anything else. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  let b: unknown;
  try { b = await req.json(); } catch { throw new BadRequest("invalid JSON"); }
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new BadRequest("expected a JSON object");
  return b as Record<string, unknown>;
}

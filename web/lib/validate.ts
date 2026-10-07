import { MEALS, type Meal } from "./types";

export class BadRequest extends Error {}

export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isMeal = (s: unknown): s is Meal => MEALS.includes(s as Meal);

export function num(v: unknown, name: string, { min = 0, max = 100_000 } = {}): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !isFinite(n) || n < min || n > max) throw new BadRequest(`invalid ${name}`);
  return n;
}

export function date(v: unknown): string {
  if (!isDate(v)) throw new BadRequest("invalid date (YYYY-MM-DD)");
  return v;
}

/** Wrap a handler so validation errors become 400s. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof BadRequest || e instanceof SyntaxError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  };
}

import { getDb, type DB } from "./db";
import { requireUser, Unauthorized, type SessionUser } from "./auth/session";
import { BadRequest, NotFound } from "./validate";

/** Turn known errors into JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
      if (e instanceof Unauthorized) return Response.json({ error: e.message }, { status: 401 });
      if (e instanceof NotFound) return Response.json({ error: e.message || "not found" }, { status: 404 });
      throw e;
    }
  };
}

type Ctx = { db: DB; user: SessionUser };

/** Route handler that requires a signed-in user. */
export function authed<P = unknown>(fn: (req: Request, ctx: Ctx, route: { params: Promise<P> }) => Promise<Response> | Response) {
  return handle(async (req: Request, route: { params: Promise<P> }) => {
    const db = await getDb();
    const user = await requireUser(db);
    return fn(req, { db, user }, route);
  });
}

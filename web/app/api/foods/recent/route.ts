import { authed } from "@/lib/api";
import { recentFoods } from "@/lib/repo";

export const GET = authed(async (_req, { db, user }) => Response.json(await recentFoods(db, user.id)));

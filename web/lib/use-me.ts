"use client";

import { useEffect, useState } from "react";
import { api } from "./client";
import type { SessionUser } from "./auth/session";

let cached: Promise<SessionUser | null> | null = null;

/** The signed-in user (fetched once per page load). */
export function useMe() {
  const [me, setMe] = useState<SessionUser | null>(null);
  useEffect(() => {
    (cached ??= api<{ user: SessionUser | null }>("/api/auth/me").then((r) => r.user).catch(() => null)).then(setMe);
  }, []);
  return me;
}

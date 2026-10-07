"use client";

import type { Food, Meal } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** fetch + JSON with consistent errors. A 401 sends the user to the login page. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

// ---------------------------------------------------------------------------
// Offline queue: entries logged without a connection are kept in localStorage
// and replayed later. Each has a clientId so a retry can never double-log.

export type PendingEntry = { clientId: string; date: string; meal: Meal; grams: number; weighed: boolean; food: Food };

const QUEUE_KEY = "pending-entries";
const listeners = new Set<() => void>();

function read(): PendingEntry[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"); } catch { return []; }
}
function write(list: PendingEntry[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

export const pendingEntries = read;
export function onQueueChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Log an entry, queueing it if the network is unavailable. Returns "saved" or "queued". */
export async function logEntry(e: Omit<PendingEntry, "clientId">): Promise<"saved" | "queued"> {
  const item: PendingEntry = { ...e, clientId: crypto.randomUUID() };
  try {
    await postEntry(item);
    return "saved";
  } catch (err) {
    if (err instanceof ApiError) throw err; // the server rejected it: don't retry
    write([...read(), item]);
    return "queued";
  }
}

const postEntry = (p: PendingEntry) =>
  api("/api/entries", {
    method: "POST",
    json: { date: p.date, meal: p.meal, foodId: p.food.id, grams: p.grams, weighed: p.weighed, clientId: p.clientId },
  });

let flushing: Promise<number> | null = null;

/** Replay queued entries. Returns how many were sent. */
export function flushQueue(): Promise<number> {
  return (flushing ??= (async () => {
    let sent = 0;
    for (const p of read()) {
      try {
        await postEntry(p);
        sent++;
      } catch (err) {
        // Offline, signed out or server trouble: keep it and try again later.
        if (!(err instanceof ApiError) || err.status === 401 || err.status >= 500) break;
        // Otherwise it was rejected (e.g. invalid data): drop it rather than retrying forever.
      }
      write(read().filter((x) => x.clientId !== p.clientId));
    }
    return sent;
  })().finally(() => { flushing = null; }));
}

export function clearQueue() { write([]); }

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AddFoodSheet } from "@/components/AddFoodSheet";
import { Sheet } from "@/components/Sheet";
import { api, flushQueue, onQueueChange, pendingEntries, type PendingEntry } from "@/lib/client";
import { MEALS, scale, shiftDate, sum, todayISO, type Entry, type Goals, type Meal, type Nutrition } from "@/lib/types";

type Day = { date: string; entries: Entry[]; totals: Nutrition; goals: Goals };

const fmt = (n: number) => Math.round(n).toLocaleString();

const NO_PENDING: PendingEntry[] = [];
let pendingSnapshot: PendingEntry[] = NO_PENDING;
let pendingJson = "[]";
/** Stable snapshot of the offline queue for useSyncExternalStore. */
function getPending() {
  const list = pendingEntries();
  const json = JSON.stringify(list);
  if (json !== pendingJson) { pendingJson = json; pendingSnapshot = list; }
  return pendingSnapshot;
}

function dateLabel(iso: string) {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === shiftDate(today, -1)) return "Yesterday";
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function Diary() {
  const [date, setDate] = useState(todayISO);
  const [day, setDay] = useState<Day | null>(null);
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const allPending = useSyncExternalStore(onQueueChange, getPending, () => NO_PENDING);
  const pending = allPending.filter((p) => p.date === date);

  const load = useCallback(async () => {
    try { setDay(await api<Day>(`/api/day?date=${date}`)); } catch { /* offline: keep what we have */ }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Send anything logged offline as soon as we're back online.
  useEffect(() => {
    const sync = () => flushQueue().then((n) => { if (n) { setToast(`Synced ${n} offline ${n === 1 ? "entry" : "entries"}`); load(); } });
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const totals = day ? sum([day.totals, ...pending.map((p) => scale(p.food, p.grams))]) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setDate(shiftDate(date, -1))} className="px-3 py-1 text-xl" aria-label="Previous day">‹</button>
        <button type="button" onClick={() => setDate(todayISO())} className="text-lg font-semibold">{dateLabel(date)}</button>
        <button type="button" onClick={() => setDate(shiftDate(date, 1))} className="px-3 py-1 text-xl" aria-label="Next day">›</button>
      </div>

      {day && totals && <Summary totals={totals} goals={day.goals} />}

      {MEALS.map((meal) => {
        const entries = day?.entries.filter((e) => e.meal === meal) ?? [];
        const queued = pending.filter((p) => p.meal === meal);
        const kcal = sum([...entries.map((e) => e.totals), ...queued.map((p) => scale(p.food, p.grams))]).kcal;
        return (
          <section key={meal} className="rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <header className="flex items-center justify-between px-4 pt-3">
              <h2 className="font-semibold capitalize">{meal}</h2>
              <span className="text-sm tabular-nums text-zinc-500">{fmt(kcal)} kcal</span>
            </header>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900 px-4">
              {entries.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => setEditing(e)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
                    <span className="min-w-0">
                      <span className="block truncate">{e.food.name}</span>
                      <span className="text-xs text-zinc-500">
                        {fmt(e.grams)} g{e.weighed && " · weighed"}{e.food.brand && ` · ${e.food.brand}`}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{fmt(e.totals.kcal)}</span>
                  </button>
                </li>
              ))}
              {queued.map((p) => (
                <li key={p.clientId} className="flex items-center justify-between gap-3 py-2.5 opacity-60">
                  <span className="min-w-0">
                    <span className="block truncate">{p.food.name}</span>
                    <span className="text-xs text-amber-600">{fmt(p.grams)} g · waiting to sync</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{fmt(scale(p.food, p.grams).kcal)}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setAdding(meal)} className="w-full px-4 py-3 text-left text-sm font-medium text-emerald-600">
              + Add food
            </button>
          </section>
        );
      })}

      {adding && (
        <AddFoodSheet
          date={date}
          meal={adding}
          onClose={() => setAdding(null)}
          onAdded={(result) => {
            setAdding(null);
            if (result === "queued") setToast("You're offline. Saved on this device and will sync later.");
            load();
          }}
        />
      )}
      {editing && (
        <EditEntrySheet entry={editing} onClose={() => setEditing(null)} onChanged={() => { setEditing(null); load(); }} />
      )}
      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-md rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      )}
    </div>
  );
}

function Summary({ totals, goals }: { totals: Nutrition; goals: Goals }) {
  const remaining = goals.kcal - totals.kcal;
  const pct = Math.min(100, (totals.kcal / goals.kcal) * 100);
  return (
    <div className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-900">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{fmt(Math.abs(remaining))}</div>
          <div className="text-sm text-zinc-500">{remaining >= 0 ? "kcal remaining" : "kcal over"}</div>
        </div>
        <div className="text-right text-sm tabular-nums text-zinc-500">
          {fmt(totals.kcal)} eaten<br />{fmt(goals.kcal)} goal
        </div>
      </div>
      <Bar pct={pct} over={remaining < 0} />
      <div className="mt-4 grid grid-cols-3 gap-3">
        {(["protein", "carbs", "fat"] as const).map((k) => (
          <div key={k}>
            <div className="flex justify-between text-xs">
              <span className="capitalize text-zinc-500">{k}</span>
              <span className="tabular-nums">{fmt(totals[k])}/{fmt(goals[k])}g</span>
            </div>
            <Bar pct={Math.min(100, (totals[k] / goals[k]) * 100)} over={totals[k] > goals[k] * 1.1} thin />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ pct, over, thin }: { pct: number; over?: boolean; thin?: boolean }) {
  return (
    <div className={`mt-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 ${thin ? "h-1.5" : "h-2.5"}`}>
      <div className={`h-full rounded-full ${over ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EditEntrySheet({ entry, onClose, onChanged }: { entry: Entry; onClose: () => void; onChanged: () => void }) {
  const [grams, setGrams] = useState(String(entry.grams));
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [error, setError] = useState<string | null>(null);
  const g = Number(grams);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); onChanged(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <Sheet title={entry.food.name} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (g > 0) run(() => api(`/api/entries/${entry.id}`, { method: "PATCH", json: { grams: g, meal } }));
        }}
      >
        <label className="flex items-center gap-3">
          <span className="w-16 text-sm text-zinc-500">Amount</span>
          <input
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="w-28 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-right tabular-nums dark:border-zinc-700"
          />
          <span className="text-sm text-zinc-500">g · {fmt(g > 0 ? (entry.food.kcal * g) / 100 : 0)} kcal</span>
        </label>
        <label className="flex items-center gap-3">
          <span className="w-16 text-sm text-zinc-500">Meal</span>
          <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)} className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 capitalize dark:border-zinc-700">
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => run(() => api(`/api/entries/${entry.id}`, { method: "DELETE" }))}
            className="rounded-xl border border-red-300 px-4 py-3 font-medium text-red-600 dark:border-red-900"
          >
            Delete
          </button>
          <button disabled={!(g > 0)} className="flex-1 rounded-xl bg-emerald-600 py-3 font-medium text-white disabled:opacity-40">
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}

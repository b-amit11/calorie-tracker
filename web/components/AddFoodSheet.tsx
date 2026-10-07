"use client";

import { useEffect, useState } from "react";
import { api, ApiError, logEntry } from "@/lib/client";
import { scale, type Food, type Meal } from "@/lib/types";
import { BarcodeScanner } from "./BarcodeScanner";
import { WeighPanel } from "./WeighPanel";
import { Sheet } from "./Sheet";

type Results = { mine: Food[]; usda: Food[]; off: Food[] };
type Recent = Food & { lastGrams: number };

const fmt = (n: number) => Math.round(n).toLocaleString();

export function AddFoodSheet({
  date,
  meal,
  onClose,
  onAdded,
}: {
  date: string;
  meal: Meal;
  onClose: () => void;
  onAdded: (result: "saved" | "queued") => void;
}) {
  const [picked, setPicked] = useState<{ food: Food; grams?: number } | null>(null);
  const [custom, setCustom] = useState(false);

  return (
    <Sheet title={`Add to ${meal}`} onClose={onClose}>
      {picked ? (
        <AmountStep
          food={picked.food}
          initialGrams={picked.grams}
          onBack={() => setPicked(null)}
          onSave={async (grams, weighed) => {
            onAdded(await logEntry({ date, meal, grams, weighed, food: picked.food }));
          }}
        />
      ) : custom ? (
        <CustomFoodStep onBack={() => setCustom(false)} onDone={(food) => { setCustom(false); setPicked({ food }); }} />
      ) : (
        <SearchStep onPick={(food, grams) => setPicked({ food, grams })} onCustom={() => setCustom(true)} />
      )}
    </Sheet>
  );
}

function SearchStep({ onPick, onCustom }: { onPick: (f: Food, grams?: number) => void; onCustom: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    api<Recent[]>("/api/foods/recent").then(setRecent).catch(() => {});
  }, []);

  async function lookup(code: string, signal?: AbortSignal) {
    try {
      const food = await api<Food>(`/api/foods/barcode/${code}`, { signal });
      setResults({ mine: [], usda: [], off: [food] });
      return food;
    } catch (e) {
      setResults({ mine: [], usda: [], off: [] });
      setError(e instanceof ApiError ? e.message : "Lookup failed. Check your connection.");
      return null;
    }
  }

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setError(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        if (/^\d{8,14}$/.test(term)) {
          await lookup(term, ctrl.signal); // looks like a barcode
        } else {
          setResults(await api<Results>(`/api/foods/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal }));
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Search failed. Check your connection.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const empty = results && !results.mine.length && !results.usda.length && !results.off.length;

  if (scanning) {
    return (
      <BarcodeScanner
        onCancel={() => setScanning(false)}
        onCode={async (code) => {
          setScanning(false);
          setQ(code);
          const food = await lookup(code);
          if (food) onPick(food);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods or type a barcode"
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 py-3 outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={() => { setError(null); setScanning(true); }}
          aria-label="Scan barcode"
          className="rounded-xl border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
        >
          Scan
        </button>
      </div>
      {loading && <p className="text-sm text-zinc-500">Searching…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!results && recent.length > 0 && (
        <FoodList title="Recent" foods={recent} onPick={(f) => onPick(f, (f as Recent).lastGrams)} />
      )}
      {results && (
        <>
          <FoodList title="My foods" foods={results.mine} onPick={onPick} />
          <FoodList title="Basic foods · USDA" foods={results.usda} onPick={onPick} />
          <FoodList title="Brands · Open Food Facts" foods={results.off} onPick={onPick} />
          {empty && !loading && !error && <p className="text-sm text-zinc-500">No matches.</p>}
        </>
      )}

      <button type="button" onClick={onCustom} className="self-start text-sm font-medium text-emerald-600">
        + Create a custom food
      </button>
    </div>
  );
}

function FoodList({ title, foods, onPick }: { title: string; foods: Food[]; onPick: (f: Food) => void }) {
  if (!foods.length) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {foods.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => onPick(f)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
              <span className="min-w-0">
                <span className="block truncate">{f.name}</span>
                {f.brand && <span className="block truncate text-xs text-zinc-500">{f.brand}</span>}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums text-zinc-500">
                {fmt(f.kcal)} kcal<span className="block text-xs">per 100 g</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AmountStep({
  food,
  initialGrams,
  onBack,
  onSave,
}: {
  food: Food;
  initialGrams?: number;
  onBack: () => void;
  onSave: (grams: number, weighed: boolean) => Promise<void>;
}) {
  const [grams, setGrams] = useState(initialGrams ? String(initialGrams) : "100");
  const [weighed, setWeighed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const g = Number(grams);
  const valid = isFinite(g) && g > 0;
  const n = scale(food, valid ? g : 0);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setSaving(true);
        setError(null);
        try { await onSave(g, weighed); } catch (err) { setError((err as Error).message); setSaving(false); }
      }}
    >
      <button type="button" onClick={onBack} className="self-start text-sm text-zinc-500">← Back</button>
      <div>
        <h3 className="text-lg font-semibold">{food.name}</h3>
        {food.brand && <p className="text-sm text-zinc-500">{food.brand}</p>}
      </div>

      <WeighPanel onUse={(w) => { setGrams(String(Math.round(w))); setWeighed(true); }} />

      <label className="flex items-center gap-3">
        <span className="text-sm text-zinc-500">Amount</span>
        <input
          inputMode="decimal"
          value={grams}
          onChange={(e) => { setGrams(e.target.value); setWeighed(false); }}
          className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-right tabular-nums outline-none focus:border-emerald-500"
        />
        <span className="text-sm text-zinc-500">g {weighed && <span className="text-emerald-600">· weighed</span>}</span>
      </label>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["kcal", n.kcal, ""],
          ["Protein", n.protein, "g"],
          ["Carbs", n.carbs, "g"],
          ["Fat", n.fat, "g"],
        ].map(([label, v, unit]) => (
          <div key={label as string} className="rounded-lg bg-zinc-100 dark:bg-zinc-900 py-2">
            <div className="font-semibold tabular-nums">{fmt(v as number)}{unit}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={!valid || saving}
        className="rounded-xl bg-emerald-600 py-3 font-medium text-white disabled:opacity-40"
      >
        {saving ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

function CustomFoodStep({ onBack, onDone }: { onBack: () => void; onDone: (f: Food) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({ name: "", brand: "", kcal: "", protein: "", carbs: "", fat: "", fiber: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const numOr0 = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const valid = v.name.trim() && v.kcal.trim() !== "" && [v.kcal, v.protein, v.carbs, v.fat, v.fiber].every((s) => isFinite(numOr0(s)));

  const field = "rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 outline-none focus:border-emerald-500";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setError(null);
        try {
          onDone(await api<Food>("/api/foods", {
            method: "POST",
            json: {
              name: v.name.trim(), brand: v.brand.trim() || null,
              kcal: numOr0(v.kcal), protein: numOr0(v.protein), carbs: numOr0(v.carbs), fat: numOr0(v.fat), fiber: numOr0(v.fiber),
            },
          }));
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <button type="button" onClick={onBack} className="self-start text-sm text-zinc-500">← Back</button>
      <input className={field} placeholder="Name" value={v.name} onChange={set("name")} autoFocus />
      <input className={field} placeholder="Brand (optional)" value={v.brand} onChange={set("brand")} />
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Per 100 g (check the label)</p>
      <div className="grid grid-cols-2 gap-2">
        <input className={field} inputMode="decimal" placeholder="Calories (kcal)" value={v.kcal} onChange={set("kcal")} />
        <input className={field} inputMode="decimal" placeholder="Protein (g)" value={v.protein} onChange={set("protein")} />
        <input className={field} inputMode="decimal" placeholder="Carbs (g)" value={v.carbs} onChange={set("carbs")} />
        <input className={field} inputMode="decimal" placeholder="Fat (g)" value={v.fat} onChange={set("fat")} />
        <input className={field} inputMode="decimal" placeholder="Fiber (g)" value={v.fiber} onChange={set("fiber")} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={!valid} className="rounded-xl bg-emerald-600 py-3 font-medium text-white disabled:opacity-40">
        Next
      </button>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { scale, type Food, type Meal } from "@/lib/types";
import { WeighPanel } from "./WeighPanel";
import { Sheet } from "./Sheet";

type Results = { local: Food[]; usda: Food[]; off: Food[] };
type Recent = Food & { last_grams: number };

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
  onAdded: () => void;
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
            const res = await fetch("/api/entries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ date, meal, grams, weighed, food: picked.food }),
            });
            if (!res.ok) throw new Error((await res.json()).error ?? "Could not save");
            onAdded();
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

  useEffect(() => {
    fetch("/api/foods/recent").then((r) => r.json()).then(setRecent).catch(() => {});
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setError(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        if (/^\d{8,14}$/.test(term)) {
          // Looks like a barcode.
          const res = await fetch(`/api/foods/barcode/${term}`, { signal: ctrl.signal });
          if (res.ok) setResults({ local: [], usda: [], off: [await res.json()] });
          else { setResults({ local: [], usda: [], off: [] }); setError("No product found for that barcode."); }
        } else {
          const res = await fetch(`/api/foods/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
          setResults(await res.json());
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Search failed. Check your connection.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const empty = results && !results.local.length && !results.usda.length && !results.off.length;

  return (
    <div className="flex flex-col gap-4">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search foods or type a barcode"
        className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 py-3 outline-none focus:border-emerald-500"
      />
      {loading && <p className="text-sm text-zinc-500">Searching…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!results && recent.length > 0 && (
        <FoodList title="Recent" foods={recent} onPick={(f) => onPick(f, (f as Recent).last_grams)} />
      )}
      {results && (
        <>
          <FoodList title="My foods" foods={results.local} onPick={onPick} />
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
          <li key={`${f.source}:${f.source_id ?? f.id}`}>
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
  const [v, setV] = useState({ name: "", brand: "", kcal: "", protein: "", carbs: "", fat: "", fiber: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const numOr0 = (s: string) => (s.trim() === "" ? 0 : Number(s));
  const valid = v.name.trim() && v.kcal.trim() !== "" && [v.kcal, v.protein, v.carbs, v.fat, v.fiber].every((s) => isFinite(numOr0(s)));

  const field = "rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 outline-none focus:border-emerald-500";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onDone({
          name: v.name.trim(), brand: v.brand.trim() || null, source: "custom",
          kcal: numOr0(v.kcal), protein: numOr0(v.protein), carbs: numOr0(v.carbs), fat: numOr0(v.fat), fiber: numOr0(v.fiber),
        });
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
      <button disabled={!valid} className="rounded-xl bg-emerald-600 py-3 font-medium text-white disabled:opacity-40">
        Next
      </button>
    </form>
  );
}

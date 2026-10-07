"use client";

import { useEffect, useState } from "react";
import { scaleCommand, useScale } from "@/lib/use-scale";
import type { Goals } from "@/lib/types";

const field = "w-24 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-right tabular-nums dark:border-zinc-700";

export default function Settings() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <GoalsForm />
      <Calibration />
    </div>
  );
}

function GoalsForm() {
  const [g, setG] = useState<Record<keyof Goals, string> | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/goals").then((r) => r.json()).then((goals: Goals) =>
      setG({ kcal: String(goals.kcal), protein: String(goals.protein), carbs: String(goals.carbs), fat: String(goals.fat) }));
  }, []);

  if (!g) return null;
  const rows: [keyof Goals, string, string][] = [
    ["kcal", "Calories", "kcal"], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"],
  ];
  const macroKcal = Number(g.protein) * 4 + Number(g.carbs) * 4 + Number(g.fat) * 9;

  return (
    <form
      className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/goals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Number(v)]))),
        });
        setSaved(res.ok);
      }}
    >
      <h2 className="mb-3 font-semibold">Daily goals</h2>
      <div className="flex flex-col gap-2">
        {rows.map(([k, label, unit]) => (
          <label key={k} className="flex items-center justify-between">
            <span>{label}</span>
            <span className="flex items-center gap-2">
              <input inputMode="numeric" className={field} value={g[k]} onChange={(e) => { setSaved(false); setG({ ...g, [k]: e.target.value }); }} />
              <span className="w-8 text-sm text-zinc-500">{unit}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Macros add up to {Math.round(macroKcal)} kcal.</p>
      <button className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
        {saved ? "Saved ✓" : "Save goals"}
      </button>
    </form>
  );
}

function Calibration() {
  const scale = useScale();
  const [known, setKnown] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const r = scale.status === "live" ? scale.reading : null;
  return (
    <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-semibold">Trackpad scale</h2>
      {!r ? (
        <p className="mt-2 text-sm text-zinc-500">
          {scale.status === "connecting" ? "Connecting…" : "Not running. Start it on this Mac with swift run in scale-helper/."}
        </p>
      ) : (
        <>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {r.touching ? `${r.grams.toFixed(1)} g` : "—"}
            <span className="ml-2 text-sm font-normal text-zinc-500">{r.touching ? (r.stable ? "stable" : "settling") : "no finger"}</span>
          </p>
          <p className="text-xs text-zinc-500 tabular-nums">correction factor ×{r.factor.toFixed(3)}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>Put paper on the pad and rest one finger. Press Zero.</li>
            <li>Place something with a known weight (coins work: US quarter 5.67 g, 1 € coin 7.5 g, or a few of them).</li>
            <li>When stable, enter the true weight and press Calibrate.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => scaleCommand("/tare").catch(() => {})}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Zero</button>
            <input inputMode="decimal" placeholder="true g" value={known} onChange={(e) => setKnown(e.target.value)} className={field} />
            <button
              type="button"
              disabled={!(Number(known) > 0) || !r.stable}
              onClick={async () => {
                try {
                  const res = await scaleCommand(`/calibrate?grams=${Number(known)}`);
                  setMsg(`Calibrated. Factor ×${res.factor.toFixed(3)}`);
                } catch (e) { setMsg((e as Error).message); }
              }}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Calibrate
            </button>
            <button type="button" onClick={async () => { await scaleCommand("/calibrate/reset").catch(() => {}); setMsg("Calibration reset."); }}
              className="px-2 text-sm text-zinc-500">Reset</button>
          </div>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
        </>
      )}
    </section>
  );
}

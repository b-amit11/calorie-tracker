"use client";

import { useEffect, useState } from "react";
import { api, clearQueue } from "@/lib/client";
import { useMe } from "@/lib/use-me";
import { scaleCommand, useIsMac, useScale } from "@/lib/use-scale";
import { macroKcal, type Goals } from "@/lib/types";

const field = "w-24 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-right tabular-nums dark:border-zinc-700";

export default function Settings() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <GoalsForm />
      {useIsMac() && <Calibration />}
      <Account />
    </div>
  );
}

function GoalsForm() {
  const [g, setG] = useState<Record<keyof Goals, string> | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Goals>("/api/goals").then((goals) =>
      setG({ kcal: String(goals.kcal), protein: String(goals.protein), carbs: String(goals.carbs), fat: String(goals.fat) }));
  }, []);

  if (!g) return null;
  const rows: [keyof Goals, string, string][] = [
    ["kcal", "Calories", "kcal"], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"],
  ];
  const fromMacros = macroKcal({ protein: Number(g.protein), carbs: Number(g.carbs), fat: Number(g.fat) });

  return (
    <form
      className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await api("/api/goals", { method: "PUT", json: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Number(v)])) });
          setSaved(true);
        } catch (err) {
          setError((err as Error).message);
        }
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
      <p className="mt-2 text-xs text-zinc-500">Macros add up to {Math.round(fromMacros)} kcal.</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
          {scale.status === "connecting" ? "Connecting…" : "Not running. Start the Trackpad Scale menu-bar app."}
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

function Account() {
  const me = useMe();
  if (!me) return null;
  return (
    <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-semibold">Account</h2>
      <p className="mt-1 text-sm text-zinc-500">{me.isDemo ? "Demo account (deleted after 24 hours)" : me.email}</p>
      <button
        type="button"
        onClick={async () => {
          await api("/api/auth/logout", { method: "POST" }).catch(() => {});
          clearQueue();
          // Drop cached API responses so the next person on this device can't see them.
          if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
          location.href = "/login";
        }}
        className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
      >
        Sign out
      </button>
    </section>
  );
}

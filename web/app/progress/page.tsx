"use client";

import { useCallback, useEffect, useState } from "react";
import { todayISO, type Goals } from "@/lib/types";

type Point = { date: string; value: number };

export default function Progress() {
  const [weights, setWeights] = useState<{ date: string; kg: number }[]>([]);
  const [stats, setStats] = useState<{ days: { date: string; kcal: number }[]; goals: Goals } | null>(null);
  const [kg, setKg] = useState("");
  const [date, setDate] = useState(todayISO);

  const load = useCallback(async () => {
    const [w, s] = await Promise.all([fetch("/api/weights").then((r) => r.json()), fetch("/api/stats").then((r) => r.json())]);
    setWeights(w);
    setStats(s);
  }, []);
  useEffect(() => { load(); }, [load]);

  const latest = weights.at(-1);
  const avg = stats?.days.length ? stats.days.reduce((a, d) => a + d.kcal, 0) / stats.days.length : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Progress</h1>

      <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Body weight</h2>
          {latest && <span className="text-sm text-zinc-500 tabular-nums">{latest.kg} kg</span>}
        </div>
        <LineChart points={weights.map((w) => ({ date: w.date, value: w.kg }))} unit="kg" />
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = Number(kg);
            if (!(n > 0)) return;
            await fetch("/api/weights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, kg: n }) });
            setKg("");
            load();
          }}
        >
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-2 py-2 text-sm dark:border-zinc-700" />
          <input inputMode="decimal" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)}
            className="w-20 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
          <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Log</button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Calories · last 30 days</h2>
          {stats && stats.days.length > 0 && <span className="text-sm text-zinc-500 tabular-nums">avg {Math.round(avg)} kcal</span>}
        </div>
        {stats && <BarChart days={stats.days} goal={stats.goals.kcal} />}
      </section>
    </div>
  );
}

function LineChart({ points, unit }: { points: Point[]; unit: string }) {
  if (points.length < 2) return <p className="py-8 text-center text-sm text-zinc-500">Log at least two weigh-ins to see a trend.</p>;
  const W = 320, H = 120, P = 6;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Weight trend in ${unit}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500" />
      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.value)} r="2.5" className="fill-emerald-500"><title>{`${p.date}: ${p.value} ${unit}`}</title></circle>
      ))}
    </svg>
  );
}

function BarChart({ days, goal }: { days: { date: string; kcal: number }[]; goal: number }) {
  if (!days.length) return <p className="py-8 text-center text-sm text-zinc-500">Nothing logged yet.</p>;
  const W = 320, H = 120;
  const max = Math.max(goal * 1.2, ...days.map((d) => d.kcal));
  const bw = W / 30;
  const today = new Date(`${todayISO()}T12:00:00`).getTime();
  const goalY = H - (goal / max) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Daily calories vs goal">
      {days.map((d) => {
        const ago = Math.round((today - new Date(`${d.date}T12:00:00`).getTime()) / 86_400_000);
        const h = (d.kcal / max) * H;
        return (
          <rect key={d.date} x={W - (ago + 1) * bw + 1} y={H - h} width={bw - 2} height={h} rx="1.5"
            className={d.kcal > goal ? "fill-amber-500" : "fill-emerald-500"}>
            <title>{`${d.date}: ${Math.round(d.kcal)} kcal`}</title>
          </rect>
        );
      })}
      <line x1="0" x2={W} y1={goalY} y2={goalY} strokeDasharray="4 3" className="stroke-zinc-400" />
    </svg>
  );
}

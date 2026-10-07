"use client";

import { scaleCommand, useIsMac, useScale } from "@/lib/use-scale";

/** Live trackpad-scale readout with Zero and "Use this weight" buttons. Only rendered on a Mac. */
export function WeighPanel({ onUse }: { onUse: (grams: number) => void }) {
  return useIsMac() ? <LiveScale onUse={onUse} /> : null;
}

function LiveScale({ onUse }: { onUse: (grams: number) => void }) {
  const scale = useScale();

  if (scale.status !== "live") {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-sm text-zinc-500">
        {scale.status === "connecting" ? (
          "Connecting to trackpad scale…"
        ) : (
          <>
            Trackpad scale not running. Start the <strong>Trackpad Scale</strong> menu-bar app to weigh food.
          </>
        )}
      </div>
    );
  }

  const r = scale.reading;
  return (
    <div className="rounded-xl bg-zinc-100 dark:bg-zinc-900 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Trackpad scale</span>
        <span className={`text-xs ${r.stable ? "text-emerald-600" : "text-amber-600"}`}>
          {!r.touching ? "rest a finger on the pad" : r.stable ? "stable" : "settling…"}
        </span>
      </div>
      <div className="mt-1 text-4xl font-semibold tabular-nums">
        {r.touching ? r.grams.toFixed(1) : "—"} <span className="text-lg text-zinc-500">g</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Bowl or paper on the pad → one finger resting lightly → it zeroes → add food.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => scaleCommand("/tare").catch(() => {})}
          disabled={!r.touching}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Zero
        </button>
        <button
          type="button"
          onClick={() => onUse(r.grams)}
          disabled={!r.touching || !r.stable || r.grams <= 0}
          className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Use {r.touching ? `${Math.round(r.grams)} g` : "weight"}
        </button>
      </div>
    </div>
  );
}

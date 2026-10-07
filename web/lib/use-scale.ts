"use client";

import { useEffect, useState } from "react";

// The Swift helper (scale-helper/) only listens on this Mac's loopback,
// so the scale is available when the app is opened on the Mac itself.
export const SCALE_URL = process.env.NEXT_PUBLIC_SCALE_URL ?? "http://localhost:8787";

export type ScaleReading = {
  grams: number;
  touching: boolean;
  stable: boolean;
  raw: number;
  tare: number;
  factor: number;
};

export type ScaleState =
  | { status: "connecting" }
  | { status: "offline" }
  | { status: "live"; reading: ScaleReading };

export function useScale(enabled = true): ScaleState {
  const [state, setState] = useState<ScaleState>({ status: "connecting" });

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`${SCALE_URL}/events`);
    es.onmessage = (e) => setState({ status: "live", reading: JSON.parse(e.data) });
    es.onerror = () => setState({ status: "offline" }); // EventSource keeps retrying on its own
    return () => es.close();
  }, [enabled]);

  return state;
}

export async function scaleCommand(path: "/tare" | "/calibrate/reset" | `/calibrate?grams=${number}`) {
  const res = await fetch(`${SCALE_URL}${path}`, { method: "POST" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Scale request failed");
  return (await res.json()) as ScaleReading;
}

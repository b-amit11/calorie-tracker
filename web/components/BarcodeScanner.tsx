"use client";

import { useEffect, useRef, useState } from "react";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

/** Native BarcodeDetector where the browser has one (Chrome/Android), otherwise a ZXing WebAssembly ponyfill (iOS Safari). */
async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (Native) {
    const supported = await Native.getSupportedFormats();
    if (FORMATS.some((f) => supported.includes(f))) return new Native({ formats: FORMATS });
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: FORMATS as never });
}

/** Full-width camera view that calls onCode once with the first barcode it sees. */
export function BarcodeScanner({ onCode, onCancel }: { onCode: (code: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; });

  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera needs HTTPS. Open the app over https:// (or type the barcode digits instead).");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        setError("Couldn't open the camera. Check camera permission for this site.");
        return;
      }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play();
      const detector = await createDetector();

      let last = 0;
      const tick = async (t: number) => {
        if (stopped || !video.current) return;
        if (t - last > 200 && video.current.readyState >= 2) { // ~5 scans/sec is plenty
          last = t;
          const [hit] = await detector.detect(video.current).catch(() => []);
          if (hit && /^\d{6,14}$/.test(hit.rawValue)) {
            stopped = true;
            navigator.vibrate?.(50);
            onCodeRef.current(hit.rawValue);
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="rounded-xl bg-zinc-100 p-4 text-sm dark:bg-zinc-900">{error}</p>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
        </div>
      )}
      <button type="button" onClick={onCancel} className="text-sm text-zinc-500">Cancel</button>
    </div>
  );
}

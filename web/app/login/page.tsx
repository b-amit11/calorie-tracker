"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { todayISO } from "@/lib/types";

type Me = { user: unknown; signupEnabled: boolean; demoEnabled: boolean };

function goNext() {
  const next = new URLSearchParams(location.search).get("next");
  // Only same-site relative paths, to avoid an open redirect.
  location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/api/auth/me").then((m) => (m.user ? goNext() : setMe(m))).catch(() => {});
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); goNext(); } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const field = "w-full rounded-xl border border-zinc-300 bg-transparent px-4 py-3 outline-none focus:border-emerald-500 dark:border-zinc-700";

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-10">
      <div>
        <h1 className="text-3xl font-semibold">Calories</h1>
        <p className="mt-1 text-zinc-500">Track what you eat. Weigh it on your trackpad.</p>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api(`/api/auth/${mode}`, { method: "POST", json: { email, password } }));
        }}
      >
        <input className={field} type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className={field}
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode === "login" ? "Password" : "Password (8+ characters)"}
          minLength={mode === "signup" ? 8 : undefined}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="rounded-xl bg-emerald-600 py-3 font-medium text-white disabled:opacity-50">
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      {me?.signupEnabled && (
        <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }} className="text-sm text-zinc-500">
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      )}

      {me?.demoEnabled && (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500">Just looking? Try it with two weeks of sample data.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => api("/api/auth/demo", { method: "POST", json: { today: todayISO() } }))}
            className="mt-2 font-medium text-emerald-600 disabled:opacity-50"
          >
            Try the demo →
          </button>
        </div>
      )}
    </div>
  );
}

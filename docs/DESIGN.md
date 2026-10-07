# Design notes

This document explains the main engineering decisions and the trade-offs behind them.

## 1. Turning trackpad pressure into grams

**Problem.** The trackpad reports a pressure value per touch at ~100 Hz, and only while a finger is detected (it's a capacitive sensor). The raw signal includes the finger's own, constantly varying pressure.

**Approach** (`scale-helper/Sources/ScaleCore/WeightEstimator.swift`):

| Step | Choice | Why |
| --- | --- | --- |
| Combine touches | Sum pressure across active touches | Weight is spread across every contact point |
| Smooth | Median of the last 40 frames | Unlike a mean, a median ignores single-frame spikes (e.g. when the bowl is tapped) |
| Stability | `max - min < 3` over the window | Simple, explainable, and directly drives the "stable" badge |
| Tare | Automatic 0.6 s after touch-down, only once stable | Same workflow as a kitchen scale: put the bowl on, rest a finger, add food |
| Clamp | Never report < 0 g | Pressing lighter than at tare is the finger, not negative food |
| Calibrate | `factor = known / (median - tare)`, persisted | One known weight corrects device-to-device differences |

The estimator is a value type with an injected clock (`ingest(pressures:at:)`), so the tests feed it synthetic signals (spikes, jitter, lifting the finger) without any hardware.

**Alternatives considered.** A Kalman filter would track a moving signal more smoothly. But the target here is a static load, so the median plus stability gate is simpler and easier to reason about.

## 2. Getting the weight from a native app into a web page

The browser can't read raw trackpad data (Safari's `webkitForce` events only fire during clicks and are uncalibrated). So a native helper serves readings over HTTP:

- **Loopback only.** The listener binds to `127.0.0.1`, so nothing else on the network can reach it.
- **Server-Sent Events** for live readings (10 Hz). That's simpler than WebSockets for one-way data, and `EventSource` reconnects automatically.
- **Origin allowlist.** Pages on `localhost` are allowed. A deployed copy of the app must be added explicitly in the menu-bar settings. Writes (`/tare`, `/calibrate`) from other origins get a `403`, because CORS alone doesn't stop a browser from *sending* a simple POST.
- **Private Network Access.** Chrome requires an explicit opt-in before a public HTTPS page can call `localhost`. The helper answers the preflight with `Access-Control-Allow-Private-Network: true` for allowed origins.
- **Transport-free routing.** `ScaleAPI` maps an `HTTPRequest` to a response with no sockets involved, so routing, CORS and error cases are unit-tested. `ScaleServer` is a thin Network.framework shell around it.

## 3. Authentication

The auth is written by hand on purpose: it's small, and every piece is visible and tested.

- **Passwords:** scrypt (N=2^17, r=8, p=1, OWASP's recommendation) with a per-user salt. The parameters are stored with each hash so they can be raised later. Input is NFKC-normalized so visually identical Unicode passwords match.
- **Sessions:** a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie. Only its SHA-256 is stored, so a leaked database can't be replayed. Sessions last 30 days and slide forward once less than half the lifetime remains. Logout deletes the row (tested: replaying an old cookie gets a 401).
- **Login timing:** a dummy hash is verified when the email doesn't exist, so response time doesn't reveal which emails have accounts.
- **Rate limiting:** fixed-window counters stored *in the database*, so they hold across serverless instances (per account: 10 per 15 min; per client: 30 per 15 min; sign-ups: 5 per hour).
- **CSRF:** `SameSite=Lax` cookies, plus a same-origin `Origin` check on every non-GET `/api` request in `proxy.ts`.
- **Authorization:** the proxy only does an optimistic redirect for pages. Every route handler validates the session against the database (`authed()` in `lib/api.ts`), and every query is scoped by `user_id`. Cross-user access returns `404`, not `403`, so it doesn't reveal that an ID exists.

## 4. Data model and the shared food catalog

```
users ─┬─< sessions
       ├─< entries >── foods (owner_id NULL = shared catalog, else private custom food)
       ├─< weights
       └── goals
```

USDA and Open Food Facts results are **cached server-side** into a shared catalog, and entries refer to foods by ID. An earlier version let the client send nutrition data along with the entry. That would let any user "register" a USDA ID with fake calories and poison it for everyone. Now only server code writes catalog rows (`cacheCatalogFoods`), and users can only create private custom foods.

Searching "my foods" ranks by how often the user has logged each food. User input is escaped for `LIKE` (`%` and `_` match literally, which is tested).

**Database choice.** libSQL keeps the local developer experience of a single SQLite file, and deploys to Turso without code changes. Drizzle provides typed queries and versioned SQL migrations, which run automatically on startup.

## 5. Offline-first logging

1. The service worker (`public/sw.js`) uses three strategies: cache-first for content-hashed build assets, network-first with cache fallback for pages and read APIs, and never caching writes or auth redirects.
2. When a POST fails with a network error, the entry is stored in a `localStorage` queue along with the food's data. The diary renders queued items (marked "waiting to sync") and includes them in the day's totals.
3. On page load and on the `online` event, the queue is replayed. Each entry carries a client-generated `clientId`, and `entries` has a unique `(user_id, client_id)` index. A retry after a lost response therefore returns the original row instead of creating a duplicate (`200` instead of `201`).
4. Rejections from the server (4xx) are dropped. Network errors, 401 and 5xx keep the entry queued.

## 6. Testing strategy

| Layer | Tool | What it covers |
| --- | --- | --- |
| Pure logic | Vitest | Nutrition math, date math across month and leap-year boundaries, validation, API response parsing, search ranking |
| Data access | Vitest + in-memory libSQL | Per-user isolation, idempotent inserts, catalog upserts, LIKE escaping, aggregations |
| Auth | Vitest | Hashing, session expiry and revocation, rate limits, demo-account cleanup via cascading deletes |
| HTTP | Vitest, real route handlers | 401/400/404 behaviour, cross-user access, logout revocation (`next/headers` and the DB swapped for in-memory fakes) |
| Proxy | Vitest | CSRF origin check, signed-out redirects with a `next` parameter |
| Scale | Swift Testing | Estimator behaviour on synthetic signals, HTTP parsing, CORS policy, API routing with a fake scale |

CI runs the web suite plus a production build on Linux, and the Swift build plus tests on macOS.

## 7. What I'd do next

- End-to-end browser tests (Playwright), including offline mode.
- Move the offline queue to IndexedDB, and support offline edits and deletes, not just new entries.
- Developer ID signing and notarization for the Mac app, plus an auto-updater (Sparkle).
- Recipes (one food made of several ingredients) and saved meals.

// Service worker: makes the app installable and usable offline.
//
// - Static build assets (/_next/static) are content-hashed, so they're cache-first.
// - Pages are network-first, falling back to the cached copy when offline.
// - Diary/progress API reads are network-first too, so the last-seen data shows offline.
// - Writes are never cached; offline entries are queued by the app (see lib/client.ts).

const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const DATA = `data-${VERSION}`;
// Other pages are cached on first visit; pre-caching them while signed out would store the login redirect.
const APP_SHELL = ["/login"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC, PAGES, DATA]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = (await cache.match(request)) ?? (fallbackUrl && (await cache.match(fallbackUrl)));
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // e.g. the local trackpad scale

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES, "/login"));
  } else if (/^\/api\/(day|goals|stats|weights|foods\/recent)\b/.test(url.pathname)) {
    event.respondWith(networkFirst(request, DATA));
  }
});

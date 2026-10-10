/*
 * Situation X service worker.
 *
 * What it does (and deliberately does not do):
 *   - makes the site installable (Android / Windows / iPhone "Add to Home Screen");
 *   - keeps the built, hashed files under /assets/ so the app opens faster on the next visit;
 *   - opens the app screen straight from the device, so a sleeping server (free hosting) never shows its own
 *     "starting" page in place of the app; the screen is refreshed from the server in the background;
 *   - shows a friendly "you are offline" page when there is no connection.
 * It never stores or answers /api/ calls, sign-in, AI or payment traffic: those always go to the server,
 * so nothing about a user's readings, credits or payments can be served stale or from another account.
 */
const VERSION = "v3";
const STATIC_CACHE = "sx-static-" + VERSION;
const BASE = new URL("./", self.location).pathname; // "/" (or the sub-path the site is served from)
const OFFLINE_URL = BASE + "offline.html";
const SHELL_URL = BASE + "__shell";
const PRECACHE = [OFFLINE_URL, BASE + "icon-192.png", BASE + "favicon.png"];

/** Keeps the app's own page (never a host's "starting" or error page) so the app can open instantly. */
function saveShell(cache, request) {
  return Promise.resolve(request)
    .then((res) => (res && res.ok ? res.clone().text().then((html) => (html.includes('id="root"') ? cache.put(SHELL_URL, new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })) : null)) : null))
    .catch(() => null);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).then(() => saveShell(cache, fetch(BASE, { cache: "no-store" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sx-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Clerk, Razorpay, fonts, ... are never touched
  if (url.pathname.startsWith(BASE + "api/")) return; // the API is never cached

  // Pages: the saved app screen opens at once and is refreshed from the live site in the background.
  // Without a saved copy (first visit) the live site is used; offline, the offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const saved = await cache.match(SHELL_URL);
        const live = fetch(req).then((res) => {
          if (res.ok) saveShell(cache, res.clone());
          return res;
        });
        if (saved) {
          event.waitUntil(live.catch(() => null));
          return saved;
        }
        return live.catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()));
      }),
    );
    return;
  }

  // Built files have content-hashed names, so a cached copy is always the right one.
  if (url.pathname.startsWith(BASE + "assets/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  // Precached extras (icons, offline page): cache first. Anything else goes to the network untouched.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});

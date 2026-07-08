/* Card Vault service worker
 * ---------------------------------------------------------------------
 * Purpose: make the app usable at a card show with no wifi, once it has
 * been opened at least one time with a connection.
 *
 * Strategy:
 *  - App shell (index.html, manifest, icon) + CDN libraries: cache-first.
 *    These rarely change; serving from cache instantly is also just
 *    faster than round-tripping to a CDN on a bad connection.
 *  - pokemontcg.io API GET requests: network-first with a cache
 *    fallback (stale-while-revalidate-ish) so a repeated lookup still
 *    resolves offline, using whatever was last fetched successfully.
 *  - Everything else: pass through to the network untouched.
 *
 * Bump CACHE_VERSION any time you change index.html so old clients pick
 * up the new file instead of serving a stale cached copy forever.
 * --------------------------------------------------------------------- */

const CACHE_VERSION = "cardvault-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;

const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/htm@3.1.1/dist/htm.js",
  "https://unpkg.com/papaparse@5.4.1/papaparse.min.js",
  "https://unpkg.com/lucide@latest/dist/umd/lucide.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Use individual adds so one failed CDN fetch (e.g. offline install)
      // doesn't block caching of everything else.
      Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("cardvault-") && k !== SHELL_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isShellRequest(url) {
  return SHELL_URLS.some((shellUrl) => {
    if (shellUrl.startsWith("http")) return url.href === shellUrl;
    return url.pathname.endsWith(shellUrl.replace("./", "/"));
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Pokémon TCG API — network-first, fall back to cache when offline.
  if (url.hostname === "api.pokemontcg.io") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // App shell + CDN libraries — cache-first, refresh in background.
  if (isShellRequest(url) || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

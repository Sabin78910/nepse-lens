// Offline support: app shell cached on install; same-origin GETs network-first with cache fallback;
// market data from GitHub/Worker is stale-while-revalidate so the last snapshot works offline.
const CACHE = "nepse-lens-v1";
const SHELL = ["./", "./manifest.webmanifest", "./favicon.svg", "./icon-192.png", "./icon-512.png", "./sample/latest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const data = url.hostname === "raw.githubusercontent.com" || url.pathname.endsWith(".json");
  if (!sameOrigin && !data) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: data }).then((hit) => hit || caches.match("./"))),
  );
});

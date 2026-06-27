const CACHE_NAME = "landingpage-shell-mobile-pwa-1";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css?v=mobile-pwa-1",
  "/app.js?v=mobile-pwa-1",
  "/vendor/react/react.production.min.js",
  "/vendor/react-dom/react-dom.production.min.js",
  "/favicon.svg",
  "/apple-touch-icon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin || event.request.method !== "GET") return;
  if (requestUrl.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

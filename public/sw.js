const CACHE_NAME = "landingpage-shell-mobile-pwa-7";
const DATA_CACHE_NAME = "landingpage-data-mobile-pwa-7";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css?v=mobile-pwa-7",
  "/app.js?v=mobile-pwa-7",
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
      .then((keys) => Promise.all(keys.filter((key) => ![CACHE_NAME, DATA_CACHE_NAME].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin || event.request.method !== "GET") return;

  if (requestUrl.pathname === "/api/catalog") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DATA_CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
  );
});

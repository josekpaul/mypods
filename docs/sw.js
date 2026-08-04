// App-shell caching only. Never touches podcast-audio-* caches or data/episodes.json.

const APP_SHELL_CACHE = "app-shell-v5";

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/data.js",
  "./js/storage.js",
  "./js/player.js",
  "./js/ui.js",
  "./js/settings.js",
  "./js/analytics.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("app-shell-") && name !== APP_SHELL_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  const isOwnOrigin = url.origin === self.location.origin;
  const isDataRequest = url.pathname.includes("/data/episodes.json");

  if (!isOwnOrigin || isDataRequest) {
    return; // let the network handle it directly
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

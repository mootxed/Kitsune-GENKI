/* sw.js — Kitsune Genki Service Worker */
const CACHE = "kitsune-genki-v1";
const ASSETS = [
  "index.html",
  "styles.css",
  "app.js",
  "srs.js",
  "services.js",
  "session-manager.js",
  "studyplan.js",
  "stories.js",
  "achievements.js",
  "quests.js",
  "lesson.json",
  "manifest.json",
  "icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => {
      return Promise.allSettled(
        ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
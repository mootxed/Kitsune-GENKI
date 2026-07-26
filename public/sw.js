/* sw.js — Kitsune Genki Service Worker */

// ===== ВЕРСИОНИРОВАННЫЕ КЕШИ =====
const CACHE_VERSION = '15';
const CACHE_STATIC = `kitsune-static-v${CACHE_VERSION}`;
const CACHE_DYNAMIC = `kitsune-dynamic-v${CACHE_VERSION}`;
const CACHE_LESSON = `kitsune-lesson-v${CACHE_VERSION}`;

// Базовый путь скоупа SW (например, '/Kitsune-GENKI/' или '/')
const SW_SCOPE = new URL('./', self.location).pathname;
const OFFLINE_URL = new URL('offline.html', self.location).pathname;

// ===== СТАТИЧЕСКИЕ РЕСУРСЫ (Cache-First) =====
// В production этот список изменяется плагином Vite в vite.config.js на хэшированные бандлы из dist/assets/
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg',
  'offline.html',
  /* __STATIC_ASSETS_BEGIN__ */
  'styles.css',
  'app.js',
  'router.js',
  'srs.js',
  'services.js',
  'session-manager.js',
  'studyplan.js',
  'achievements.js',
  'quests.js',
  'src/audio-helper.js',
  'src/backup-manager.js',
  'src/card-behavior.js',
  'src/chapter-progress.js',
  'src/content-loader.js',
  'src/db.js',
  'src/knowledge-model.js',
  'src/local-date.js',
  'src/mastery.js',
  'src/migration.js',
  'src/particle-templates.js',
  'src/production-context.js',
  'src/review-journal.js',
  'src/review-log.js',
  'src/session-batcher.js',
  'src/srs-config.js',
  'src/srs-helpers.js',
  'src/srs-limits.js',
  'src/typing-capability.js',
  'src/utils.js',
  'src/xp-system.js',
  'state/store.js',
  'ui/chapter.js',
  'ui/chat.js',
  'ui/crossword.js',
  'ui/flashcards.js',
  'ui/home.js',
  'ui/particles.js',
  'ui/plan.js',
  'ui/profile.js',
  'ui/router.js',
  'ui/settings.js',
  'ui/shared.js',
  'ui/shop.js',
  'ui/stories.js',
  /* __STATIC_ASSETS_END__ */
];

// ===== КОНТЕНТ ГЛАВ И КАНДЗИ (Stale-While-Revalidate) =====
const LESSON_FILES = ['data/content-index.json', 'data/genki-i-workbook-practice.json'];
const CONTENT_CHUNK_RE =
  /\/data\/((lessons|stories)\/(lesson|story)-\d+|kanji\/.*|genki-i-workbook-practice)\.json$/;

// Скомпилированные пути для сопоставления с url.pathname
const RESOLVED_STATIC_PATHS = STATIC_ASSETS.map((asset) => new URL(asset, self.location).pathname);
const LESSON_FILE_PATHS = LESSON_FILES.map((file) => new URL(file, self.location).pathname);

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    Promise.all([
      // Кэшируем статические ресурсы относительно расположения SW
      caches.open(CACHE_STATIC).then((cache) => {
        return Promise.allSettled(
          STATIC_ASSETS.map((url) => {
            const resolvedUrl = new URL(url, self.location).href;
            return cache.add(resolvedUrl).catch((err) => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
            });
          })
        );
      }),
      // Кэшируем файлы уроков
      caches.open(CACHE_LESSON).then((cache) => {
        return Promise.allSettled(
          LESSON_FILES.map((url) => {
            const resolvedUrl = new URL(url, self.location).href;
            return cache.add(resolvedUrl).catch((err) => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
            });
          })
        );
      }),
    ])
  );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  const validCaches = [CACHE_STATIC, CACHE_DYNAMIC, CACHE_LESSON];

  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => !validCaches.includes(key))
            .map((key) => {
              console.log(`[SW] Deleting old cache: ${key}`);
              return caches.delete(key);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activated and claimed clients');
        return self.clients.claim();
      })
  );
});

// ===== MESSAGE EVENT (для контролируемого обновления) =====
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING command');
    self.skipWaiting();
  }
});

// ===== FETCH EVENT (стратегии кэширования) =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Игнорируем запросы к внешним доменам (CDN, API и т.д.)
  if (url.origin !== location.origin) {
    return;
  }

  // ===== STALE-WHILE-REVALIDATE для контента глав =====
  if (LESSON_FILE_PATHS.includes(url.pathname) || CONTENT_CHUNK_RE.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_LESSON).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            })
            .catch((err) => {
              console.warn('[SW] Network fetch failed for lesson:', err);
              return cachedResponse;
            });

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // ===== CACHE-FIRST для статических ресурсов =====
  const isStaticAsset =
    RESOLVED_STATIC_PATHS.includes(url.pathname) ||
    url.pathname.startsWith(`${SW_SCOPE}assets/`) ||
    url.pathname.startsWith(`${SW_SCOPE}src/`) ||
    url.pathname.startsWith(`${SW_SCOPE}ui/`) ||
    url.pathname.startsWith(`${SW_SCOPE}state/`);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then((networkResponse) => {
            return caches.open(CACHE_STATIC).then((cache) => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          })
          .catch((err) => {
            console.warn('[SW] Failed to fetch static asset:', err);
            throw err;
          });
      })
    );
    return;
  }

  // ===== NETWORK-FIRST для остального контента =====
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (request.method === 'GET' && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_DYNAMIC).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL).then((offlineResponse) => {
              return offlineResponse || caches.match(new URL('./', self.location).pathname);
            });
          }
          return new Response('Network error', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
  );
});

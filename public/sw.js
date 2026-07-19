/* sw.js — Kitsune Genki Service Worker */

// ===== ВЕРСИОНИРОВАННЫЕ КЕШИ =====
const CACHE_VERSION = '8';
const CACHE_STATIC = `kitsune-static-v${CACHE_VERSION}`;
const CACHE_DYNAMIC = `kitsune-dynamic-v${CACHE_VERSION}`;
const CACHE_LESSON = `kitsune-lesson-v${CACHE_VERSION}`;

// ===== СТАТИЧЕСКИЕ РЕСУРСЫ (Cache-First) =====
const STATIC_ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'router.js',
  'srs.js',
  'services.js',
  'session-manager.js',
  'studyplan.js',
  'achievements.js',
  'quests.js',
  'manifest.json',
  'icon.svg',
  'offline.html',
  // Модульные CSS файлы
  'src/styles/tokens.css',
  'src/styles/base.css',
  'src/styles/layout.css',
  'src/styles/themes/light.css',
  'src/styles/themes/dark.css',
  'src/styles/themes/custom.css',
  'src/styles/components/header.css',
  'src/styles/components/tabbar.css',
  'src/styles/components/buttons.css',
  'src/styles/components/cards.css',
  'src/styles/components/profile.css',
  'src/styles/components/srs.css',
  'src/styles/components/ui.css',
  // JavaScript модули
  'src/audio-helper.js',
  'src/backup-manager.js',
  'src/content-loader.js',
  'src/srs-helpers.js',
  'src/utils.js',
  'src/xp-system.js',
  'state/store.js',
  'ui/chapter.js',
  'ui/chat.js',
  'ui/flashcards.js',
  'ui/home.js',
  'ui/profile.js',
  'ui/router.js',
  'ui/settings.js',
  'ui/shared.js',
  'ui/shop.js',
  'ui/stories.js',
];

// ===== КОНТЕНТ ГЛАВ (Stale-While-Revalidate) =====
// Индекс кэшируем на install — он лёгкий; чанки уроков/историй
// кэшируются в фоне по мере обращения, не раздувая shell-кэш.
const LESSON_FILES = ['/data/content-index.json'];
// Проверка по суффиксу: работает и при base-пути (GitHub Pages /Kitsune-GENKI/)
const CONTENT_CHUNK_RE = /\/data\/(lessons|stories)\/(lesson|story)-\d+\.json$/;

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    Promise.all([
      // Кэшируем статические ресурсы
      caches.open(CACHE_STATIC).then((cache) => {
        return Promise.allSettled(
          STATIC_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
            })
          )
        );
      }),
      // Кэшируем файлы уроков
      caches.open(CACHE_LESSON).then((cache) => {
        return Promise.allSettled(
          LESSON_FILES.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
            })
          )
        );
      }),
    ])
  );
  // НЕ вызываем skipWaiting автоматически - только по команде пользователя
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
  // Перехватываем индекс и wildcard-чанки /data/lessons/lesson-*.json, /data/stories/story-*.json
  if (LESSON_FILES.some((file) => url.pathname.endsWith(file)) || CONTENT_CHUNK_RE.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_LESSON).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              // Обновляем кеш в фоне
              cache.put(request, networkResponse.clone());
              return networkResponse;
            })
            .catch((err) => {
              console.warn('[SW] Network fetch failed for lesson:', err);
              return cachedResponse; // Возвращаем кешированную версию при ошибке
            });

          // Возвращаем кешированную версию сразу, если есть
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // ===== CACHE-FIRST для статических ресурсов =====
  if (STATIC_ASSETS.some((asset) => url.pathname === asset || url.pathname.startsWith('/src/') || url.pathname.startsWith('/ui/') || url.pathname.startsWith('/state/'))) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Если нет в кеше, загружаем из сети и кешируем
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
        // Кешируем успешные GET запросы в динамический кеш
        if (request.method === 'GET' && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_DYNAMIC).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Если сеть недоступна, пытаемся вернуть из кеша
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Для навигационных запросов показываем offline страницу
          if (request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          // Для остальных возвращаем ошибку
          return new Response('Network error', {
            status: 408,
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
  );
});
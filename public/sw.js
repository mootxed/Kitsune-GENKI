/* sw.js — KotoKitsu Service Worker
 *
 * Cache versioning: __CACHE_VERSION__ is replaced at build time by the Vite
 * plugin in vite.config.js with a content-hash derived from the production
 * asset manifest.  During `vite dev` the placeholder is replaced with a
 * `dev-<timestamp>` string so stale dev caches don't pile up.
 */

// ===== VERSIONING =====
/* __CACHE_VERSION_START__ */
const CACHE_VERSION = '__CACHE_VERSION__';
/* __CACHE_VERSION_END__ */

const NS = 'kitsune';
const CACHE_STATIC = `${NS}-static-${CACHE_VERSION}`;
const CACHE_IMAGES = `${NS}-images-${CACHE_VERSION}`;
const CACHE_AUDIO = `${NS}-audio-${CACHE_VERSION}`;
const CACHE_LESSON = `${NS}-lesson-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `${NS}-dynamic-${CACHE_VERSION}`;

// Cache size and byte volume limits
const DEFAULT_CACHE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB default limit per cache category

const RUNTIME_CACHE_LIMITS = {
  images: { maxEntries: 80, maxSizeBytes: 15 * 1024 * 1024 },
  audio: { maxEntries: 60, maxSizeBytes: 15 * 1024 * 1024 },
  content: { maxEntries: 40, maxSizeBytes: 10 * 1024 * 1024 },
  dynamic: { maxEntries: 30, maxSizeBytes: 8 * 1024 * 1024 },
};

// Базовый путь скоупа SW
const SW_SCOPE = new URL('./', self.location).pathname;
const OFFLINE_URL = new URL('offline.html', self.location).pathname;

// ===== APPLICATION SHELL (критические ресурсы) =====
// Эти ресурсы кешируются атомарно через cache.addAll() (Promise.all семантика).
// Если хотя бы один упадёт — install завершится ошибкой, старая версия
// продолжит работу.
// В production __CORE_ASSETS_BEGIN__ / __CORE_ASSETS_END__ заменяются плагином
// на реальные хэшированные имена из dist/assets/.
const CORE_SHELL_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'offline.html',
  /* __CORE_ASSETS_BEGIN__ */
  'styles.css',
  'app.js',
  /* __CORE_ASSETS_END__ */
];

// ===== НЕОБЯЗАТЕЛЬНЫЕ РЕСУРСЫ (best-effort) =====
// Не кешируются атомарно; ошибка загрузки лишь пишется в лог.
const OPTIONAL_SHELL_ASSETS = [
  'icon.svg',
  /* __STATIC_ASSETS_BEGIN__ */
  /* __STATIC_ASSETS_END__ */
];

// ===== ПАКЕТЫ КУРСОВ (Stale-While-Revalidate) =====
// Только точка входа встроенного курса кешируется при install. Все остальные
// ресурсы пакета обнаруживаются через manifest и попадают в runtime cache.
const COURSE_ENTRY_FILES = ['data/courses/genki-1/manifest.json'];

// Паттерн для динамических chunk-файлов контента
const CONTENT_CHUNK_RE = /\/data\/(courses\/[^/]+\/.*|kanji\/.*)\.json$/;

// Паттерны для определения типа ресурса
const IMAGE_EXT_RE = /\.(webp|png|jpg|jpeg|gif|svg|ico)(\?.*)?$/i;
const AUDIO_EXT_RE = /\.(mp3|ogg|wav|m4a)(\?.*)?$/i;
const JS_EXT_RE = /\.(js|mjs)(\?.*)?$/i;
const JSON_EXT_RE = /\.json(\?.*)?$/i;

// Скомпилированные пути
const COURSE_ENTRY_PATHS = COURSE_ENTRY_FILES.map(
  (file) => new URL(file, self.location).pathname
);
const RESOLVED_STATIC_PATHS = [...CORE_SHELL_ASSETS, ...OPTIONAL_SHELL_ASSETS].map((url) => new URL(url, self.location).pathname);

// ===== HELPER FUNCTIONS =====

/**
 * Определяет тип ресурса запроса: 'image' | 'audio' | 'json' | 'js' | 'navigate' | 'other'
 * @param {Request} request
 * @returns {string}
 */
function getRequestResourceType(request) {
  if (request.mode === 'navigate') return 'navigate';
  const url = new URL(request.url);
  const path = url.pathname;
  if (IMAGE_EXT_RE.test(path)) return 'image';
  if (AUDIO_EXT_RE.test(path)) return 'audio';
  if (JSON_EXT_RE.test(path)) return 'json';
  if (JS_EXT_RE.test(path)) return 'js';
  return 'other';
}

/**
 * Проверяет, безопасно ли кешировать данный ответ.
 * @param {Request} request
 * @param {Response} response
 * @returns {boolean}
 */
function isCacheableResponse(request, response) {
  // Только GET-запросы
  if (request.method !== 'GET') return false;
  // Opaque ответы (0 status) — не кешируем, невозможно проверить ok
  if (response.type === 'opaque') return false;
  // Только успешные ответы
  if (!response.ok) return false;
  // status должен быть 200 (не redirect 301/302)
  if (response.status !== 200) return false;

  // Проверяем Content-Type не содержит неожиданный HTML для JS/JSON запросов
  const resourceType = getRequestResourceType(request);
  const contentType = response.headers.get('Content-Type') || '';
  if (resourceType === 'js' && contentType.includes('text/html')) {
    console.warn('[SW] Refusing to cache HTML response as JavaScript:', request.url);
    return false;
  }
  if (resourceType === 'json' && contentType.includes('text/html')) {
    console.warn('[SW] Refusing to cache HTML response as JSON:', request.url);
    return false;
  }

  return true;
}

/**
 * Безопасно записывает ответ в кеш, предварительно проверяя пригодность.
 * @param {Cache} cache
 * @param {Request} request
 * @param {Response} response
 * @returns {Promise<boolean>} true если запись выполнена
 */
async function safeCachePut(cache, request, response) {
  if (!isCacheableResponse(request, response)) {
    return false;
  }
  try {
    await cache.put(request, response);
    return true;
  } catch (err) {
    console.warn('[SW] cache.put failed:', request.url, err);
    return false;
  }
}

/**
 * Обрезает кеш до maxEntries записей и maxSizeBytes общего объёма (LRU — удаляет самые старые).
 * Выполняется асинхронно, не блокирует текущий ответ.
 * @param {string} cacheName
 * @param {number|{maxEntries: number, maxSizeBytes?: number}} maxEntries
 * @param {number} [maxSizeBytes]
 */
function trimCache(cacheName, maxEntries, maxSizeBytes) {
  Promise.resolve().then(async () => {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      const limitEntries = typeof maxEntries === 'object' ? maxEntries.maxEntries : maxEntries;
      const limitBytes =
        typeof maxEntries === 'object'
          ? maxEntries.maxSizeBytes || DEFAULT_CACHE_MAX_BYTES
          : maxSizeBytes || DEFAULT_CACHE_MAX_BYTES;

      const entryStats = [];
      let totalBytes = 0;

      for (const key of keys) {
        const response = await cache.match(key);
        let size = 0;
        if (response) {
          const len = response.headers.get('content-length');
          if (len && !isNaN(Number(len))) {
            size = Number(len);
          } else {
            try {
              const blob = await response.clone().blob();
              size = blob.size;
            } catch {
              size = 50 * 1024;
            }
          }
        }
        entryStats.push({ key, size });
        totalBytes += size;
      }

      const toDelete = [];

      // 1. Ограничение по количеству элементов (LRU)
      while (entryStats.length > limitEntries) {
        const item = entryStats.shift();
        totalBytes -= item.size;
        toDelete.push(item.key);
      }

      // 2. Ограничение по общему байтовому объёму (LRU)
      while (totalBytes > limitBytes && entryStats.length > 0) {
        const item = entryStats.shift();
        totalBytes -= item.size;
        toDelete.push(item.key);
      }

      if (toDelete.length > 0) {
        await Promise.all(toDelete.map((key) => cache.delete(key)));
      }
    } catch (err) {
      console.warn('[SW] trimCache error for', cacheName, err);
    }
  });
}

// Alias for backwards compatibility
// eslint-disable-next-line no-unused-vars
const limitCacheSize = trimCache;

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);

  event.waitUntil(
    (async () => {
      // 1. КРИТИЧЕСКИЙ shell — атомарно (Promise.all через cache.addAll)
      //    Если хотя бы один ресурс недоступен — install упадёт целиком.
      //    Старая версия SW продолжит работу.
      const coreUrls = CORE_SHELL_ASSETS.map((url) => new URL(url, self.location).href);
      const cache = await caches.open(CACHE_STATIC);
      await cache.addAll(coreUrls); // throws on any failure → install fails

      console.log('[SW] Critical shell cached successfully');

      // 2. НЕОБЯЗАТЕЛЬНЫЕ ресурсы — best-effort, ошибки не ломают install
      const optionalResults = await Promise.allSettled(
        OPTIONAL_SHELL_ASSETS.map(async (url) => {
          const resolved = new URL(url, self.location).href;
          try {
            await cache.add(resolved);
          } catch (err) {
            console.warn(`[SW] Optional asset failed (non-critical):`, url, err.message);
          }
        })
      );

      const failed = optionalResults.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        console.warn(`[SW] ${failed.length} optional assets failed to cache`);
      }

      // 3. Lesson JSON — best-effort (stale-while-revalidate использует это в fetch)
      const lessonCache = await caches.open(CACHE_LESSON);
      await Promise.allSettled(
        COURSE_ENTRY_FILES.map(async (url) => {
          const resolved = new URL(url, self.location).href;
          try {
            const response = await fetch(resolved);
            await safeCachePut(lessonCache, new Request(resolved), response);
          } catch (err) {
            console.warn(`[SW] Lesson file failed (non-critical):`, url, err.message);
          }
        })
      );
    })()
  );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_VERSION);

  const validCaches = new Set([
    CACHE_STATIC,
    CACHE_IMAGES,
    CACHE_AUDIO,
    CACHE_LESSON,
    CACHE_DYNAMIC,
  ]);

  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const toDelete = keys.filter((key) => {
          if (CACHE_VERSION.startsWith('dev-')) {
            return key.startsWith(`${NS}-`);
          }
          return key.startsWith(`${NS}-`) && !validCaches.has(key);
        });

        if (toDelete.length > 0) {
          console.log('[SW] Deleting old caches:', toDelete);
        }

        return Promise.all(toDelete.map((key) => caches.delete(key)));
      })
      .then(() => {
        console.log('[SW] Activated, claiming clients');
        return self.clients.claim();
      })
  );
});

// ===== MESSAGE EVENT =====
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING — activating new version');
    self.skipWaiting();
  }
});

// ===== FETCH EVENT =====
self.addEventListener('fetch', (event) => {
  // В режиме разработки (Vite dev) полностью отключаем кеширование SW, чтобы Vite отдавал свежие файлы
  if (CACHE_VERSION.startsWith('dev-')) return;

  const { request } = event;
  const url = new URL(request.url);

  // Игнорируем non-GET и запросы к другим origin (API, CDN, Fonts)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Игнорируем chrome-extension и другие non-http схемы
  if (!url.protocol.startsWith('http')) return;

  const resourceType = getRequestResourceType(request);

  // ===== НАВИГАЦИОННЫЕ ЗАПРОСЫ (Network-First) =====
  if (resourceType === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // ===== LESSON JSON (Stale-While-Revalidate) =====
  if (COURSE_ENTRY_PATHS.includes(url.pathname) || CONTENT_CHUNK_RE.test(url.pathname)) {
    event.respondWith(handleLessonRequest(request));
    return;
  }

  // ===== ИЗОБРАЖЕНИЯ (Cache-First + limit) =====
  if (resourceType === 'image') {
    event.respondWith(handleCacheFirstRequest(request, CACHE_IMAGES, RUNTIME_CACHE_LIMITS.images));
    return;
  }

  // ===== АУДИО (Cache-First + limit) =====
  if (resourceType === 'audio') {
    event.respondWith(handleCacheFirstRequest(request, CACHE_AUDIO, RUNTIME_CACHE_LIMITS.audio));
    return;
  }

  // ===== СТАТИЧЕСКИЕ ASSETS (Cache-First) =====
  // Hashed assets из /assets/ — меняют URL при изменении содержимого
  const isHashedAsset =
    url.pathname.startsWith(`${SW_SCOPE}assets/`) ||
    url.pathname.startsWith(`${SW_SCOPE}src/`) ||
    url.pathname.startsWith(`${SW_SCOPE}ui/`) ||
    url.pathname.startsWith(`${SW_SCOPE}state/`);

  if (isHashedAsset) {
    event.respondWith(handleCacheFirstRequest(request, CACHE_STATIC, null));
    return;
  }

  // Прочие статические файлы (.js, .css, known paths)
  const isStaticShell =
    RESOLVED_STATIC_PATHS.includes(url.pathname) ||
    url.pathname === SW_SCOPE ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('manifest.json');

  if (isStaticShell) {
    event.respondWith(handleCacheFirstRequest(request, CACHE_STATIC, null));
    return;
  }

  // ===== ВСЁ ОСТАЛЬНОЕ (Network-First с dynamic cache) =====
  event.respondWith(handleDynamicRequest(request));
});

// ===== FETCH STRATEGY IMPLEMENTATIONS =====

/**
 * Навигационный запрос: сеть → кеш shell → offline fallback.
 * HTML-fallback возвращается только для navigate-запросов.
 */
async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Кешируем shell index.html для будущего offline
      const cache = await caches.open(CACHE_STATIC);
      await safeCachePut(cache, request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Сеть недоступна — пробуем кеш
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback на index.html (SPA)
    const shellResponse = await caches.match(new URL('./', self.location).href) ||
      await caches.match(new URL('index.html', self.location).href);
    if (shellResponse) return shellResponse;

    // Крайний случай — offline page
    return caches.match(OFFLINE_URL);
  }
}

/**
 * Stale-While-Revalidate для lesson JSON.
 * Возвращает кеш немедленно, обновляет в фоне только при ok-ответе.
 */
async function handleLessonRequest(request) {
  const cache = await caches.open(CACHE_LESSON);
  const cachedResponse = await cache.match(request);

  // Запускаем фоновое обновление
  const revalidatePromise = fetch(request)
    .then(async (networkResponse) => {
      await safeCachePut(cache, request, networkResponse.clone());
      // Обрезаем content-кеш после обновления
      trimCache(CACHE_LESSON, RUNTIME_CACHE_LIMITS.content);
      return networkResponse;
    })
    .catch((err) => {
      console.warn('[SW] Lesson revalidate failed (serving cached):', request.url, err.message);
      return cachedResponse;
    });

  // Возвращаем кеш немедленно если есть, иначе ждём сеть
  return cachedResponse || revalidatePromise;
}

/**
 * Cache-First: сначала кеш, при промахе — сеть + кешируем.
 * @param {Request} request
 * @param {string} cacheName
 * @param {number|null} maxEntries — если null, лимит не применяется
 */
async function handleCacheFirstRequest(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    const stored = await safeCachePut(cache, request, networkResponse.clone());
    if (stored && maxEntries !== null) {
      trimCache(cacheName, maxEntries);
    }
    return networkResponse;
  } catch (err) {
    console.warn('[SW] Cache-first fetch failed:', request.url, err.message);
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

/**
 * Network-First для динамических запросов с dynamic cache.
 */
async function handleDynamicRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_DYNAMIC);
      await safeCachePut(cache, request, networkResponse.clone());
      trimCache(CACHE_DYNAMIC, RUNTIME_CACHE_LIMITS.dynamic);
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

/* ui/lazy-screen-loader.js — Centralized lazy screen loader & chunk error management */

import { setSafeHTML } from '../src/security-helpers.js';

export class ScreenLoadError extends Error {
  constructor(code, message, originalError = null, screenId = '') {
    super(message);
    this.name = 'ScreenLoadError';
    this.code = code;
    this.originalError = originalError;
    this.screenId = screenId;
  }
}

export const ERROR_CODES = {
  UNKNOWN_SCREEN: 'UNKNOWN_SCREEN',
  LAZY_CHUNK_LOAD_FAILED: 'LAZY_CHUNK_LOAD_FAILED',
  OFFLINE_CHUNK_NOT_CACHED: 'OFFLINE_CHUNK_NOT_CACHED',
  STALE_SERVICE_WORKER_CHUNK: 'STALE_SERVICE_WORKER_CHUNK',
  SCREEN_INIT_FAILED: 'SCREEN_INIT_FAILED',
};

const screenLoaders = {
  statistics: () => import('./statistics.js'),
  shop: () => import('./shop.js'),
  sensei: () => import('./chat.js'),
  'ai-story': () => import('./ai-story.js'),
  library: () => import('./stories.js'),
  story: () => import('./stories.js'),
  'dev-tools': () => import('./dev-tools.js'),
  crossword: () => import('./crossword.js'),
  'word-search': () => import('./word-search.js'),
  pomodoro: () => import('./pomodoro.js'),
  plan: () => import('./plan.js'),
  'user-dictionaries': () => import('./user-dictionaries.js'),
  'word-details': () => import('./word-details.js'),
  dictionary: () => import('./flashcards/dictionary-modal.js'),
};

const moduleCache = new Map();
const pendingLoads = new Map();

/**
 * Normalizes dynamic import errors into clean, classified ScreenLoadError instances.
 * @param {Error} err
 * @param {string} screenId
 * @returns {ScreenLoadError}
 */
export function classifyChunkError(err, screenId) {
  if (err instanceof ScreenLoadError) {
    return err;
  }

  const message = err?.message || String(err);
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Loading chunk') ||
    message.includes('Failed to load')
  ) {
    if (isOffline) {
      return new ScreenLoadError(
        ERROR_CODES.OFFLINE_CHUNK_NOT_CACHED,
        `Экран «${screenId}» требует первого запуска онлайн для сохранения в кэш.`,
        err,
        screenId
      );
    }
    return new ScreenLoadError(
      ERROR_CODES.STALE_SERVICE_WORKER_CHUNK,
      `Не удалось загрузить модуль «${screenId}». Возможно, приложение обновилось.`,
      err,
      screenId
    );
  }

  return new ScreenLoadError(
    ERROR_CODES.LAZY_CHUNK_LOAD_FAILED,
    `Ошибка при загрузке экрана «${screenId}»: ${message}`,
    err,
    screenId
  );
}

/**
 * Loads a screen module lazily with Promise deduplication and retry capability.
 * @param {string} screenId
 * @returns {Promise<any>}
 */
export async function loadScreenModule(screenId) {
  if (moduleCache.has(screenId)) {
    return moduleCache.get(screenId);
  }

  if (pendingLoads.has(screenId)) {
    return pendingLoads.get(screenId);
  }

  const loader = screenLoaders[screenId];
  if (!loader) {
    throw new ScreenLoadError(
      ERROR_CODES.UNKNOWN_SCREEN,
      `Неизвестный экран: ${screenId}`,
      null,
      screenId
    );
  }

  const loadPromise = (async () => {
    try {
      const module = await loader();
      moduleCache.set(screenId, module);
      pendingLoads.delete(screenId);
      return module;
    } catch (err) {
      pendingLoads.delete(screenId);
      moduleCache.delete(screenId);
      throw classifyChunkError(err, screenId);
    }
  })();

  pendingLoads.set(screenId, loadPromise);
  return loadPromise;
}

/**
 * Checks if a screen module is already loaded in memory.
 * @param {string} screenId
 * @returns {boolean}
 */
export function isScreenLoaded(screenId) {
  return moduleCache.has(screenId);
}

/**
 * Preloads a screen module in background if user is not on Save-Data.
 * @param {string} screenId
 * @returns {Promise<void>}
 */
export function prefetchScreen(screenId) {
  if (typeof navigator !== 'undefined' && navigator.connection?.saveData) {
    return Promise.resolve();
  }
  if (isScreenLoaded(screenId) || pendingLoads.has(screenId)) {
    return Promise.resolve();
  }
  return loadScreenModule(screenId).catch((err) => {
    console.warn(`[Prefetch] Silently ignored prefetch error for ${screenId}:`, err.message);
  });
}

/**
 * Renders loading UI indicator in the screen container while module loads.
 * @param {HTMLElement} container
 * @param {string} screenName
 */
export function showScreenLoadingUI(container, screenName = 'экран') {
  if (!container) return;
  setSafeHTML(
    container,
    `
    <div class="screen-loading-overlay" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 16px; text-align: center; color: var(--ink);">
      <div class="loader-spinner" style="width: 36px; height: 36px; border: 3px solid rgba(255,122,26,0.2); border-top-color: var(--primary, #FF7A1A); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px;"></div>
      <p style="font-size: 15px; font-weight: 500; margin: 0;">Загрузка: ${screenName}...</p>
    </div>
  `
  );
}

/**
 * Renders user-friendly error UI in screen container on chunk load failure.
 * @param {HTMLElement} container
 * @param {ScreenLoadError} error
 * @param {Function} onRetry
 */
export function showScreenErrorUI(container, error, onRetry) {
  if (!container) return;
  const isOfflineNotice = error.code === ERROR_CODES.OFFLINE_CHUNK_NOT_CACHED;
  const title = isOfflineNotice ? '📲 Требуется интернет' : '⚠️ Ошибка загрузки экрана';

  setSafeHTML(
    container,
    `
    <div class="screen-error-card" style="margin: 32px 16px; padding: 24px; background: var(--bg-card, #ffffff); border: 1.5px solid var(--border, #e0e0e0); border-radius: 16px; text-align: center;">
      <div style="font-size: 32px; margin-bottom: 12px;">${isOfflineNotice ? '📡' : '⚠️'}</div>
      <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--ink);">${title}</h3>
      <p style="font-size: 14px; color: var(--muted, #666); margin-bottom: 20px; line-height: 1.5;">${error.message}</p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        ${
          onRetry
            ? `<button class="btn-primary" id="retry-lazy-screen-btn" style="padding: 10px 20px;">🔄 Повторить попытку</button>`
            : ''
        }
        <button class="btn-ghost" id="back-home-lazy-screen-btn" style="padding: 10px 20px;">🏠 На главную</button>
      </div>
    </div>
  `
  );

  const retryBtn = container.querySelector('#retry-lazy-screen-btn');
  if (retryBtn && onRetry) {
    retryBtn.onclick = () => onRetry();
  }
  const backBtn = container.querySelector('#back-home-lazy-screen-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      if (typeof window !== 'undefined' && window.location) {
        window.location.hash = '#home';
      }
    };
  }
}

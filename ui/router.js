/* ui/router.js — Navigation and routing */
import { Router } from '../router.js';
import { installLegacyWindowApi } from '../adapters/legacy-window-api.js';

let router = null;
let renderHandlers = {};

// ---------- Router initialization ----------
export function initRouter(handlers) {
  // Сохраняем обработчики рендера
  renderHandlers = handlers;

  // Создаём экземпляр роутера
  router = new Router();
  installLegacyWindowApi({ router });

  // Регистрируем обработчики рендера для каждого экрана
  router.registerRenderHandler('home', handlers.home);
  router.registerRenderHandler('onboarding', handlers.onboarding);
  router.registerRenderHandler('course', handlers.course);
  router.registerRenderHandler('profile', handlers.profile);
  router.registerRenderHandler('chapter', handlers.chapter);
  router.registerRenderHandler('srs', handlers.srs);
  router.registerRenderHandler('dictionary', handlers.dictionary);
  router.registerRenderHandler('sensei', handlers.sensei);
  router.registerRenderHandler('library', handlers.library);
  router.registerRenderHandler('settings', handlers.settings);
  router.registerRenderHandler('dev-tools', handlers['dev-tools'] || (() => {}));
  router.registerRenderHandler('plan', handlers.plan);
  router.registerRenderHandler('story', handlers.story || (() => {}));
  router.registerRenderHandler('quests', handlers.quests);
  router.registerRenderHandler('ai-story', handlers['ai-story']);
  router.registerRenderHandler('crossword', handlers.crossword);
  router.registerRenderHandler('word-search', handlers['word-search']);
  router.registerRenderHandler('statistics', handlers.statistics);
  router.registerRenderHandler('user-dictionaries', handlers['user-dictionaries']);
  router.registerRenderHandler('word-details', handlers['word-details'] || (() => {}));

  // Инициализация обработчика истории браузера
  router.initHistoryHandler();

  // Кнопки магазина (data-nav="shop") — это модалка, а не экран роутера.
  // Роутер их игнорирует, поэтому привязываем открытие модалки напрямую.
  document.querySelectorAll('[data-nav="shop"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof renderHandlers.shop === 'function') renderHandlers.shop();
    });
  });

  return router;
}

// ---------- Navigation function ----------
export function nav(name, opt, skipHistory) {
  if (!router) {
    console.warn('⚡ Роутер не инициализирован для навигации');
    return;
  }
  router.navigate(name, opt, skipHistory);
}

// ---------- Update tab indicator ----------
export function updateTabIndicator() {
  if (!router) {
    console.error('Router not initialized. Call initRouter first.');
    return;
  }
  router.updateTabIndicator();
}

// ---------- Get current route ----------
export function getCurrentRoute() {
  if (!router) return null;
  return router.currentScreen || router.currentRoute || null;
}

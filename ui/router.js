/* ui/router.js — Navigation and routing */
import { Router } from '../router.js';

let router = null;
let renderHandlers = {};

// ---------- Router initialization ----------
export function initRouter(handlers) {
  // Сохраняем обработчики рендера
  renderHandlers = handlers;
  
  // Создаём экземпляр роутера
  router = new Router();
  
  // Регистрируем обработчики рендера для каждого экрана
  router.registerRenderHandler('home', handlers.renderHome);
  router.registerRenderHandler('profile', handlers.renderProfile);
  router.registerRenderHandler('chapter', handlers.renderChapter);
  router.registerRenderHandler('srs', handlers.renderSRSHome);
  router.registerRenderHandler('sensei', handlers.renderSensei);
  router.registerRenderHandler('library', handlers.renderLibrary);
  router.registerRenderHandler('settings', handlers.renderSettings);
  router.registerRenderHandler('plan', handlers.renderPlan);
  router.registerRenderHandler('story', () => {}); // История рендерится через openStory
  router.registerRenderHandler('quests', handlers.renderQuests);
  router.registerRenderHandler('ai-story', handlers.renderAIStory);
  router.registerRenderHandler('crossword', handlers.renderCrossword);
  
  // Инициализация обработчика истории браузера
  router.initHistoryHandler();
  
  // Устанавливаем глобальные алиасы для обратной совместимости
  window.nav = nav;
  window.updateTabIndicator = updateTabIndicator;
}

// ---------- Navigation function ----------
export function nav(name, opt, skipHistory) {
  if (!router) {
    console.error('Router not initialized. Call initRouter first.');
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
  return router.currentRoute || null;
}
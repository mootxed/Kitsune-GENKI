/* router.js — Navigation and routing controller */

import { focusScreenHeading, announceNavigation, setScreenInert } from './src/a11y-helpers.js';
import { clearActiveReviewAIContext } from './ui/flashcards/state.js';
import {
  closeSenseiPanel,
  clearPostReviewSenseiActions,
} from './ui/flashcards/sensei-review-panel.js';

// Human-readable screen titles for screen reader announcements
const SCREEN_TITLES = {
  home: 'Главная',
  onboarding: 'Введение',
  course: 'Все главы',
  profile: 'Профиль',
  chapter: 'Глава',
  srs: 'Карточки',
  dictionary: 'Словарь',
  sensei: 'Инструменты',
  library: 'Учебник',
  settings: 'Настройки',
  plan: 'План обучения',
  story: 'История',
  quests: 'Квесты',
  'ai-story': 'История ИИ',
  crossword: 'Кроссворд',
  'word-search': 'Поиск слов',
  statistics: 'Статистика',
  'user-dictionaries': 'Мои словари',
  'word-details': 'Детали слова',
};

const PARENT_TAB_MAP = {
  dictionary: 'srs',
  'user-dictionaries': 'srs',
  'ai-story': 'sensei',
  crossword: 'sensei',
  'word-search': 'sensei',
  story: 'library',
  quests: 'profile',
  statistics: 'profile',
  settings: 'profile',
  shop: 'profile',
};

export function getParentTab(screenName) {
  return PARENT_TAB_MAP[screenName] || screenName;
}

export class Router {
  constructor() {
    this.screens = [
      'home',
      'onboarding',
      'course',
      'profile',
      'chapter',
      'srs',
      'dictionary',
      'sensei',
      'library',
      'settings',
      'plan',
      'story',
      'quests',
      'ai-story',
      'crossword',
      'word-search',
      'statistics',
      'user-dictionaries',
      'word-details',
    ];
    this.renderHandlers = {};
    this.navigationId = 0;
    this.currentAbortController = null;
  }

  /**
   * Регистрация обработчика рендера для экрана
   * @param {string} screenName - Название экрана
   * @param {Function} handler - Функция рендера экрана
   */
  registerRenderHandler(screenName, handler) {
    this.renderHandlers[screenName] = handler;
  }

  /**
   * Основная функция навигации между экранами
   * @param {string} name - Название экрана для перехода
   * @param {*} opt - Опциональные параметры (например, ID главы)
   * @param {boolean} skipHistory - Пропустить добавление в историю браузера
   * @returns {Promise<void>}
   */
  async navigate(name, opt, skipHistory = false) {
    const targetName = name === 'dictionary' ? 'srs' : name;
    const targetId = `screen-${targetName}`;
    const targetScreen = document.getElementById(targetId);
    if (!targetScreen) {
      console.error(`[Router] Unknown screen: ${name}`);
      return;
    }

    const navId = ++this.navigationId;

    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    // Очищаем рендеры мини-игр при переходе на другие экраны
    if (this.currentScreen === 'word-search' && name !== 'word-search') {
      if (typeof window.cleanupWordSearch === 'function') {
        window.cleanupWordSearch();
      }
      document.body.classList.remove('ws-focus-mode');
    }
    if (this.currentScreen === 'crossword' && name !== 'crossword') {
      if (typeof window.cleanupCrossword === 'function') {
        window.cleanupCrossword();
      }
    }
    if (this.currentScreen === 'srs' && name !== 'srs') {
      closeSenseiPanel();
      clearPostReviewSenseiActions();
      clearActiveReviewAIContext();
    }

    // Восстанавливаем tabbar для обычных экранов
    if (name !== 'word-search' && name !== 'srs') {
      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';
    }

    // Accessibility: шаг 1 — сбросить фокус на body перед скрытием старого экрана
    // (aria-hidden нельзя ставить на контейнер с активным фокусом)
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

    this.currentScreen = name;

    // Шаг 2: скрыть старые экраны и поставить inert
    document.querySelectorAll('.screen').forEach((screen) => {
      const isTarget = screen.id === targetId;
      screen.classList.toggle('hidden', !isTarget);
      // Шаг 3: активировать/деактивировать inert
      setScreenInert(screen, !isTarget);
    });

    const visibleScreens = [...document.querySelectorAll('.screen:not(.hidden)')];
    if (visibleScreens.length !== 1) {
      console.warn(
        `[Router] Expected exactly one visible screen, found ${visibleScreens.length}`,
        visibleScreens.map((screen) => screen.id)
      );
    }

    // Управление активными табами
    const activeTabName = getParentTab(name);
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((t) => {
      const isDirect = t.dataset.nav === name;
      const isParent = t.dataset.nav === activeTabName;
      t.classList.toggle('active', isDirect || isParent);
    });

    // Обновление индикатора табов
    this.updateTabIndicator();

    // Добавление в историю браузера (кроме случаев, когда skipHistory=true)
    if (!skipHistory) {
      history.pushState({ screen: name, opt: opt }, '', '');
    }

    // Вызов соответствующего обработчика рендера с отслеживанием async Promise и AbortSignal
    if (this.renderHandlers[name]) {
      try {
        await Promise.resolve(this.renderHandlers[name](opt, { signal, navigationId: navId }));
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.error(`[Router] Ошибка при рендере экрана ${name}:`, err);
        }
      }
    }

    // Защита от устаревшего рендера: если за время рендера начата новая навигация — не меняем DOM и фокус
    if (this.navigationId !== navId || signal.aborted) {
      console.log(
        `[Router] Пропущен устаревший рендер для ${name} (navId ${navId}, текущий ${this.navigationId})`
      );
      return;
    }

    // Прокрутка наверх и синхронизация аватаров
    window.scrollTo(0, 0);

    // Вызываем глобальную функцию syncAvatars, если она существует
    if (typeof window.syncAvatars === 'function') {
      window.syncAvatars();
    }

    // Шаг 4: перенести фокус на заголовок нового экрана
    // Используем rAF для того, чтобы render handler успел обновить DOM
    requestAnimationFrame(() => {
      focusScreenHeading(targetScreen);
    });

    // Объявить навигацию скринридеру
    const title = SCREEN_TITLES[name] || name;
    announceNavigation(title);
  }

  /**
   * Обновление позиции индикатора активного таба
   */
  updateTabIndicator() {
    const activeTab = document.querySelector('.tab.active');
    const indicator = document.querySelector('.tab-indicator');

    if (activeTab && indicator) {
      indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      indicator.style.width = `${activeTab.offsetWidth}px`;
    }
  }

  /**
   * Инициализация обработчиков кликов для кнопок табара и навигации (делегирование на document)
   */
  initTabbarListeners() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav]');
      if (!btn) return;
      const targetScreen = btn.dataset.nav;

      if (targetScreen === 'shop') {
        // Модальное окно магазина обрабатывается отдельно
        return;
      }

      if (
        targetScreen &&
        (this.screens.includes(targetScreen) || this.renderHandlers[targetScreen])
      ) {
        e.preventDefault();
        this.navigate(targetScreen);
      }
    });
  }

  /**
   * Инициализация обработчика истории браузера (кнопка "Назад")
   */
  initHistoryHandler() {
    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.screen) {
        // Навигация с флагом skipHistory=true, чтобы не добавлять в историю снова
        this.navigate(event.state.screen, event.state.opt, true);
      } else {
        // Если истории нет (первоначальное состояние), возвращаемся на главную
        this.navigate('home', null, true);
      }
    });

    // Инициализация обработчиков табара после загрузки DOM
    this.initTabbarListeners();
  }

  /**
   * Установка начального состояния при загрузке приложения
   */
  initInitialState() {
    history.replaceState({ screen: 'home' }, '', '');
    this.navigate('home', null, true);
  }
}

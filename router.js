/* router.js — Navigation and routing controller */

import { focusScreenHeading, announceNavigation, setScreenInert } from './src/a11y-helpers.js';

// Human-readable screen titles for screen reader announcements
const SCREEN_TITLES = {
  home: 'Главная',
  onboarding: 'Введение',
  course: 'Все главы',
  profile: 'Профиль',
  chapter: 'Глава',
  srs: 'Карточки',
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
};

export class Router {
  constructor() {
    this.screens = [
      'home',
      'onboarding',
      'course',
      'profile',
      'chapter',
      'srs',
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
    ];
    this.renderHandlers = {};
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
   */
  navigate(name, opt, skipHistory = false) {
    const targetId = `screen-${name}`;
    const targetScreen = document.getElementById(targetId);
    if (!targetScreen) {
      console.error(`[Router] Unknown screen: ${name}`);
      return;
    }

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
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach((t) => {
      t.classList.toggle('active', t.dataset.nav === name);
    });

    // Обновление индикатора табов
    this.updateTabIndicator();

    // Добавление в историю браузера (кроме случаев, когда skipHistory=true)
    if (!skipHistory) {
      history.pushState({ screen: name, opt: opt }, '', '');
    }

    // Вызов соответствующего обработчика рендера
    if (this.renderHandlers[name]) {
      this.renderHandlers[name](opt);
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
   * Инициализация обработчиков кликов для кнопок табара и навигации
   */
  initTabbarListeners() {
    // Делегирование событий для всех кнопок с data-nav
    const navButtons = document.querySelectorAll('[data-nav]');

    navButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetScreen = btn.dataset.nav;

        // Проверяем, что это валидный экран
        if (this.screens.includes(targetScreen) || this.renderHandlers[targetScreen]) {
          this.navigate(targetScreen);
        }
      });
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

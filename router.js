/* router.js — Navigation and routing controller */

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

    this.currentScreen = name;

    // Переключение видимости экранов
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.toggle('hidden', screen.id !== targetId);
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

    // Перенос фокуса на заголовок нового экрана для доступности (screen readers)
    setTimeout(() => {
      const heading = targetScreen.querySelector('h1, h2, [role="heading"]');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) {
          heading.setAttribute('tabindex', '-1');
        }
        heading.focus({ preventScroll: true });
      }
    }, 50);
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

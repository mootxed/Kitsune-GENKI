/* router.js — Navigation and routing controller */

export class Router {
  constructor() {
    this.screens = [
      "home", "profile", "chapter", "srs", "sensei", 
      "library", "settings", "plan", "story", "quests", 
      "ai-story", "crossword"
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
    // Переключение видимости экранов
    this.screens.forEach((s) => {
      const screen = document.getElementById("screen-" + s);
      if (screen) {
        screen.classList.toggle("hidden", s !== name);
      }
    });

    // Управление активными табами
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((t) => {
      t.classList.toggle("active", t.dataset.nav === name);
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
  }

  /**
   * Обновление позиции индикатора активного таба
   */
  updateTabIndicator() {
    const activeTab = document.querySelector(".tab.active");
    const indicator = document.querySelector(".tab-indicator");
    
    if (activeTab && indicator) {
      indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      indicator.style.width = `${activeTab.offsetWidth}px`;
    }
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
  }

  /**
   * Установка начального состояния при загрузке приложения
   */
  initInitialState() {
    history.replaceState({ screen: 'home' }, '', '');
    this.navigate("home", null, true);
  }
}
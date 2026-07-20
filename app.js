/* app.js — Kitsune Genki main controller */

// ===== ИМПОРТЫ МОДУЛЕЙ =====

// Базовые модули
import { Router } from './router.js';
import { ACHIEVEMENTS, AchievementSystem } from './achievements.js';
import { QuestsManager } from './quests.js';
import { StudyPlan } from './studyplan.js';
import { API } from './services.js';
import { SRS } from './srs.js';
import { SessionManager } from './session-manager.js';

// Утилиты
import {
  $,
  $$,
  todayStr,
  formatTimeUntilReset,
  pluralDays,
  monthLabel,
  heatmapLevel,
} from './src/utils.js';
import {
  XP_PER_LEVEL,
  XP_CARD,
  XP_CHECK,
  XP_CHAPTER_FULL,
  COINS_PER_LEVEL,
  addXP,
  getUserRankData,
} from './src/xp-system.js';
import { cardChapter, wordById, isWordUnlocked, dueCards, allCards } from './src/srs-helpers.js';
import {
  exportFullProgress,
  validateImportData,
  importFullProgress,
  downloadJSON,
  shareJSON,
} from './src/backup-manager.js';
import { speakJapanese, stopSpeaking } from './src/audio-helper.js';

// State модуль
import {
  state,
  defaultState,
  loadState as loadStateFromStore,
  save as saveToStore,
  chState,
} from './state/store.js';

// UI модули
import {
  showCompletionScreen,
  syncAvatars,
  refreshStreakDisplay,
  applyStreakSkin,
  applyCustomTheme,
  updateSrsBadge,
} from './ui/shared.js';
import { initRouter, nav, updateTabIndicator } from './ui/router.js';
import {
  CH_NAMES,
  CHECK_ITEMS,
  LESSONS,
  CONTENT_INDEX,
  loadLessons,
  getLesson,
  ensureLesson,
  ensureLessonsForSrs,
  markActivity,
  resetDailyGoalFlag,
  startChapter,
  updateMainQuestsTimer,
  renderHome,
} from './ui/home.js';
import { renderChapter } from './ui/chapter.js';
import { renderProfile, renderQuests, claimQuest, claimAchievementReward } from './ui/profile.js';
import {
  renderFlash,
  renderDictionary,
  startExtraReview,
  setFlashQueue,
  setFlashIdx,
  setFlashRevealed,
  setFlashCtx,
  setSessionManager,
  initSessionBatching,
  resetSessionBatching,
} from './ui/flashcards.js';
import { renderShop, SHOP_ITEMS } from './ui/shop.js';
import { renderStories, openWordBottomSheet, closeWordBottomSheet } from './ui/stories.js';
import { renderSensei } from './ui/chat.js';
import { renderSettings } from './ui/settings.js';
import { renderCrossword } from './ui/crossword.js';

// ===== ГЛОБАЛЬНЫЕ ЭКСПОРТЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ =====
window.SRS = SRS;
window.QuestSystem = null; // будет инициализирован позже
window.AchievementSystem = null; // будет инициализирован позже
window.Achievements = null; // будет инициализирован позже
window.QuestsManager = null; // будет инициализирован позже
window.speakJapanese = speakJapanese; // Озвучка японского текста
window.stopSpeaking = stopSpeaking; // Остановка озвучки
window.formatTimeUntilReset = formatTimeUntilReset; // Форматирование таймера квестов
window.toast = null; // будет назначен после определения функции
window.applyTheme = null; // будет назначен после определения функции
window.showNotification = null; // будет назначен после определения функции

// ===== КОНСТАНТЫ =====
const LS_STATE = 'kitsune_state_v1';
const LS_LESSONS = 'kitsune_lessons_v1';
const LS_LESSON_VERSION = 'kitsune_lessons_version_v1';
const LS_LAST_ACTIVITY_DAY = 'kitsune_last_activity_day';
const LS_THEME = 'kitsune_theme';

// ===== WRAPPER ФУНКЦИИ ДЛЯ STATE =====
function loadState() {
  loadStateFromStore();
}

function save(immediate = false) {
  saveToStore(immediate);
}

// ===== DEPENDENCIES ОБЪЕКТ =====
function createDependencies() {
  return {
    // State functions
    save,
    loadState,
    chState,
    todayStr,

    // Navigation
    nav,
    updateTabIndicator,

    // UI utilities
    toast,
    applyTheme,
    showNotification,
    scheduleNotify,
    showCompletionScreen,
    refreshStreakDisplay,
    applyStreakSkin,
    applyCustomTheme,
    syncAvatars,
    updateSrsBadge,
    updateMainQuestsTimer,

    // Home module
    markActivity,
    startChapter,
    getLesson,
    ensureLesson,
    ensureLessonsForSrs,
    renderHome,

    // Constants
    LESSONS,
    CONTENT_INDEX,
    CH_NAMES,
    CHECK_ITEMS,
    XP_PER_LEVEL,
    XP_CARD,
    XP_CHECK,
    XP_CHAPTER_FULL,
    COINS_PER_LEVEL,
    SHOP_ITEMS,

    // XP system
    addXP: (amount) =>
      addXP(amount, state, {
        onLevelUp: (level) => toast(`🎉 Уровень ${level}! +${COINS_PER_LEVEL} 🪙`),
        onSave: save,
      }),
    appAddXP: (amount) =>
      addXP(amount, state, {
        onLevelUp: (level) => toast(`🎉 Уровень ${level}! +${COINS_PER_LEVEL} 🪙`),
        onSave: save,
      }),
    getUserRankData,

    // SRS helpers
    dueCards,
    allCards,
    cardChapter,
    wordById,
    isWordUnlocked,

    // Global objects
    SRS,
    SessionManager,
    API,
    QuestsManager,
    AchievementSystem,
    StudyPlan,

    // Backup
    exportFullProgress,
    validateImportData,
    importFullProgress,
    downloadJSON,
    shareJSON,

    // Stories
    openWordBottomSheet,
    closeWordBottomSheet,

    // Flashcards
    renderFlash,
    renderDictionary,
    startExtraReview,
    startChapterFlashcards: null, // Будет назначено в setupRouter

    // Profile
    renderProfile,
    renderQuests,
    claimQuest,
    claimAchievementReward,

    // Settings
    renderSettings,

    // Audio
    speakJapanese,
    stopSpeaking,
  };
}

// ===== TOAST ФУНКЦИЯ =====
let toastTimeout = null;
export function toast(msg, options = {}) {
  const t = $('#toast');
  if (!t) return;

  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  // Поддержка HTML контента
  if (options.html) {
    t.innerHTML = msg;
  } else {
    t.textContent = msg;
  }

  t.classList.add('show');

  const duration = options.duration !== undefined ? options.duration : 3000;
  if (duration > 0) {
    toastTimeout = setTimeout(() => {
      t.classList.remove('show');
      toastTimeout = null;
    }, duration);
  }
}

// ===== ТЕМА =====
function applyTheme() {
  const mode = state?.settings?.darkMode || 'auto';

  // Если выбрана кастомная тема, применяем её через applyCustomTheme
  if (mode === 'custom' && state?.currentTheme && state.currentTheme !== 'default') {
    applyCustomTheme();
    return;
  }

  // Иначе применяем стандартную тему (auto/light/dark)
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }

  // Сохраняем выбор в localStorage
  localStorage.setItem(LS_THEME, mode);
}

// ===== УВЕДОМЛЕНИЯ =====
function showNotification(title, body) {
  if (!('Notification' in window)) {
    console.warn('Браузер не поддерживает уведомления');
    toast('⚠️ Уведомления не поддерживаются браузером');
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon.svg' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: '/icon.svg' });
      }
    });
  }
}

function scheduleNotify() {
  // Заглушка для планировщика уведомлений
  // В будущем здесь можно реализовать логику напоминаний
  console.log('Уведомления запланированы');
}

// Экспортируем в глобальную область для обратной совместимости
window.toast = toast;
window.applyTheme = applyTheme;
window.showNotification = showNotification;

// ===== ROUTER SETUP =====
let router = null;

function setupRouter() {
  const dependencies = createDependencies();

  // Функция запуска карточек из конкретной главы
  const startChapterFlashcards = async (chapterId, chapterDue) => {
    await ensureLesson(chapterId);

    if (!chapterDue || chapterDue.length === 0) {
      toast('Нет карточек для повторения в этой главе');
      return;
    }

    // Явно переключаемся на экран SRS
    $$('.screen').forEach((s) => s.classList.add('hidden'));
    const srsScreen = document.getElementById('screen-srs');
    if (srsScreen) srsScreen.classList.remove('hidden');

    // Скрываем tabbar во время сессии
    const tabbar = document.querySelector('.tabbar');
    if (tabbar) tabbar.style.display = 'none';

    // Скрываем header и табы SRS во время сессии для полноэкранного интерфейса флэшкарточек
    const srsHeader = document.querySelector('#screen-srs .app-header');
    if (srsHeader) srsHeader.style.display = 'none';

    const tabsContainer = document.getElementById('srs-tabs-container');
    if (tabsContainer) tabsContainer.classList.add('hidden');

    // Чистый старт сессии повторения карточек главы
    setSessionManager(null);
    setFlashCtx(chapterId);
    setFlashRevealed(false);
    setFlashIdx(0);

    // Инициализируем батчинг (20 карточек на батч)
    const batchInfo = initSessionBatching(chapterDue, 20);

    if (batchInfo && batchInfo.organizedCards) {
      // Явно устанавливаем очередь с 4-блочным упорядоченным 20-карточным батчем
      setFlashQueue(batchInfo.organizedCards);
    }

    // Запускаем карточки (nav('srs') больше не нужен, т.к. мы уже переключили экран)
    renderFlash(state, dependencies);
  };

  // Назначаем функцию в dependencies
  dependencies.startChapterFlashcards = startChapterFlashcards;

  // Функция запуска сессии повторения карточек
  const startSrsSession = async () => {
    console.log('[SRS] startSrsSession triggered');

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Явно переключаемся на экран SRS
    // Скрываем все экраны
    $$('.screen').forEach((s) => s.classList.add('hidden'));

    // Показываем экран SRS
    const srsScreen = document.getElementById('screen-srs');
    if (srsScreen) {
      srsScreen.classList.remove('hidden');
      console.log('[SRS] Screen visibility toggled: #screen-srs now visible');
    }

    // Скрываем tabbar во время сессии
    const tabbar = document.querySelector('.tabbar');
    if (tabbar) {
      tabbar.style.display = 'none';
      console.log('[SRS] Tabbar hidden');
    }

    try {
      await ensureLessonsForSrs();
      const due = dueCards(state.srs);
      console.log('[SRS] Due cards:', due?.length);

      if (!due || due.length === 0) {
        toast('Нет карточек для повторения');
        // Восстанавливаем tabbar
        if (tabbar) tabbar.style.display = '';
        return;
      }

      // Чистый старт сессии повторения
      setSessionManager(null);
      setFlashCtx(null);
      setFlashRevealed(false);
      setFlashIdx(0);

      // Инициализируем батчинг (20 карточек на батч)
      console.log('[SRS] Initializing session batching...');
      const batchInfo = initSessionBatching(due, 20);
      console.log('[SRS] Batch info:', batchInfo);

      if (!batchInfo || !batchInfo.organizedCards) {
        console.error('[SRS] Failed to generate organized cards batch!');
        toast('Ошибка инициализации батча карточек');
        // Восстанавливаем tabbar
        if (tabbar) tabbar.style.display = '';
        return;
      }

      // Явно устанавливаем очередь с 4-блочным упорядоченным 20-карточным батчем
      setFlashQueue(batchInfo.organizedCards);
      console.log('[SRS] Flash queue set, length:', batchInfo.organizedCards.length);

      // Скрываем header и табы SRS во время сессии для полноэкранного интерфейса флэшкарточек
      const srsHeader = document.querySelector('#screen-srs .app-header');
      if (srsHeader) srsHeader.style.display = 'none';

      const tabsContainerSession = document.getElementById('srs-tabs-container');
      if (tabsContainerSession) tabsContainerSession.classList.add('hidden');

      console.log('[SRS] Calling renderFlash...');
      renderFlash(state, dependencies);
      console.log('[SRS] renderFlash executed successfully');
    } catch (err) {
      console.error('[SRS] Error in startSrsSession:', err);
      toast('Ошибка при запуске сессии: ' + err.message);
    }
  };

  // Рендер dashboard экрана SRS (меню с кнопками)
  const renderSrsDashboard = async () => {
    const body = $('#srs-body');
    if (!body) return;

    document.getElementById('completion-overlay')?.classList.add('hidden');

    // Показываем табы на dashboard
    const tabsContainerDashboard = document.getElementById('srs-tabs-container');
    if (tabsContainerDashboard) tabsContainerDashboard.classList.remove('hidden');

    // Привязка вкладок SRS (Повторение / Словарь)
    $$('#srs-tabs-container .lib-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === 'repetition');
      tab.onclick = () => {
        if (tab.dataset.tab === 'dictionary') {
          $$('#srs-tabs-container .lib-tab').forEach((t) =>
            t.classList.toggle('active', t === tab)
          );
          renderDictionary(state, dependencies);
        } else {
          renderSrsDashboard();
        }
      };
    });

    // Подгружаем уроки для всех карточек в SRS (ленивая загрузка)
    await ensureLessonsForSrs();

    const due = dueCards(state.srs);

    // ВСЕГДА показываем dashboard с кнопкой, даже если есть карточки к повтору
    body.innerHTML = `
      <div class="stat-row">
        <div class="stat-box"><div class="stat-num accent">${due.length}</div><div class="stat-cap">К повтору</div></div>
        <div class="stat-box"><div class="stat-num">${allCards(state.srs).length}</div><div class="stat-cap">Всего карточек</div></div>
      </div>
      <button class="btn-primary" id="srs-start-session" ${due.length === 0 ? 'disabled' : ''}>
        ${due.length === 0 ? 'Всё повторено на сегодня!' : '▶️ Начать повторение'}
      </button>
      <button class="btn-extra-review" id="srs-extra-review">➕ Доп. повторение (10 карточек)</button>
    `;

    // Привязываем обработчики к кнопкам
    const startBtn = $('#srs-start-session');
    if (startBtn && due.length > 0) {
      startBtn.onclick = () => startSrsSession();
    }

    const extraBtn = $('#srs-extra-review');
    if (extraBtn) {
      extraBtn.onclick = () => startExtraReview(state, dependencies);
    }
  };

  router = initRouter({
    home: () => renderHome(state, dependencies),
    chapter: (id) => renderChapter(parseInt(id), state, dependencies),
    srs: renderSrsDashboard,
    profile: () => renderProfile(state, dependencies),
    shop: () => renderShop(state, dependencies),
    library: () => renderStories(state, dependencies),
    sensei: () => renderSensei(state, dependencies),
    settings: () => renderSettings(state, dependencies),
    plan: () => {}, // План обучения (пока заглушка)
    quests: () => renderQuests(state, dependencies),
    'ai-story': () => {
      // AI-история рендерится через отдельный механизм
      console.log('AI-Story screen');
    },
    crossword: () => renderCrossword(state, dependencies),
  });

  // Глобальные алиасы для обратной совместимости
  window.nav = nav;
  window.updateTabIndicator = updateTabIndicator;
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
async function init() {
  // Загрузка состояния
  loadState();

  // Инициализация глобальных систем
  window.QuestsManager = QuestsManager;
  window.AchievementSystem = AchievementSystem;
  window.Achievements = AchievementSystem;

  // Инициализация квестов
  if (QuestsManager) {
    QuestsManager.initializeQuests(state);
    QuestsManager.checkQuestReset(state);
  }

  // Загрузка уроков
  await loadLessons();

  // Применение темы
  applyTheme();

  // Настройка роутера
  setupRouter();

  // Первичный рендер главного экрана: роутер при старте сам обработчик не вызывает,
  // без этого список глав остаётся пустым до первого клика по табам
  history.replaceState({ screen: 'home' }, '', '');
  nav('home', null, true);

  // Начальная отрисовка
  if (!state.initialized) {
    state.initialized = true;
    save();
  }

  // Синхронизация аватаров
  syncAvatars();

  // Обновление стрика
  refreshStreakDisplay();

  // Применение скина карточки стрика
  applyStreakSkin();

  // Применение кастомной темы (если выбрана)
  applyCustomTheme();

  // Скрытие загрузочного экрана после полной инициализации
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.style.transition = 'opacity 0.3s ease';
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  }
}

// ===== SERVICE WORKER РЕГИСТРАЦИЯ =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        console.log('✅ Service Worker зарегистрирован');

        // Отслеживание обновлений SW
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🔄 Обнаружено обновление Service Worker');

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Новая версия доступна!
              console.log('✨ Новая версия приложения готова');
              showUpdateNotification(newWorker);
            }
          });
        });
      })
      .catch((err) => {
        console.error('❌ Ошибка регистрации Service Worker:', err);
      });
  });

  // Автоматическая перезагрузка при активации нового SW
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔄 Активирован новый Service Worker, перезагрузка...');
    window.location.reload();
  });
}

// Показ уведомления об обновлении
function showUpdateNotification(worker) {
  const message = `
    <span style="flex: 1;">Доступна новая версия приложения</span>
    <button id="sw-update-btn" style="
      margin-left: 12px;
      padding: 6px 16px;
      background: var(--accent, #FF7A1A);
      border: none;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 14px;
    ">
      Обновить
    </button>
  `;

  toast(message, { html: true, duration: 0 }); // duration: 0 = не исчезает автоматически

  // Обработчик клика на кнопку обновления
  setTimeout(() => {
    const updateBtn = document.getElementById('sw-update-btn');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        console.log('👆 Пользователь запросил обновление');
        worker.postMessage({ type: 'SKIP_WAITING' });

        // Закрываем toast
        const t = $('#toast');
        if (t) t.classList.remove('show');
      });
    }
  }, 100);
}

// ===== ЗАПУСК =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

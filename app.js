/* app.js — Kitsune Genki main controller */

// ===== ИМПОРТЫ МОДУЛЕЙ =====

// Базовые модули
import { Router } from './router.js';
import { ACHIEVEMENTS, AchievementSystem } from './achievements.js';
import { QuestsManager } from './quests.js';
import { STORIES } from './stories.js';
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
  loadLessons,
  getLesson,
  markActivity,
  resetDailyGoalFlag,
  startChapter,
  updateMainQuestsTimer,
  renderHome,
} from './ui/home.js';
import { renderChapter } from './ui/chapter.js';
import { renderProfile, renderQuests, claimQuest, claimAchievementReward } from './ui/profile.js';
import { renderFlash, renderDictionary, startExtraReview } from './ui/flashcards.js';
import { renderShop, SHOP_ITEMS } from './ui/shop.js';
import { renderStories, openWordBottomSheet, closeWordBottomSheet } from './ui/stories.js';
import { renderSensei } from './ui/chat.js';
import { renderSettings } from './ui/settings.js';

// ===== ГЛОБАЛЬНЫЕ ЭКСПОРТЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ =====
window.SRS = SRS;
window.QuestSystem = null; // будет инициализирован позже
window.AchievementSystem = null; // будет инициализирован позже
window.Achievements = null; // будет инициализирован позже
window.QuestsManager = null; // будет инициализирован позже

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

    // Navigation
    nav,
    updateTabIndicator,

    // UI utilities
    toast,
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
    renderHome,

    // Constants
    LESSONS,
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
    STORIES,
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

    // Profile
    renderProfile,
    renderQuests,
    claimQuest,
    claimAchievementReward,

    // Settings
    renderSettings,
  };
}

// ===== TOAST ФУНКЦИЯ =====
let toastTimeout = null;
function toast(msg, options = {}) {
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

// ===== ROUTER SETUP =====
let router = null;

function setupRouter() {
  const dependencies = createDependencies();

  router = initRouter({
    home: () => renderHome(state, dependencies),
    chapter: (id) => renderChapter(parseInt(id), state, dependencies),
    srs: () => {
      const body = $('#srs-body');
      if (!body) return;

      // Простая заглушка для SRS - основная логика в ui/flashcards.js
      const due = dueCards(state.srs);
      if (due.length === 0) {
        body.innerHTML = `
          <div class="stat-row">
            <div class="stat-box"><div class="stat-num accent">0</div><div class="stat-cap">К повтору</div></div>
            <div class="stat-box"><div class="stat-num">${allCards(state.srs).length}</div><div class="stat-cap">Всего карточек</div></div>
          </div>
          <button class="btn-primary" disabled>Всё повторено на сегодня!</button>
          <button class="btn-extra-review" id="srs-extra-review">➕ Доп. повторение (10 карточек)</button>
        `;

        const extraBtn = $('#srs-extra-review');
        if (extraBtn) {
          extraBtn.onclick = () => startExtraReview(state, dependencies);
        }
      } else {
        renderFlash(state, dependencies);
      }
    },
    profile: () => renderProfile(state, dependencies),
    shop: () => renderShop(state, dependencies),
    library: () => renderStories(state, dependencies),
    sensei: () => renderSensei(state, dependencies),
    settings: () => renderSettings(state, dependencies),
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
}

// ===== SERVICE WORKER РЕГИСТРАЦИЯ =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
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

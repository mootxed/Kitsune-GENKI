/* app.js — Kitsune Genki main controller */

import './styles.css';

// ===== ИМПОРТЫ МОДУЛЕЙ =====

// Базовые модули
import { AchievementSystem } from './achievements.js';
import { QuestsManager } from './quests.js';
import { StudyPlan } from './studyplan.js';
import { API } from './services.js';
import { SRS } from './srs.js';
import { SessionManager } from './session-manager.js';

// IndexedDB модули
import { initializeDB } from './src/db.js';
import { migrateFromLocalStorage } from './src/migration.js';
import { localDateKey } from './src/local-date.js';
import { getDailyStudyDigest } from './src/daily-study-digest.js';
import { evaluateAndCompleteChapter } from './src/chapter-progress.js';
import { initTabSync } from './src/tab-sync.js';

// Утилиты
import { $, $$, todayStr, formatTimeUntilReset } from './src/utils.js';
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
import { limitNewCardsForSession } from './src/srs-limits.js';
import {
  exportFullProgress,
  validateImportData,
  importFullProgress,
  downloadJSON,
  shareJSON,
} from './src/backup-manager.js';
import { speakJapanese, stopSpeaking } from './src/audio-helper.js';
import { registerAndManageSW, activateWaitingWorker } from './src/sw-update-manager.js';
import { announce } from './src/a11y-helpers.js';

// State модуль
import {
  state,
  loadState as loadStateFromStore,
  save as saveToStore,
  chState,
  isStorageDegraded,
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
  startChapter,
  updateMainQuestsTimer,
  renderHome,
  renderCourse,
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
} from './ui/flashcards.js';
import { renderShop, SHOP_ITEMS } from './ui/shop.js';
import { renderStories, openWordBottomSheet, closeWordBottomSheet } from './ui/stories.js';
import { renderSensei, setChatHistory, importReviewExplanationToChat } from './ui/chat.js';
import { renderSettings } from './ui/settings.js';
import { renderCrossword } from './ui/crossword.js';
import { renderParticlesList } from './ui/particles.js';
import { renderPlan } from './ui/plan.js';
import { renderAIStory } from './ui/ai-story.js';
import { renderWordSearch } from './ui/word-search.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderStatistics } from './ui/statistics.js';
import { renderUserDictionaries } from './ui/user-dictionaries.js';
import { refreshUserDictionaryLesson } from './src/user-dictionaries/runtime.js';
import { shouldShowOnboarding } from './src/onboarding-state.js';

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
const LS_THEME = 'kitsune_theme';

// ===== WRAPPER ФУНКЦИИ ДЛЯ STATE =====
async function loadState() {
  await loadStateFromStore();
  if (state?.chatHistory) {
    setChatHistory(state.chatHistory);
  }
}

function save(immediate = false) {
  return saveToStore(immediate);
}

// ===== DEPENDENCIES ОБЪЕКТ =====
function createDependencies() {
  return {
    // State functions & getters
    state,
    getAISettings: () => state.settings,
    acceptAIPrivacy: () => {
      if (state?.settings) state.settings.aiPrivacyAccepted = true;
      return save();
    },
    importReviewExplanationToChat,
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
    onReviewCommitted: (card) => {
      state.dailyPlan = null;
      const chapterId = cardChapter(card?.id);
      const chapter = getLesson(chapterId);
      if (!chapter) return;
      const chapters = CONTENT_INDEX.map((entry) => (entry.id === chapterId ? chapter : entry));
      const completion = evaluateAndCompleteChapter(state, chapterId, {
        chapters,
        recalculatePlan: StudyPlan.recalculateFuturePlan,
      });
      if (completion.rewardGranted) {
        addXP(XP_CHAPTER_FULL, state);
        toast(`🎉 Глава пройдена! +${XP_CHAPTER_FULL} XP!`);
      }
    },
    onReviewUndone: () => {
      state.dailyPlan = null;
    },

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
let activeNotifyTimer = null;
let oneHourRemindTimer = null;

function showNotification(title, body, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('Браузер не поддерживает уведомления');
    if (options.isTest) {
      toast('⚠️ Уведомления не поддерживаются браузером');
    }
    return false;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon.svg' });
    return true;
  } else if (Notification.permission !== 'denied' && options.requestPermission !== false) {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: '/icon.svg' });
      }
    });
  }
  return false;
}

function calculateNextNotificationDate(notifyTimeStr, notifyDays, now = new Date()) {
  if (!notifyTimeStr || !Array.isArray(notifyDays) || notifyDays.length === 0) {
    return null;
  }

  const [hoursStr, minutesStr] = notifyTimeStr.split(':');
  const targetHours = parseInt(hoursStr, 10) || 12;
  const targetMinutes = parseInt(minutesStr, 10) || 0;

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const candidate = new Date(now.getTime());
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(targetHours, targetMinutes, 0, 0);

    const dayOfWeek = candidate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    if (notifyDays.includes(dayOfWeek)) {
      if (candidate.getTime() > now.getTime()) {
        return candidate;
      }
    }
  }

  return null;
}

function scheduleNotify() {
  if (activeNotifyTimer) {
    clearTimeout(activeNotifyTimer);
    activeNotifyTimer = null;
  }

  const s = state?.settings;
  if (!s || !s.notifyEnabled) return;
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'granted'
  ) {
    return;
  }

  const targetDate = calculateNextNotificationDate(s.notifyTime, s.notifyDays, new Date());
  if (!targetDate) return;

  const msUntilTrigger = targetDate.getTime() - Date.now();
  if (msUntilTrigger <= 0) return;

  activeNotifyTimer = setTimeout(() => {
    activeNotifyTimer = null;
    triggerScheduledNotification();
  }, msUntilTrigger);
}

function triggerScheduledNotification() {
  const s = state?.settings;
  if (!s || !s.notifyEnabled) return;
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'granted'
  ) {
    return;
  }

  const digest = getDailyStudyDigest(state);
  if (digest.isComplete) {
    scheduleNotify();
    return;
  }

  const todayKey = localDateKey();
  const notifState = s.notificationState || {};

  if (
    notifState.lastDailyDigestDate === todayKey &&
    notifState.lastDailyDigestSlot === s.notifyTime
  ) {
    scheduleNotify();
    return;
  }

  let notifBody = '';
  if (digest.dueReviewCards > 0 && digest.availableNewItems > 0) {
    notifBody = `${digest.dueReviewCards} повторения и ${digest.availableNewItems} новых слов — примерно ${digest.estimatedMinutes} минут.`;
  } else if (digest.dueReviewCards > 0) {
    notifBody = `На сегодня ${digest.dueReviewCards} повторений — ${digest.durationText}.`;
  } else if (digest.availableNewItems > 0) {
    notifBody = `На сегодня доступно ${digest.availableNewItems} новых слов — ${digest.durationText}.`;
  }

  if (digest.cardsToDailyGoal > 0) {
    notifBody += ` До цели осталось ${digest.cardsToDailyGoal} карточки.`;
  }

  const sent = showNotification('Kitsune Genki 🦊', notifBody, { requestPermission: false });
  if (sent) {
    s.notificationState = {
      lastDailyDigestDate: todayKey,
      lastDailyDigestSlot: s.notifyTime,
    };
    save();
  }

  scheduleNotify();
}

function scheduleOneHourReminder() {
  if (oneHourRemindTimer) {
    clearTimeout(oneHourRemindTimer);
    oneHourRemindTimer = null;
  }

  const ONE_HOUR_MS = 60 * 60 * 1000;
  oneHourRemindTimer = setTimeout(() => {
    oneHourRemindTimer = null;
    const digest = getDailyStudyDigest(state);
    const body = digest.isComplete
      ? 'На сегодня всё выполнено 🎉'
      : `${digest.summaryText} — ${digest.durationText}.`;
    showNotification('Kitsune Genki 🦊', `Напоминание: ${body}`);
  }, ONE_HOUR_MS);

  toast('⏰ Напоминание установлено через 1 час');
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state?.settings?.notifyEnabled) {
      scheduleNotify();
    }
  });
}

// Экспортируем в глобальную область для обратной совместимости
window.toast = toast;
window.applyTheme = applyTheme;
window.showNotification = showNotification;
window.scheduleNotify = scheduleNotify;
window.scheduleOneHourReminder = scheduleOneHourReminder;

// ===== ROUTER SETUP =====
let router = null;

function setupRouter() {
  const dependencies = createDependencies();

  const activateSessionBatch = (batchInfo, chapterId = null) => {
    if (!batchInfo?.organizedCards?.length) return false;

    setFlashQueue(batchInfo.organizedCards);
    setFlashCtx(chapterId);
    setSessionManager(
      new SessionManager(batchInfo.organizedCards, {
        srs: SRS,
        questsManager: QuestsManager,
        state,
        onSave: save,
      })
    );
    return true;
  };

  // Функция запуска карточек из конкретной главы
  const startChapterFlashcards = async (chapterId, chapterDue) => {
    await ensureLesson(chapterId);

    if (!chapterDue || chapterDue.length === 0) {
      toast('Нет карточек для повторения в этой главе');
      return;
    }

    // Явно переключаемся на экран SRS (снимаем inert и aria-hidden)
    if (router) {
      router.navigate('srs');
    } else {
      nav('srs');
    }

    // Чистый старт сессии повторения карточек главы
    setSessionManager(null);
    setFlashCtx(chapterId);
    setFlashRevealed(false);
    setFlashIdx(0);

    const sessionCards = limitNewCardsForSession(chapterDue, state.srs);
    if (sessionCards.length === 0) {
      toast('Лимит новых карточек на сегодня исчерпан');
      renderSrsDashboard();
      return;
    }

    // Фиксируем выданные новые карточки до начала сессии.
    save();

    // Инициализируем батчинг (20 карточек на батч)
    const batchInfo = initSessionBatching(sessionCards, LESSONS, 20);

    if (!activateSessionBatch(batchInfo, chapterId)) {
      toast('Ошибка инициализации батча карточек');
      renderSrsDashboard();
      return;
    }

    // Запускаем карточки
    renderFlash(state, dependencies);
  };

  // Назначаем функцию в dependencies
  dependencies.startChapterFlashcards = startChapterFlashcards;

  // Функция запуска сессии повторения карточек
  const startSrsSession = async () => {
    // Явно переключаемся на экран SRS (снимаем inert и aria-hidden)
    if (router) {
      router.navigate('srs');
    } else {
      nav('srs');
    }

    // Скрываем tabbar во время сессии
    const tabbar = document.querySelector('.tabbar');
    if (tabbar) {
      tabbar.style.display = 'none';
    }

    try {
      await ensureLessonsForSrs();
      const due = dueCards(state.srs);

      if (!due || due.length === 0) {
        toast('Нет карточек для повторения');
        renderSrsDashboard();
        return;
      }

      const sessionCards = limitNewCardsForSession(due, state.srs);
      if (sessionCards.length === 0) {
        toast('Лимит новых карточек на сегодня исчерпан');
        renderSrsDashboard();
        return;
      }

      // Фиксируем выданные новые карточки сразу, чтобы лимит сохранялся между сессиями.
      save();

      // Чистый старт сессии повторения
      setSessionManager(null);
      setFlashCtx(null);
      setFlashRevealed(false);
      setFlashIdx(0);

      // Инициализируем батчинг (20 карточек на батч)
      const batchInfo = initSessionBatching(sessionCards, LESSONS, 20);

      if (!batchInfo || !batchInfo.organizedCards) {
        console.error('[SRS] Failed to generate organized cards batch!');
        toast('Ошибка инициализации батча карточек');
        renderSrsDashboard();
        return;
      }

      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Полностью очищаем #srs-body от dashboard HTML
      const srsBody = document.getElementById('srs-body');
      if (srsBody) {
        srsBody.innerHTML = '';
      }

      renderFlash(state, dependencies);
    } catch (err) {
      console.error('[SRS] Error in startSrsSession:', err);
      toast('Ошибка при запуске сессии: ' + err.message);
      renderSrsDashboard();
    }
  };

  // Рендер dashboard экрана SRS (меню с кнопками)
  const renderSrsDashboard = async () => {
    const body = $('#srs-body');
    if (!body) return;

    // Восстанавливаем видимость header и tabbar на dashboard
    const srsScreen = document.getElementById('screen-srs');
    if (srsScreen) srsScreen.classList.remove('srs-session-active');
    document.body.classList.remove('srs-session-active');

    const srsHeader = document.querySelector('#screen-srs .app-header');
    if (srsHeader) {
      srsHeader.style.display = 'flex';
    }

    const tabbar = document.querySelector('.tabbar');
    if (tabbar) tabbar.style.display = '';

    document.getElementById('completion-overlay')?.classList.add('hidden');

    // Показываем табы на dashboard
    const tabsContainerDashboard = document.getElementById('srs-tabs-container');
    if (tabsContainerDashboard) {
      tabsContainerDashboard.classList.remove('hidden');
      tabsContainerDashboard.style.display = '';
    }

    // Привязка вкладок SRS (Повторение / Словарь / Частицы)
    $$('#srs-tabs-container .lib-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === 'repetition');
      tab.onclick = () => {
        if (tab.dataset.tab === 'dictionary') {
          $$('#srs-tabs-container .lib-tab').forEach((t) =>
            t.classList.toggle('active', t === tab)
          );
          renderDictionary(state, dependencies);
        } else if (tab.dataset.tab === 'particles') {
          $$('#srs-tabs-container .lib-tab').forEach((t) =>
            t.classList.toggle('active', t === tab)
          );
          renderParticlesDictionary();
        } else if (tab.dataset.tab === 'user-dictionaries') {
          router.navigate('user-dictionaries');
        } else {
          renderSrsDashboard();
        }
      };
    });

    // Подгружаем уроки для всех карточек в SRS (ленивая загрузка)
    await ensureLessonsForSrs();

    const digest = getDailyStudyDigest(state);

    // ВСЕГДА показываем dashboard с кнопкой, даже если есть карточки к повтору
    body.innerHTML = `
      <div class="stat-row" data-testid="srs-stat-row">
        <div class="stat-box" data-testid="stat-reviews"><div class="stat-num accent">${digest.dueReviewCards}</div><div class="stat-cap">Повторения</div></div>
        <div class="stat-box" data-testid="stat-new"><div class="stat-num" style="color:var(--primary, #ff8a2b)">${digest.availableNewItems}</div><div class="stat-cap">Новые слова</div></div>
        <div class="stat-box" data-testid="stat-total"><div class="stat-num">${digest.durationText}</div><div class="stat-cap">Примерное время</div></div>
      </div>
      <button class="btn-primary" id="srs-start-session" data-testid="srs-start-btn" ${digest.availableCardCount === 0 ? 'disabled' : ''}>
        ${digest.availableCardCount === 0 ? 'Всё повторено на сегодня!' : `▶️ Начать SRS (${digest.availableCardCount})`}
      </button>
      <button class="btn-extra-review" id="srs-extra-review">➕ Практика без изменения расписания</button>
    `;

    // Привязываем обработчики к кнопкам
    const startBtn = $('#srs-start-session');
    if (startBtn && digest.availableCardCount > 0) {
      startBtn.onclick = () => startSrsSession();
    }

    const extraBtn = $('#srs-extra-review');
    if (extraBtn) {
      extraBtn.onclick = () => startExtraReview(state, dependencies);
    }
  };

  router = initRouter({
    home: () => renderHome(state, dependencies),
    course: () => renderCourse(state, dependencies),
    chapter: (id) => renderChapter(parseInt(id), state, dependencies),
    srs: renderSrsDashboard,
    profile: () => renderProfile(state, dependencies),
    shop: () => renderShop(state, dependencies),
    library: () => renderStories(state, dependencies),
    sensei: () => renderSensei(state, dependencies),
    settings: () => renderSettings(state, dependencies),
    plan: () => renderPlan(state, dependencies),
    quests: () => renderQuests(state, dependencies),
    'ai-story': () => renderAIStory(state, dependencies),
    crossword: () => renderCrossword(state, dependencies),
    'word-search': () => renderWordSearch(state, dependencies),
    onboarding: () => renderOnboarding(state, dependencies),
    statistics: () => renderStatistics(state),
    'user-dictionaries': (options) =>
      renderUserDictionaries(
        state,
        {
          ...dependencies,
          refreshRuntime: () => refreshUserDictionaryLesson(LESSONS, undefined, state),
        },
        options
      ),
  });

  // Глобальные алиасы для обратной совместимости
  window.nav = nav;
  window.updateTabIndicator = updateTabIndicator;
}

export function checkStorageDegradedBanner() {
  if (!isStorageDegraded()) return;
  let banner = document.getElementById('storage-warning-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'storage-warning-banner';
    banner.className = 'storage-warning-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <span>⚠️ Хранилище недоступно. Прогресс не будет сохранён при очистке браузера.</span>
      <button id="storage-warning-export-btn" class="btn-sm">Скачать экспорт</button>
    `;
    const appElem = document.getElementById('app');
    if (appElem) appElem.insertBefore(banner, appElem.firstChild);
  }
  const btn = document.getElementById('storage-warning-export-btn');
  if (btn) {
    btn.onclick = async () => {
      try {
        const data = await exportFullProgress();
        downloadJSON(data, `kitsune-backup-${new Date().toISOString().slice(0, 10)}.json`);
      } catch (err) {
        toast('Ошибка экспорта: ' + err.message);
      }
    };
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
async function init() {
  try {
    // 1. Инициализация IndexedDB
    await initializeDB();
    // App reviews are persisted through the transactional outbox in app_state.
    // The optional SRS logger remains available for diagnostics and isolated use.
    SRS.setReviewLogger(null);

    // 2. Миграция из localStorage (если нужна)
    await migrateFromLocalStorage();

    // 3. Загрузка состояния из IndexedDB
    await loadState();

    // Инициализация синхронизации вкладок
    initTabSync(() => {
      toast('⚠️ Приложение уже открыто в другой вкладке. Автосохранение отключено.', {
        duration: 8000,
      });
    });

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
    const userDictionaryRuntime = await refreshUserDictionaryLesson(LESSONS, undefined, state);
    if (userDictionaryRuntime.added > 0) await save(true);

    // Применение темы
    applyTheme();

    // Настройка роутера
    setupRouter();

    // Первичная маршрутизация: проверяем необходимость показа Onboarding
    if (shouldShowOnboarding(state)) {
      history.replaceState({ screen: 'onboarding' }, '', '');
      nav('onboarding', null, true);
    } else {
      history.replaceState({ screen: 'home' }, '', '');
      nav('home', null, true);
    }

    state.initialized = true;
    checkStorageDegradedBanner();

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
      loader.classList.add('hidden');
      loader.style.pointerEvents = 'none';
      loader.style.transition = 'opacity 0.3s ease';
      loader.style.opacity = '0';
      setTimeout(() => {
        if (loader.parentNode) loader.remove();
      }, 300);
    }
  } catch (error) {
    console.error('[Init] ❌ Критическая ошибка инициализации:', error);

    // Показываем пользователю сообщение об ошибке
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <h2 style="color: var(--danger, #f44336); margin-bottom: 16px;">⚠️ Ошибка загрузки</h2>
          <p style="margin-bottom: 16px;">Не удалось инициализировать приложение</p>
          <button onclick="location.reload()" style="
            padding: 12px 24px;
            background: var(--primary, #FF7A1A);
            color: white;
            border: none;
            border-radius: 12px;
            font-weight: 600;
            cursor: pointer;
          ">Перезагрузить</button>
        </div>
      `;
    }
  }
}

// ===== SERVICE WORKER РЕГИСТРАЦИЯ =====
// Использует src/sw-update-manager.js для чистой координации обновлений.
// Защита от бесконечного reload loop — через sessionStorage флаг.
// Автоматического reload при controllerchange НЕТ — только по действию пользователя.

window.addEventListener('load', async () => {
  if (import.meta.env.DEV) {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
    return;
  }
  const swUrl = `${import.meta.env.BASE_URL}sw.js`;
  await registerAndManageSW(swUrl, {
    onUpdateAvailable(waitingWorker) {
      showUpdateNotification(waitingWorker);
    },
    onUpdateActivated() {
      announce('Приложение обновлено');
    },
    onStatusChange(status) {
      if (status === 'ready') {
        console.log('[App] Service Worker: приложение готово к офлайн-работе');
      } else if (status === 'failed') {
        console.warn('[App] Service Worker: регистрация не удалась — офлайн недоступен');
      } else if (status === 'unsupported') {
        console.info('[App] Service Worker не поддерживается этим браузером');
      } else if (status === 'updated') {
        console.log('[App] Service Worker: новая версия активирована');
      }
    },
  });
});

/**
 * Показывает ненавязчивое уведомление об обновлении с кнопками «Обновить» и «Позже».
 * Не перезагружает страницу автоматически — только по явному действию пользователя.
 */
function showUpdateNotification(waitingWorker) {
  const message = `
    <span style="flex: 1;">🔄 Доступна новая версия</span>
    <button id="sw-update-btn" style="
      margin-left: 8px;
      padding: 6px 14px;
      background: var(--primary, #FF4B2B);
      border: none;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    " aria-label="Обновить приложение до новой версии">
      Обновить
    </button>
    <button id="sw-later-btn" style="
      margin-left: 6px;
      padding: 6px 10px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.4);
      border-radius: 8px;
      color: inherit;
      cursor: pointer;
      font-size: 13px;
    " aria-label="Обновить позже, продолжить работу">
      Позже
    </button>
  `;

  toast(message, { html: true, duration: 0 }); // duration: 0 = не закрывается автоматически
  announce('Доступна новая версия приложения');

  setTimeout(() => {
    const updateBtn = document.getElementById('sw-update-btn');
    const laterBtn = document.getElementById('sw-later-btn');

    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        // Отправляем SKIP_WAITING ожидающему SW
        // controllerchange отлавливает sw-update-manager и выполнит reload
        activateWaitingWorker(waitingWorker);

        // Закрываем toast, показываем индикатор загрузки
        const t = $('#toast');
        if (t) {
          t.textContent = 'Обновление...';
          // toast закроется при перезагрузке страницы
        }
      });
    }

    if (laterBtn) {
      laterBtn.addEventListener('click', () => {
        // Пользователь выбрал «Позже» — просто закрываем уведомление
        // При следующем запуске updatefound снова сработает
        const t = $('#toast');
        if (t) t.classList.remove('show');
        console.log('[App] SW update deferred by user');
      });
    }
  }, 100);
}

// ===== ФУНКЦИЯ ОТОБРАЖЕНИЯ СЛОВАРЯ ЧАСТИЦ =====
async function renderParticlesDictionary() {
  const dependencies = createDependencies();
  renderParticlesList(dependencies);
}

// ===== ОБРАБОТЧИКИ ЗАКРЫТИЯ / СВЕРТЫВАНИЯ СТРАНИЦЫ ПРИЛОЖЕНИЯ =====
// Гарантируем принудительное немедленное сохранение данных в localStorage и IndexedDB
function handleAppUnload() {
  save(true);
}

window.addEventListener('beforeunload', handleAppUnload);
window.addEventListener('pagehide', handleAppUnload);
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleAppUnload();
    }
  });
}

// ===== ЗАПУСК =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* state/store.js — Centralized state management with versioning, migrations, and subscriptions */

import { SRS } from '../srs.js';
import { db, STORES } from '../src/db.js';
import { appendReviewLog, clearReviewLogs } from '../src/review-log.js';
import { acknowledgeReviewLogs, compactReviewJournal } from '../src/review-journal.js';
import { normalizeVocabularyLockState } from '../src/vocabulary-unlock-plan.js';
import { hasMeaningfulUserProgress } from '../src/onboarding-state.js';
import { isPrimaryTab, broadcastStateUpdated, getTabId, yieldLeadership } from '../src/tab-sync.js';
import { safeStorage } from '../src/safe-storage.js';
import { normalizeChatHistory } from '../src/ai/chat-history.js';
import { migrateLegacyOpenRouterKey, clearOpenRouterKey } from '../src/openrouter-key.js';
import { migrateGenkiVocabularyState } from '../src/courses/genki-1/migrations/vocabulary-state.js';
import { DEFAULT_COURSE_ID } from '../src/courses/course-registry.js';
import {
  bindActiveCourseProgress,
  createEmptyCourseProgress,
  syncActiveCourseProgress,
} from '../src/courses/course-state.js';
import {
  GENKI_1_CONTENT_VERSION,
  migrateGenki1StateV15,
} from '../src/courses/genki-1/migrations/state-v15.js';
import { migrateDictionaryStateV16 } from '../src/dictionary/state-v16.js';
import {
  createDefaultPomodoroSettings,
  createDefaultPomodoroState,
  normalizePomodoroSettings,
  normalizePomodoroState,
} from '../src/pomodoro/pomodoro-state.js';

import { STATE_SCHEMA_VERSION } from '../src/app-metadata.js';

// Legacy storage key retained for backward compatibility with existing user data
const LS_STATE = 'kitsune_state_v1';

const CURRENT_VERSION = STATE_SCHEMA_VERSION;
export { STATE_SCHEMA_VERSION as CURRENT_VERSION };

import { migrateState } from './migrations/index.js';

// Глобальное состояние приложения
export let state = null;

// Подписчики на изменения state
const subscribers = new Set();

// ---------- Migrations Runner ----------
export function runMigrations(loadedState) {
  return migrateState(loadedState, CURRENT_VERSION, { defaultState });
}

// ---------- Default State ----------
export function defaultState() {
  const freshState = {
    version: CURRENT_VERSION,
    revision: 1,
    updatedAt: Date.now(),
    initialized: false,
    lastErrors: [],
    onboarding: {
      schemaVersion: 1,
      completed: false,
      currentStep: 0,
      draft: null,
      completedAt: null,
    },
    chapters: {}, // id -> {started, checklist:{}}
    priorKnowledgeChapterIds: [], // главы, изученные пользователем вне приложения
    activeChapterId: null, // единый указатель на главу для «Продолжить обучение»
    learningEvents: [], // фактические события разделов/глав для плана, отдельно от dailyCards
    vocabularyUnlocks: {}, // chapterId -> { dateKey -> { itemIds, occurredAt } }
    grammarUnlocks: {}, // chapterId -> { dateKey -> topicIds[] }
    grammarProgress: {}, // chapterId -> { topicId -> attempts/check result }
    practiceUnlocks: {}, // chapterId -> { dateKey -> taskIds[] }
    dailyPlan: null,
    dailyPlanHistory: [],
    dailyCapacityMinutes: 30,
    workbookSettings: {
      enabled: true,
      includeConversationGrammar: true,
      includeReadingWriting: true,
    },
    srs: {}, // cardId -> SRS record
    reviewEvents: [], // ограниченное окно событий; полные snapshot остаются только для Undo
    masteryArchive: {}, // агрегированные доказательства из свёрнутых review events
    vocabularyMigrationArchive: {
      schemaVersion: 1,
      mergedCards: {},
      retiredCards: {},
      retiredMastery: {},
    },
    dictionaryMigrationArchive: {
      schemaVersion: 1,
      sourceStateVersion: CURRENT_VERSION,
      aliases: {},
      mergedCards: {},
      mergedMastery: {},
    },
    pendingReviewLogs: [], // transactional outbox для append-only review_log
    miniGameWordHistory: {
      wordSearch: { recentSessions: [] },
      crossword: { recentSessions: [] },
    },
    streak: { count: 0, lastActive: null },
    savedNotes: [], // {id,title,content,date}
    settings: {
      model: 'deepseek/deepseek-v4-flash',
      notifyEnabled: false,
      notifyTime: '12:00',
      notifyDays: [1, 2, 3, 4, 5, 6, 0],
      notificationState: { lastDailyDigestDate: null, lastDailyDigestSlot: null },
      darkMode: 'auto',
      hideRomaji: false,
      pomodoro: createDefaultPomodoroSettings(),
    },
    pomodoro: createDefaultPomodoroState(),
    chatHistory: [], // normalized AI chat messages; legacy role/content is accepted on load
    xp: 0,
    level: 1,
    coins: 0,
    dailyCards: 0,
    history: {}, // {"YYYY-MM-DD": count}
    currentAvatar: '🦊',
    unlockedAvatars: ['🦊'],
    currentStreakSkin: 'default',
    unlockedStreakSkins: ['default'],
    currentTheme: 'default',
    unlockedThemes: ['default'],
    currentTitle: 'Новичок',
    unlockedTitles: ['Новичок'],
    unlockedAchievements: [],
    claimedAchievements: [], // ID достижений, за которые уже забрали награду
    quests: null, // Инициализируется через QuestsManager
    studyPlan: null,
    _dailyGoalClaimed: false,
    actionJournal: [],
  };
  freshState.activeCourseId = DEFAULT_COURSE_ID;
  freshState.courses = {
    [DEFAULT_COURSE_ID]: createEmptyCourseProgress(DEFAULT_COURSE_ID, GENKI_1_CONTENT_VERSION),
  };
  bindActiveCourseProgress(freshState, DEFAULT_COURSE_ID, GENKI_1_CONTENT_VERSION);
  return freshState;
}

export function createPersistableState(targetState) {
  if (!targetState) return null;
  syncActiveCourseProgress(targetState);
  const snapshot =
    typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone(targetState)
      : JSON.parse(JSON.stringify(targetState));
  if (snapshot && snapshot.settings) {
    delete snapshot.settings.openrouterKey;
  }
  return snapshot;
}

function normalizeRuntimeShape(loadedState) {
  migrateLegacyOpenRouterKey(loadedState);
  const base = defaultState();
  const normalized = { ...base, ...loadedState };
  const activeCourseId = loadedState.activeCourseId || DEFAULT_COURSE_ID;
  normalized.courses =
    loadedState.courses && typeof loadedState.courses === 'object' ? loadedState.courses : {};
  bindActiveCourseProgress(
    normalized,
    activeCourseId,
    normalized.courses[activeCourseId]?.courseVersion ||
      (activeCourseId === DEFAULT_COURSE_ID ? GENKI_1_CONTENT_VERSION : null)
  );
  normalized.updatedAt = Number(loadedState.updatedAt) || 0;
  normalized.settings = { ...base.settings, ...(loadedState.settings || {}) };
  delete normalized.settings.openrouterKey;
  normalized.chatHistory = normalizeChatHistory(loadedState.chatHistory);
  normalized.priorKnowledgeChapterIds = Array.isArray(normalized.priorKnowledgeChapterIds)
    ? [...new Set(normalized.priorKnowledgeChapterIds)].filter(
        (id) => typeof id === 'string' || (Number.isInteger(id) && id > 0)
      )
    : [];
  normalized.chapters =
    normalized.chapters && typeof normalized.chapters === 'object' ? normalized.chapters : {};
  for (const chapter of Object.values(normalized.chapters)) {
    chapter.checklist =
      chapter.checklist && typeof chapter.checklist === 'object' ? chapter.checklist : {};
    const LEGACY_REQUIRED = ['vocab', 'grammar', 'dialog', 'listening', 'reading'];
    if (!chapter.completedAt && LEGACY_REQUIRED.every((id) => chapter.checklist?.[id] === true)) {
      const legacyCompletedAt = chapter.updatedAt || chapter.startedAt || Date.now();
      chapter.completedAt = legacyCompletedAt;
      chapter.completionRewardedAt ||= legacyCompletedAt;
    }
  }
  normalized.learningEvents = Array.isArray(normalized.learningEvents)
    ? normalized.learningEvents
    : [];
  normalized.activeChapterId =
    normalized.activeChapterId != null &&
    (typeof normalized.activeChapterId === 'string' ||
      (Number.isInteger(normalized.activeChapterId) && normalized.activeChapterId > 0))
      ? normalized.activeChapterId
      : null;
  normalized.studyPlan = normalized.studyPlan || null;
  if (normalized.studyPlan) {
    normalized.studyPlan.segments = Array.isArray(normalized.studyPlan.segments)
      ? normalized.studyPlan.segments
      : [];
    normalized.studyPlan.history = Array.isArray(normalized.studyPlan.history)
      ? normalized.studyPlan.history
      : [];
  }
  const rawHistory =
    loadedState.miniGameWordHistory && typeof loadedState.miniGameWordHistory === 'object'
      ? loadedState.miniGameWordHistory
      : {};
  normalized.miniGameWordHistory = {
    wordSearch: {
      recentSessions: Array.isArray(rawHistory.wordSearch?.recentSessions)
        ? rawHistory.wordSearch.recentSessions.slice(-5)
        : [],
    },
    crossword: {
      recentSessions: Array.isArray(rawHistory.crossword?.recentSessions)
        ? rawHistory.crossword.recentSessions.slice(-5)
        : [],
    },
  };
  normalized.vocabularyUnlocks =
    normalized.vocabularyUnlocks && typeof normalized.vocabularyUnlocks === 'object'
      ? normalized.vocabularyUnlocks
      : {};
  normalized.grammarUnlocks =
    normalized.grammarUnlocks && typeof normalized.grammarUnlocks === 'object'
      ? normalized.grammarUnlocks
      : {};
  normalized.grammarProgress =
    normalized.grammarProgress && typeof normalized.grammarProgress === 'object'
      ? normalized.grammarProgress
      : {};
  normalized.practiceUnlocks =
    normalized.practiceUnlocks && typeof normalized.practiceUnlocks === 'object'
      ? normalized.practiceUnlocks
      : {};
  normalized.dailyPlan =
    normalized.dailyPlan && typeof normalized.dailyPlan === 'object' ? normalized.dailyPlan : null;
  normalized.dailyPlanHistory = Array.isArray(normalized.dailyPlanHistory)
    ? normalized.dailyPlanHistory
    : [];
  normalized.dailyCapacityMinutes =
    Number(loadedState.dailyCapacityMinutes) > 0
      ? Number(loadedState.dailyCapacityMinutes)
      : base.dailyCapacityMinutes;
  normalized.workbookSettings = {
    ...base.workbookSettings,
    ...(normalized.workbookSettings || {}),
  };
  normalized.settings.pomodoro = normalizePomodoroSettings(normalized.settings?.pomodoro);
  normalized.pomodoro = normalizePomodoroState(loadedState.pomodoro, normalized.settings.pomodoro);
  normalized.actionJournal = Array.isArray(loadedState.actionJournal)
    ? loadedState.actionJournal
    : [];
  normalizeVocabularyLockState(normalized);
  syncActiveCourseProgress(normalized);
  return normalized;
}

// ---------- Pub/Sub System ----------
export function subscribe(callback) {
  if (typeof callback !== 'function') {
    throw new Error('[Store] subscribe: callback должен быть функцией');
  }

  subscribers.add(callback);

  // Возвращаем функцию для отписки
  return () => subscribers.delete(callback);
}

function notify() {
  subscribers.forEach((callback) => {
    try {
      callback(state);
    } catch (err) {
      console.error('[Store] Ошибка в подписчике:', err);
    }
  });
}

let storageDegraded = false;
let storageDegradedReason = '';

export function isStorageDegraded() {
  return storageDegraded;
}

export function getStorageDegradedReason() {
  return storageDegradedReason;
}

// ---------- State Reducer & Domain Event Processor ----------
export function reduceState(currentState, event) {
  if (!currentState || !event || !event.type) return currentState;

  switch (event.type) {
    case 'STUDY_PLAN_TOGGLE_PAUSE': {
      if (!currentState.studyPlan) return currentState;
      const paused =
        typeof event.payload?.paused === 'boolean'
          ? event.payload.paused
          : !currentState.studyPlan.paused;
      return {
        ...currentState,
        studyPlan: {
          ...currentState.studyPlan,
          paused,
        },
      };
    }
    case 'STUDY_PLAN_UPDATE': {
      return {
        ...currentState,
        studyPlan: event.payload?.plan ?? null,
      };
    }
    case 'SETTINGS_UPDATE': {
      return {
        ...currentState,
        settings: {
          ...(currentState.settings || {}),
          ...(event.payload?.settings || {}),
        },
      };
    }
    case 'THEME_UPDATE': {
      const nextSettings = event.payload?.darkMode
        ? { ...(currentState.settings || {}), darkMode: event.payload.darkMode }
        : currentState.settings;
      return {
        ...currentState,
        settings: nextSettings,
        currentTheme: event.payload?.theme ?? currentState.currentTheme,
      };
    }
    case 'QUEST_REWARD_CLAIMED': {
      const { questId, xp = 0, coins = 0 } = event.payload || {};
      const claimedQuests = currentState.quests?.claimed || [];
      if (claimedQuests.includes(questId)) return currentState;

      const questsState = currentState.quests
        ? {
            ...currentState.quests,
            claimed: [...claimedQuests, questId],
          }
        : currentState.quests;

      return {
        ...currentState,
        xp: (currentState.xp || 0) + xp,
        coins: (currentState.coins || 0) + coins,
        quests: questsState,
      };
    }
    case 'ACHIEVEMENT_REWARD_CLAIMED': {
      const { achievementId, reward = 0 } = event.payload || {};
      const claimed = currentState.claimedAchievements || [];
      if (claimed.includes(achievementId)) return currentState;

      return {
        ...currentState,
        coins: (currentState.coins || 0) + reward,
        claimedAchievements: [...claimed, achievementId],
      };
    }
    case 'ONBOARDING_UPDATE': {
      return {
        ...currentState,
        onboarding: {
          ...(currentState.onboarding || {}),
          ...(event.payload?.onboarding || {}),
        },
      };
    }
    case 'AVATAR_EQUIPPED': {
      return {
        ...currentState,
        currentAvatar: event.payload?.avatar ?? currentState.currentAvatar,
      };
    }
    default:
      return currentState;
  }
}

export async function commitState(events, options = {}) {
  if (!state) state = defaultState();
  const eventList = Array.isArray(events) ? events : events ? [events] : [];

  let nextState = state;
  for (const event of eventList) {
    nextState = reduceState(nextState, event);
  }

  state = nextState;
  await save(options.immediate ?? false);
  return state;
}

// ---------- Load State ----------
export async function loadState() {
  let idbState = null;
  let lsState = null;

  try {
    console.log('[Store] Попытка загрузки состояния из IndexedDB...');
    const loaded = await db.get(STORES.APP_STATE, 'state');
    if (loaded) {
      idbState = normalizeRuntimeShape(runMigrations(loaded));
      console.log(
        '[Store] ✅ Состояние загружено из IndexedDB. XP:',
        idbState.xp,
        'Chapters:',
        Object.keys(idbState.chapters).length
      );
    }
  } catch (err) {
    console.error('[Store] Ошибка загрузки state из IndexedDB:', err);
    storageDegraded = true;
    storageDegradedReason =
      'IndexedDB недоступен. Прогресс не будет сохранён в постоянном хранилище.';
  }

  try {
    const fallback = localStorage.getItem(LS_STATE);
    if (fallback) {
      lsState = normalizeRuntimeShape(runMigrations(JSON.parse(fallback)));
      console.log('[Store] Состояние найдено в localStorage. XP:', lsState.xp);
    }
  } catch (err) {
    console.warn('[Store] Ошибка чтения localStorage:', err);
  }

  if (idbState && lsState) {
    const idbTime = Number(idbState.updatedAt) || 0;
    const lsTime = Number(lsState.updatedAt) || 0;

    // lsState может быть записан конфликтующей вкладкой до того, как IDB отклонил её
    // запись. Доверяем ls только если writerId совпадает с idb или idb-запись отсутствует.
    const writerMismatch =
      idbState.writerId && lsState.writerId && idbState.writerId !== lsState.writerId;

    if (!writerMismatch && lsTime > idbTime) {
      console.warn(
        `[Store] Данные в localStorage новее (${lsTime} > ${idbTime}). Восстанавливаем из localStorage.`
      );
      state = lsState;
      performSave();
    } else {
      if (writerMismatch) {
        console.warn(
          `[Store] localStorage writerId (${lsState.writerId}) отличается от IDB (${idbState.writerId}). Используем IDB.`
        );
      }
      state = idbState;
    }
  } else if (idbState) {
    state = idbState;
  } else if (lsState) {
    state = lsState;
    console.warn('[Store] Состояние загружено из localStorage (фоллбек)');
    performSave();
  } else {
    state = defaultState();
    console.log('[Store] Инициализировано состояние по умолчанию');
  }

  // Инициализация квестов через QuestsManager
  if (window.QuestsManager) {
    window.QuestsManager.initializeQuests(state);
    window.QuestsManager.checkQuestReset(state);
  }

  if (state.pendingReviewLogs?.length) {
    await performSave();
  }
}

// ---------- Save State ----------
let saveTimeout = null;
let saveQueue = Promise.resolve();
let pendingSaveResolvers = [];
let persistenceGeneration = 0;

export function save(immediate = false) {
  if (immediate) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    const resolvers = pendingSaveResolvers;
    pendingSaveResolvers = [];
    const p = performSave();
    return p.then(
      (val) => {
        resolvers.forEach((r) => r.resolve(val));
        return val;
      },
      (err) => {
        resolvers.forEach((r) => r.reject(err));
        throw err;
      }
    );
  } else {
    if (saveTimeout) clearTimeout(saveTimeout);

    const p = new Promise((resolve, reject) => {
      pendingSaveResolvers.push({ resolve, reject });
    });

    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      const resolvers = pendingSaveResolvers;
      pendingSaveResolvers = [];
      performSave().then(
        (val) => resolvers.forEach((r) => r.resolve(val)),
        (err) => resolvers.forEach((r) => r.reject(err))
      );
    }, 500);

    return p;
  }
}

function performSave() {
  if (!isPrimaryTab()) {
    console.warn('[Store] Сохранение пропущено: вкладка работает в режиме чтения');
    return Promise.resolve();
  }
  if (state) {
    state.revision = (Number(state.revision) || 0) + 1;
    state.updatedAt = Date.now();
    state.writerId = getTabId();
  }
  compactReviewJournal(state);
  // Снимок делается до первого await, а записи выполняются строго по порядку.
  // Поэтому поздний review/Undo не может быть перезаписан более старым save.
  const snapshot = createPersistableState(state);

  // Синхронный бэкап в safeStorage только если мы primary.
  // Не-primary вкладка не должна писать резервную копию — иначе при следующем
  // запуске более свежий, но конфликтующий backup перезапишет корректное IDB-состояние.
  safeStorage.setItem(LS_STATE, JSON.stringify(snapshot));

  const generation = persistenceGeneration;
  saveQueue = saveQueue.catch(() => undefined).then(() => persistSnapshot(snapshot, generation));
  return saveQueue;
}

async function persistSnapshot(snapshot, generation) {
  if (generation !== persistenceGeneration) {
    console.log(
      '[Store] Сохранение отменено: устаревшее поколение',
      generation,
      'текущее:',
      persistenceGeneration
    );
    return;
  }
  let primaryStatePersisted = false;
  try {
    const existing = await db.get(STORES.APP_STATE, 'state');
    if (existing && existing.revision != null) {
      const isConflict =
        existing.revision > snapshot.revision ||
        (existing.revision === snapshot.revision &&
          existing.writerId &&
          existing.writerId !== snapshot.writerId);

      if (isConflict) {
        console.warn(
          `[Store] CONCURRENCY_CONFLICT: БД (rev ${existing.revision}, writer: ${existing.writerId}) vs снимок (rev ${snapshot.revision}, writer: ${snapshot.writerId}). Демотируем вкладку и перечитываем состояние.`
        );
        recordDiagnosticError({
          type: 'CONCURRENCY_CONFLICT',
          message: `Отклонено сохранение: в БД запись с ревизией ${existing.revision} (текущая: ${snapshot.revision})`,
        });
        // Демотируем: эта вкладка не является writer-ом
        yieldLeadership();
        // Синхронизируем in-memory state с актуальным IDB-состоянием
        try {
          const fresh = await db.get(STORES.APP_STATE, 'state');
          if (fresh) {
            state = normalizeRuntimeShape(runMigrations(fresh));
            notify();
          }
        } catch (reloadErr) {
          console.warn('[Store] Не удалось перечитать state после конфликта:', reloadErr);
        }
        return;
      }
    }

    if (globalThis.__DEV__) {
      console.log(
        '[Store] Сохранение состояния (rev ' + (snapshot?.revision ?? 0) + '). XP:',
        snapshot?.xp ?? 0,
        'Chapters:',
        Object.keys(snapshot?.chapters || {}).length
      );
    }
    await db.set(STORES.APP_STATE, 'state', snapshot);
    primaryStatePersisted = true;
    broadcastStateUpdated(snapshot.revision);
    if (globalThis.__DEV__) {
      console.log('[Store] ✅ Состояние сохранено в IndexedDB');
    }

    const pendingLogs = Array.isArray(snapshot.pendingReviewLogs) ? snapshot.pendingReviewLogs : [];
    const acknowledgedIds = [];
    for (const entry of pendingLogs) {
      await appendReviewLog(entry);
      acknowledgedIds.push(entry.eventId);
    }

    if (acknowledgedIds.length) {
      const acknowledgedSnapshot = acknowledgeReviewLogs(snapshot, acknowledgedIds);
      await db.set(STORES.APP_STATE, 'state', acknowledgedSnapshot);
      acknowledgeReviewLogs(state, acknowledgedIds);
    }
  } catch (e) {
    recordDiagnosticError(e);
    if (primaryStatePersisted) {
      console.warn('[Store] Review log остаётся в transactional outbox для повтора:', e);
      return;
    }
    console.warn('[Store] Ошибка сохранения в IndexedDB:', e);
    storageDegraded = true;
    storageDegradedReason =
      'Ошибка сохранения в IndexedDB. Прогресс сохраняется в аварийном режиме.';

    // Обработка переполнения квоты
    if (e.name === 'QuotaExceededError') {
      console.warn('[Store] Квота переполнена. Попытка сохранить только критичные данные...');
      const minimal = { ...snapshot, savedNotes: snapshot.savedNotes.slice(0, 20) };

      try {
        await db.set(STORES.APP_STATE, 'state', minimal);
        if (window.toast) window.toast('⚠️ Данные сокращены — слишком много заметок');
      } catch (err2) {
        // Последний фоллбек: emergency state в safeStorage
        console.error('[Store] Критическая ошибка сохранения, используем safeStorage:', err2);
        const emergency = { ...snapshot, savedNotes: [] };
        safeStorage.setItem(LS_STATE, JSON.stringify(emergency));
        if (window.toast) window.toast('⚠️ Заметки удалены — не хватило места в хранилище');
      }
    } else {
      // Для других ошибок — фоллбек в safeStorage
      safeStorage.setItem(LS_STATE, JSON.stringify(snapshot));
      console.warn('[Store] Использован safeStorage после ошибки IndexedDB');
    }
  } finally {
    // Subscribers observe the in-memory state even when persistence used a
    // fallback or failed; notification semantics must not depend on IndexedDB.
    notify();
  }
}

// ---------- Runtime-only кэш контента глав ----------
// НЕ персистится в localStorage и не входит в схему прогресса:
// только отслеживает, какие главы загружены в текущей сессии.
export const loadedChapters = new Map(); // chapterId -> { lesson, story }

// ---------- Cancel Pending Saves & Reset Data ----------
export function cancelPendingSaves() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  pendingSaveResolvers.forEach((r) => {
    try {
      r.resolve({ cancelled: true });
    } catch {
      // ignore
    }
  });
  pendingSaveResolvers = [];
}

export async function resetApplicationData(options = {}) {
  persistenceGeneration++;
  const preservedDarkMode = state?.settings?.darkMode || 'auto';
  const preservedTheme = state?.currentTheme || 'default';

  cancelPendingSaves();
  loadedChapters.clear();

  try {
    if (STORES.CONTENT_CACHE) {
      await db.clear(STORES.CONTENT_CACHE);
    }
  } catch (err) {
    console.warn('[Store] Ошибка очистки CONTENT_CACHE:', err);
  }

  try {
    await clearReviewLogs();
  } catch (err) {
    console.warn('[Store] Ошибка очистки review logs:', err);
  }

  for (const storeName of [
    STORES.USER_DICTIONARIES,
    STORES.USER_DICTIONARY_ENTRIES,
    STORES.USER_DICTIONARY_IMPORT_PROFILES,
    STORES.ACTIVE_SESSION,
  ]) {
    try {
      if (storeName) await db.clear(storeName);
    } catch (err) {
      console.warn(`[Store] Ошибка очистки ${storeName}:`, err);
    }
  }

  try {
    await clearOpenRouterKey();
  } catch (err) {
    console.warn('[Store] Ошибка очистки OpenRouter API-ключа:', err);
  }

  try {
    if (STORES.UI_PREFERENCES) {
      await db.delete(STORES.UI_PREFERENCES, 'idb_migrated');
    }
  } catch (err) {
    console.warn('[Store] Ошибка удаления idb_migrated:', err);
  }

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  } catch (err) {
    console.warn('[Store] Ошибка очистки sessionStorage:', err);
  }

  try {
    await db.set(STORES.APP_STATE, 'state', null);
  } catch (err) {
    console.warn('[Store] Ошибка очистки IndexedDB при reset:', err);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('kitsune') ||
            key.includes('state') ||
            key.includes('genki') ||
            key.includes('srs'))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem(LS_STATE);
    }
  } catch (e) {
    console.warn('[Store] Ошибка очистки localStorage при reset:', e);
  }

  const fresh = defaultState();
  fresh.pendingReviewLogs = [];
  fresh.reviewEvents = [];
  fresh.masteryArchive = {};

  if (options.preserveTheme !== false) {
    fresh.settings.darkMode = preservedDarkMode;
    fresh.currentTheme = preservedTheme;
  }

  state = fresh;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_STATE, JSON.stringify(fresh));
    }
    await db.set(STORES.APP_STATE, 'state', fresh);
  } catch (e) {
    console.warn('[Store] Ошибка сохранения свежего состояния при reset:', e);
  }

  if (options.skipReload !== true) {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      typeof window.location.reload === 'function'
    ) {
      window.location.reload();
    }
  }

  return fresh;
}

// ---------- Chapter State Helper ----------
export function chState(id) {
  if (!state) state = defaultState();
  if (!state.chapters) state.chapters = {};
  if (!state.chapters[id]) state.chapters[id] = { started: false, checklist: {} };
  return state.chapters[id];
}

// ---------- Diagnostic & Storage Helpers ----------
let storagePersistedState = false;

export async function checkAndRequestStoragePersistence() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      storagePersistedState = await navigator.storage.persist();
      console.log('[Store] Persistent storage result:', storagePersistedState);
      return storagePersistedState;
    } catch (e) {
      console.warn('[Store] Failed to request storage persistence:', e);
      storagePersistedState = false;
      return false;
    }
  }
  return false;
}

export function isStoragePersisted() {
  return storagePersistedState;
}

export function recordDiagnosticError(err) {
  if (!state) return;
  if (!Array.isArray(state.lastErrors)) state.lastErrors = [];
  const isObj = err && typeof err === 'object';
  const entry = {
    timestamp: isObj && err.timestamp ? err.timestamp : Date.now(),
    message: typeof err === 'string' ? err : err?.message || String(err),
    type: isObj && err.type ? err.type : 'ERROR',
    code: isObj && err.code ? err.code : null,
    severity: isObj && err.severity ? err.severity : 'error',
    cardId: isObj && err.cardId !== undefined ? err.cardId : null,
    itemId: isObj && err.itemId !== undefined ? err.itemId : null,
    dictionaryId: isObj && err.dictionaryId !== undefined ? err.dictionaryId : null,
    courseId: isObj && err.courseId !== undefined ? err.courseId : null,
    lessonId: isObj && err.lessonId !== undefined ? err.lessonId : null,
    mode: isObj && err.mode !== undefined ? err.mode : null,
    sessionId: isObj && err.sessionId !== undefined ? err.sessionId : null,
    context: isObj && err.context ? err.context : null,
    details: isObj && err.details ? err.details : null,
    stack: isObj && err.stack ? String(err.stack).slice(0, 300) : null,
  };
  state.lastErrors.unshift(entry);
  if (state.lastErrors.length > 100) {
    state.lastErrors = state.lastErrors.slice(0, 100);
  }
}

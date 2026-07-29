/* state/store.js — Centralized state management with versioning, migrations, and subscriptions */

import { SRS } from '../srs.js';
import { db, STORES } from '../src/db.js';
import { appendReviewLog, clearReviewLogs } from '../src/review-log.js';
import { acknowledgeReviewLogs, compactReviewJournal } from '../src/review-journal.js';
import { normalizeVocabularyLockState } from '../src/vocabulary-unlock-plan.js';
import { hasMeaningfulUserProgress } from '../src/onboarding-state.js';
import { isPrimaryTab, broadcastStateUpdated } from '../src/tab-sync.js';
import { normalizeChatHistory } from '../src/ai/chat-history.js';
import {
  migrateLegacyOpenRouterKey,
  getOpenRouterKey,
  setOpenRouterKey,
} from '../src/openrouter-key.js';

const LS_STATE = 'kitsune_state_v1';

// Текущая версия схемы данных
export const CURRENT_VERSION = 13;

// Глобальное состояние приложения
export let state = null;

// Подписчики на изменения state
const subscribers = new Set();

// ---------- Migrations ----------
const MIGRATIONS = {
  2: (oldState) => {
    // Миграция с версии 1 (или без версии) → 2
    // Склеиваем со всеми полями из defaultState для гарантии наличия новых полей
    const baseState = defaultState();
    const migratedState = { ...baseState };

    // Переносим существующие данные
    Object.keys(oldState).forEach((key) => {
      if (key !== 'version') {
        migratedState[key] = oldState[key];
      }
    });

    // Гарантируем наличие критичных полей (могли отсутствовать в старых версиях)
    if (!migratedState.unlockedAchievements) migratedState.unlockedAchievements = [];
    if (!migratedState.claimedAchievements) migratedState.claimedAchievements = [];
    if (!migratedState.quests) migratedState.quests = null;
    if (!migratedState.chatHistory) migratedState.chatHistory = [];
    if (!migratedState.settings) migratedState.settings = baseState.settings;

    // Backfill настроек
    migratedState.settings = { ...baseState.settings, ...migratedState.settings };

    // Проставляем версию
    migratedState.version = 2;

    return migratedState;
  },
  3: (oldState) => {
    // Миграция с версии 2 → 3: перевод SRS-карточек с SM-2 на FSRS.
    // Атомарно проходим по всем записям; `due` (nextReview) не перезаписывается.
    const migratedState = { ...oldState };
    const srs = migratedState.srs || {};

    Object.keys(srs).forEach((cardId) => {
      try {
        srs[cardId] = SRS.migrateSM2ToFSRS(srs[cardId]);
      } catch (err) {
        console.error(`[Store] Ошибка миграции карточки ${cardId} на FSRS:`, err);
      }
    });

    migratedState.srs = srs;
    migratedState.version = 3;

    return migratedState;
  },
  4: (oldState) => {
    // ts-fsrs 5.4.1 adds learning_steps to Card. Existing progress is retained
    // only as legacy data and is never promoted into evidence-backed mastery.
    const migratedState = { ...oldState, srs: { ...(oldState.srs || {}) } };
    for (const [cardId, card] of Object.entries(migratedState.srs)) {
      const normalized = SRS.migrateSM2ToFSRS({ ...card, id: card.id || cardId });
      if (
        Object.hasOwn(card, 'progress') ||
        normalized.reps > 0 ||
        Number(normalized.stability) > 0
      ) {
        normalized.legacyMasteryEstimated = true;
      }
      migratedState.srs[cardId] = normalized;
    }
    migratedState.reviewEvents = Array.isArray(oldState.reviewEvents) ? oldState.reviewEvents : [];
    migratedState.version = 4;
    return migratedState;
  },
  5: (oldState) => {
    const reviewEvents = Array.isArray(oldState.reviewEvents) ? [...oldState.reviewEvents] : [];
    const cardsWithCleanEvidence = new Set(
      reviewEvents
        .filter((event) => event?.eventType === 'review' && !event.undoneAt)
        .map((event) => event.cardId)
    );
    const srs = Object.fromEntries(
      Object.entries(oldState.srs || {}).map(([cardId, card]) => [
        cardId,
        card.reps > 0 && !cardsWithCleanEvidence.has(cardId)
          ? { ...card, legacyMasteryEstimated: true }
          : card,
      ])
    );
    const migratedState = {
      ...oldState,
      srs,
      reviewEvents,
      masteryArchive: { ...(oldState.masteryArchive || {}) },
      version: 5,
    };
    return compactReviewJournal(migratedState);
  },
  6: (oldState) => ({
    ...oldState,
    pendingReviewLogs: Array.isArray(oldState.pendingReviewLogs) ? oldState.pendingReviewLogs : [],
    version: 6,
  }),
  7: (oldState) => {
    const baseState = { ...oldState };
    const existingPrior = Array.isArray(baseState.priorKnowledgeChapterIds)
      ? baseState.priorKnowledgeChapterIds
      : [];
    const legacyCompleted = Array.isArray(baseState.studyPlan?.completedChapters)
      ? baseState.studyPlan.completedChapters
      : [];
    const appChapters = baseState.chapters || {};

    const newPrior = new Set(
      existingPrior.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    );

    for (const id of legacyCompleted) {
      const chId = Number(id);
      if (!Number.isInteger(chId) || chId <= 0) continue;
      const chState = appChapters[chId];
      const isActuallyCompleted = Boolean(
        chState?.completedAt ||
        (chState?.checklist &&
          Object.keys(chState.checklist).length > 0 &&
          Object.values(chState.checklist).every((val) => val === true))
      );
      if (!isActuallyCompleted) {
        newPrior.add(chId);
      }
    }

    return {
      ...baseState,
      priorKnowledgeChapterIds: [...newPrior].sort((a, b) => a - b),
      version: 7,
    };
  },
  8: (oldState) => {
    const baseState = { ...oldState };
    const history =
      baseState.miniGameWordHistory && typeof baseState.miniGameWordHistory === 'object'
        ? baseState.miniGameWordHistory
        : {};
    return {
      ...baseState,
      miniGameWordHistory: {
        wordSearch: {
          recentSessions: Array.isArray(history.wordSearch?.recentSessions)
            ? history.wordSearch.recentSessions.slice(-5)
            : [],
        },
        crossword: {
          recentSessions: Array.isArray(history.crossword?.recentSessions)
            ? history.crossword.recentSessions.slice(-5)
            : [],
        },
      },
      version: 8,
    };
  },
  9: (oldState) => {
    const baseState = { ...oldState };
    const settings = baseState.settings || {};
    return {
      ...baseState,
      settings: {
        ...settings,
        notifyDays: Array.isArray(settings.notifyDays)
          ? settings.notifyDays
          : [1, 2, 3, 4, 5, 6, 0],
        notificationState:
          settings.notificationState && typeof settings.notificationState === 'object'
            ? settings.notificationState
            : { lastDailyDigestDate: null, lastDailyDigestSlot: null },
      },
      version: 9,
    };
  },
  10: (oldState) => {
    const baseState = { ...oldState };
    baseState.vocabularyUnlocks =
      baseState.vocabularyUnlocks && typeof baseState.vocabularyUnlocks === 'object'
        ? baseState.vocabularyUnlocks
        : {};
    baseState.version = 10;
    return normalizeVocabularyLockState(baseState);
  },
  11: (oldState) => {
    const baseState = { ...oldState };
    const chapters = { ...(baseState.chapters || {}) };
    for (const [chapterId, chapterValue] of Object.entries(chapters)) {
      const chapter = { ...(chapterValue || {}) };
      chapter.checklist = { ...(chapter.checklist || {}) };
      // Legacy aggregate flags are converted once into explicit migration
      // evidence. New completion logic never depends on checklist.vocab.
      if (chapter.checklist.vocab === true) chapter.legacyVocabularyCompleted = true;
      chapters[chapterId] = chapter;
    }
    return {
      ...baseState,
      chapters,
      grammarUnlocks:
        baseState.grammarUnlocks && typeof baseState.grammarUnlocks === 'object'
          ? baseState.grammarUnlocks
          : {},
      grammarProgress:
        baseState.grammarProgress && typeof baseState.grammarProgress === 'object'
          ? baseState.grammarProgress
          : {},
      practiceUnlocks:
        baseState.practiceUnlocks && typeof baseState.practiceUnlocks === 'object'
          ? baseState.practiceUnlocks
          : {},
      dailyPlan:
        baseState.dailyPlan && typeof baseState.dailyPlan === 'object' ? baseState.dailyPlan : null,
      dailyPlanHistory: Array.isArray(baseState.dailyPlanHistory) ? baseState.dailyPlanHistory : [],
      dailyCapacityMinutes:
        Number(baseState.dailyCapacityMinutes) > 0 ? Number(baseState.dailyCapacityMinutes) : 30,
      workbookSettings: {
        includeReadingWriting: baseState.workbookSettings?.includeReadingWriting !== false,
      },
      version: 11,
    };
  },
  12: (oldState) => {
    const baseState = { ...oldState };
    const chapters = { ...(baseState.chapters || {}) };
    for (const [chapterId, chapterValue] of Object.entries(chapters)) {
      const chapter = { ...(chapterValue || {}) };
      chapter.checklist = { ...(chapter.checklist || {}) };
      if (chapter.checklist.grammar === true) {
        chapter.legacyCompletionEvidence = {
          ...(chapter.legacyCompletionEvidence || {}),
          grammar: true,
        };
        delete chapter.checklist.grammar;
      }
      if (chapter.checklist.dialog === true) {
        chapter.checklist[`L${chapterId}_p_dialog`] = true;
        delete chapter.checklist.dialog;
      }
      if (chapter.checklist.listening === true) {
        chapter.checklist[`L${chapterId}_p_listening`] = true;
        delete chapter.checklist.listening;
      }
      if (chapter.checklist.reading === true) {
        chapter.checklist[`L${chapterId}_p_reading`] = true;
        delete chapter.checklist.reading;
      }
      chapters[chapterId] = chapter;
    }

    const hasProgress = hasMeaningfulUserProgress(baseState);
    const onboarding = {
      schemaVersion: 1,
      completed: hasProgress,
      currentStep: 0,
      draft: null,
      completedAt: hasProgress ? baseState.updatedAt || Date.now() : null,
      ...(baseState.onboarding || {}),
    };
    if (hasProgress) onboarding.completed = true;

    return {
      ...baseState,
      chapters,
      onboarding,
      workbookSettings: {
        enabled: baseState.workbookSettings?.enabled !== false,
        includeConversationGrammar:
          baseState.workbookSettings?.includeConversationGrammar !== false,
        includeReadingWriting: baseState.workbookSettings?.includeReadingWriting !== false,
      },
      version: 12,
    };
  },
  13: (oldState) => {
    const baseState = { ...oldState };
    const chapters = { ...(baseState.chapters || {}) };
    for (const [chapterId, chapterValue] of Object.entries(chapters)) {
      const chapter = { ...(chapterValue || {}) };
      const checklist = { ...(chapter.checklist || {}) };
      const chId = Number(chapterId);

      const legacyDialog = `L${chId}_p_dialog`;
      const legacyListening = `L${chId}_p_listening`;
      const legacyReading = `L${chId}_p_reading`;

      if (checklist[legacyDialog] === true || checklist.dialog === true) {
        checklist.dialog = true;
      }
      delete checklist[legacyDialog];

      if (checklist[legacyListening] === true || checklist.listening === true) {
        checklist.listening = true;
      }
      delete checklist[legacyListening];

      if (checklist[legacyReading] === true || checklist.reading === true) {
        checklist.reading = true;
      }
      delete checklist[legacyReading];

      chapter.checklist = checklist;
      chapters[chapterId] = chapter;
    }

    return {
      ...baseState,
      chapters,
      version: 13,
    };
  },
};

// ---------- Default State ----------
export function defaultState() {
  return {
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
    },
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
  };
}

// ---------- Migrations Runner ----------
export function runMigrations(loadedState) {
  let currentVersion = loadedState.version || 1; // Старые сохранения без версии считаются версией 1
  let migratedState = loadedState;

  // Последовательно прогоняем все миграции от текущей версии до CURRENT_VERSION
  while (currentVersion < CURRENT_VERSION) {
    const nextVersion = currentVersion + 1;

    if (MIGRATIONS[nextVersion]) {
      console.log(`[Store] Применяю миграцию ${currentVersion} → ${nextVersion}`);
      migratedState = MIGRATIONS[nextVersion](migratedState);
      currentVersion = nextVersion;
    } else {
      console.warn(`[Store] Миграция для версии ${nextVersion} не найдена`);
      break;
    }
  }

  return migratedState;
}

function normalizeRuntimeShape(loadedState) {
  migrateLegacyOpenRouterKey(loadedState);
  const base = defaultState();
  const normalized = { ...base, ...loadedState };
  normalized.updatedAt = Number(loadedState.updatedAt) || 0;
  normalized.settings = { ...base.settings, ...(loadedState.settings || {}) };
  Object.defineProperty(normalized.settings, 'openrouterKey', {
    get() {
      return getOpenRouterKey();
    },
    set(val) {
      setOpenRouterKey(val);
    },
    enumerable: true,
    configurable: true,
  });
  normalized.chatHistory = normalizeChatHistory(loadedState.chatHistory);
  normalized.priorKnowledgeChapterIds = Array.isArray(loadedState.priorKnowledgeChapterIds)
    ? [...new Set(loadedState.priorKnowledgeChapterIds.map(Number))]
        .filter((id) => Number.isInteger(id) && id > 0)
        .sort((a, b) => a - b)
    : [];
  normalized.chapters =
    loadedState.chapters && typeof loadedState.chapters === 'object' ? loadedState.chapters : {};
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
  normalized.learningEvents = Array.isArray(loadedState.learningEvents)
    ? loadedState.learningEvents
    : [];
  const activeChapterId = Number(loadedState.activeChapterId);
  normalized.activeChapterId =
    loadedState.activeChapterId != null && Number.isInteger(activeChapterId) && activeChapterId > 0
      ? activeChapterId
      : null;
  normalized.studyPlan = loadedState.studyPlan || null;
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
    loadedState.vocabularyUnlocks && typeof loadedState.vocabularyUnlocks === 'object'
      ? loadedState.vocabularyUnlocks
      : {};
  normalized.grammarUnlocks =
    loadedState.grammarUnlocks && typeof loadedState.grammarUnlocks === 'object'
      ? loadedState.grammarUnlocks
      : {};
  normalized.grammarProgress =
    loadedState.grammarProgress && typeof loadedState.grammarProgress === 'object'
      ? loadedState.grammarProgress
      : {};
  normalized.practiceUnlocks =
    loadedState.practiceUnlocks && typeof loadedState.practiceUnlocks === 'object'
      ? loadedState.practiceUnlocks
      : {};
  normalized.dailyPlan =
    loadedState.dailyPlan && typeof loadedState.dailyPlan === 'object'
      ? loadedState.dailyPlan
      : null;
  normalized.dailyPlanHistory = Array.isArray(loadedState.dailyPlanHistory)
    ? loadedState.dailyPlanHistory
    : [];
  normalized.dailyCapacityMinutes =
    Number(loadedState.dailyCapacityMinutes) > 0
      ? Number(loadedState.dailyCapacityMinutes)
      : base.dailyCapacityMinutes;
  normalized.workbookSettings = {
    ...base.workbookSettings,
    ...(loadedState.workbookSettings || {}),
  };
  normalizeVocabularyLockState(normalized);
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

    if (lsTime > idbTime) {
      console.warn(
        `[Store] Данные в localStorage новее (${lsTime} > ${idbTime}). Восстанавливаем из localStorage.`
      );
      state = lsState;
      performSave();
    } else {
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
  }
  compactReviewJournal(state);
  // Снимок делается до первого await, а записи выполняются строго по порядку.
  // Поэтому поздний review/Undo не может быть перезаписан более старым save.
  const snapshot =
    typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone(state)
      : JSON.parse(JSON.stringify(state));

  // Синхронный бэкап в localStorage на случай быстрого закрытия вкладки/PWA
  try {
    localStorage.setItem(LS_STATE, JSON.stringify(snapshot));
  } catch (e) {
    console.warn('[Store] Ошибка синхронного бэкапа в localStorage:', e);
  }

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
    if (existing && existing.revision && existing.revision > snapshot.revision) {
      console.warn(
        `[Store] Ошибка оптимистичной блокировки: ревизия в БД (${existing.revision}) новее снимка (${snapshot.revision}). Перезапись заблокирована.`
      );
      recordDiagnosticError({
        type: 'CONCURRENCY_CONFLICT',
        message: `Отклонено сохранение: в БД запись с ревизией ${existing.revision} (текущая: ${snapshot.revision})`,
      });
      return;
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
        // Последний фоллбек: emergency state в localStorage
        console.error('[Store] Критическая ошибка сохранения, используем localStorage:', err2);
        const emergency = { ...snapshot, savedNotes: [] };
        try {
          localStorage.setItem(LS_STATE, JSON.stringify(emergency));
          if (window.toast) window.toast('⚠️ Заметки удалены — не хватило места в хранилище');
        } catch {
          console.error('[Store] Не удалось сохранить даже в localStorage');
        }
      }
    } else {
      // Для других ошибок — фоллбек в localStorage
      try {
        localStorage.setItem(LS_STATE, JSON.stringify(snapshot));
        console.warn('[Store] Использован localStorage после ошибки IndexedDB');
      } catch {
        console.error('[Store] Полный отказ сохранения');
      }
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
  ]) {
    try {
      if (storeName) await db.clear(storeName);
    } catch (err) {
      console.warn(`[Store] Ошибка очистки ${storeName}:`, err);
    }
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
  const entry = {
    timestamp: Date.now(),
    message: typeof err === 'string' ? err : err?.message || String(err),
    type: err?.type || 'ERROR',
    stack: err?.stack ? String(err.stack).slice(0, 300) : null,
  };
  state.lastErrors.unshift(entry);
  if (state.lastErrors.length > 100) {
    state.lastErrors = state.lastErrors.slice(0, 100);
  }
}

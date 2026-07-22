/* state/store.js — Centralized state management with versioning, migrations, and subscriptions */

import { SRS } from '../srs.js';
import { db, STORES } from '../src/db.js';

const LS_STATE = 'kitsune_state_v1';

// Текущая версия схемы данных
export const CURRENT_VERSION = 4;

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
      if (Object.hasOwn(card, 'progress')) normalized.legacyMasteryEstimated = true;
      migratedState.srs[cardId] = normalized;
    }
    migratedState.reviewEvents = Array.isArray(oldState.reviewEvents) ? oldState.reviewEvents : [];
    migratedState.version = 4;
    return migratedState;
  },
};

// ---------- Default State ----------
export function defaultState() {
  return {
    version: CURRENT_VERSION,
    initialized: false,
    chapters: {}, // id -> {started, checklist:{}}
    srs: {}, // cardId -> SRS record
    reviewEvents: [], // атомарный журнал новых review; legacy REVIEW_LOG хранится отдельно
    streak: { count: 0, lastActive: null },
    savedNotes: [], // {id,title,content,date}
    settings: {
      openrouterKey: '',
      model: 'deepseek/deepseek-v4-flash',
      notifyEnabled: false,
      notifyTime: '12:00',
      darkMode: 'auto',
      hideRomaji: false,
    },
    chatHistory: [], // {role,content}
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

// ---------- Load State ----------
export async function loadState() {
  try {
    console.log('[Store] Попытка загрузки состояния из IndexedDB...');
    // Пытаемся загрузить из IndexedDB
    const loaded = await db.get(STORES.APP_STATE, 'state');
    console.log('[Store] Результат загрузки:', loaded ? 'данные найдены' : 'данных нет');

    if (loaded) {
      // Прогоняем миграции если версия старая
      state = runMigrations(loaded);
      console.log(
        '[Store] ✅ Состояние загружено из IndexedDB. XP:',
        state.xp,
        'Chapters:',
        Object.keys(state.chapters).length
      );
    } else {
      // Фоллбек: пытаемся загрузить из localStorage (на случай первого запуска)
      const fallback = localStorage.getItem(LS_STATE);
      if (fallback) {
        const parsedFallback = JSON.parse(fallback);
        state = runMigrations(parsedFallback);
        console.log('[Store] Состояние загружено из localStorage (фоллбек)');
      } else {
        state = defaultState();
        console.log('[Store] Инициализировано состояние по умолчанию');
      }
    }
  } catch (err) {
    console.error('[Store] Ошибка загрузки state:', err);

    // Последний фоллбек: localStorage
    try {
      const fallback = localStorage.getItem(LS_STATE);
      if (fallback) {
        state = runMigrations(JSON.parse(fallback));
        console.warn('[Store] Использован localStorage после ошибки IndexedDB');
      } else {
        state = defaultState();
      }
    } catch {
      state = defaultState();
    }
  }

  // Инициализация квестов через QuestsManager
  if (window.QuestsManager) {
    window.QuestsManager.initializeQuests(state);
    window.QuestsManager.checkQuestReset(state);
  }
}

// ---------- Save State ----------
let saveTimeout = null;
let saveQueue = Promise.resolve();

export function save(immediate = false) {
  if (immediate) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    return performSave();
  } else {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(performSave, 500);
    return Promise.resolve();
  }
}

function performSave() {
  // Снимок делается до первого await, а записи выполняются строго по порядку.
  // Поэтому поздний review/Undo не может быть перезаписан более старым save.
  const snapshot =
    typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone(state)
      : JSON.parse(JSON.stringify(state));
  saveQueue = saveQueue.catch(() => undefined).then(() => persistSnapshot(snapshot));
  return saveQueue;
}

async function persistSnapshot(snapshot) {
  try {
    console.log(
      '[Store] Сохранение состояния. XP:',
      snapshot.xp,
      'Chapters:',
      Object.keys(snapshot.chapters).length
    );
    await db.set(STORES.APP_STATE, 'state', snapshot);
    console.log('[Store] ✅ Состояние сохранено в IndexedDB');
    notify(); // Уведомляем подписчиков об изменениях
  } catch (e) {
    console.warn('[Store] Ошибка сохранения в IndexedDB:', e);

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
  }
}

// ---------- Runtime-only кэш контента глав ----------
// НЕ персистится в localStorage и не входит в схему прогресса:
// только отслеживает, какие главы загружены в текущей сессии.
export const loadedChapters = new Map(); // chapterId -> { lesson, story }

// ---------- Chapter State Helper ----------
export function chState(id) {
  if (!state.chapters[id]) state.chapters[id] = { started: false, checklist: {} };
  return state.chapters[id];
}

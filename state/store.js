/* state/store.js — Centralized state management with versioning, migrations, and subscriptions */

import { SRS } from '../srs.js';

const LS_STATE = 'kitsune_state_v1';

// Текущая версия схемы данных
const CURRENT_VERSION = 3;

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
};

// ---------- Default State ----------
export function defaultState() {
  return {
    version: CURRENT_VERSION,
    initialized: false,
    chapters: {}, // id -> {started, checklist:{}}
    srs: {}, // cardId -> SRS record
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
function runMigrations(loadedState) {
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
export function loadState() {
  try {
    const loaded = JSON.parse(localStorage.getItem(LS_STATE));

    if (loaded) {
      // Прогоняем миграции если версия старая
      state = runMigrations(loaded);
    } else {
      state = defaultState();
    }
  } catch (err) {
    console.error('[Store] Ошибка загрузки state:', err);
    state = defaultState();
  }

  // Инициализация квестов через QuestsManager
  if (window.QuestsManager) {
    window.QuestsManager.initializeQuests(state);
    window.QuestsManager.checkQuestReset(state);
  }
}

// ---------- Save State ----------
let saveTimeout = null;

export function save(immediate = false) {
  if (immediate) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    performSave();
  } else {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(performSave, 500);
  }
}

function performSave() {
  try {
    localStorage.setItem(LS_STATE, JSON.stringify(state));
    notify(); // Уведомляем подписчиков об изменениях
  } catch (e) {
    console.warn('[Store] localStorage переполнен. Попытка сохранить только критичные данные...');
    const minimal = { ...state, savedNotes: state.savedNotes.slice(0, 20) };
    try {
      localStorage.setItem(LS_STATE, JSON.stringify(minimal));
      if (window.toast) window.toast('⚠️ Данные сокращены — слишком много заметок');
    } catch {
      const emergency = { ...state, savedNotes: [] };
      localStorage.setItem(LS_STATE, JSON.stringify(emergency));
      if (window.toast) window.toast('⚠️ Заметки удалены — не хватило места в хранилище');
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

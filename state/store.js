/* state/store.js — Centralized state management */

const LS_STATE = "kitsune_state_v1";

// Глобальное состояние приложения
export let state = null;

// ---------- Default State ----------
export function defaultState() {
  return {
    initialized: false,
    chapters: {},   // id -> {started, checklist:{}}
    srs: {},        // cardId -> SRS record
    streak: { count: 0, lastActive: null },
    savedNotes: [], // {id,title,content,date}
    settings: { 
      openrouterKey: "", 
      model: "deepseek/deepseek-v4-flash", 
      notifyEnabled: false, 
      notifyTime: "12:00", 
      darkMode: "auto", 
      hideRomaji: false 
    },
    chatHistory: [], // {role,content}
    xp: 0,
    level: 1,
    coins: 0,
    dailyCards: 0,
    history: {},    // {"YYYY-MM-DD": count}
    currentAvatar: "🦊",
    unlockedAvatars: ["🦊"],
    currentStreakSkin: "default",
    unlockedStreakSkins: ["default"],
    currentTheme: "default",
    unlockedThemes: ["default"],
    currentTitle: "Новичок",
    unlockedTitles: ["Новичок"],
    unlockedAchievements: [],
    claimedAchievements: [], // ID достижений, за которые уже забрали награду
    quests: null, // Инициализируется через QuestsManager
    studyPlan: null,
    _dailyGoalClaimed: false,
  };
}

// ---------- Load State ----------
export function loadState() {
  try { 
    state = JSON.parse(localStorage.getItem(LS_STATE)) || defaultState(); 
  } catch { 
    state = defaultState(); 
  }
  
  // Backfill new fields
  const d = defaultState();
  state.settings = Object.assign({}, d.settings, state.settings || {});
  if (!state.streak) state.streak = d.streak;
  if (!state.savedNotes) state.savedNotes = [];
  if (!state.srs) state.srs = {};
  if (!state.chapters) state.chapters = {};
  if (!state.chatHistory) state.chatHistory = [];
  if (state.xp === undefined) state.xp = d.xp;
  if (state.level === undefined) state.level = d.level;
  if (state.coins === undefined) state.coins = d.coins;
  if (state.dailyCards === undefined) state.dailyCards = d.dailyCards;
  if (!state.history) state.history = {};
  if (!state.currentAvatar) state.currentAvatar = d.currentAvatar;
  if (!state.unlockedAvatars) state.unlockedAvatars = d.unlockedAvatars;
  if (!state.currentStreakSkin) state.currentStreakSkin = d.currentStreakSkin;
  if (!state.unlockedStreakSkins) state.unlockedStreakSkins = d.unlockedStreakSkins;
  if (!state.currentTheme) state.currentTheme = d.currentTheme;
  if (!state.unlockedThemes) state.unlockedThemes = d.unlockedThemes;
  if (!state.currentTitle) state.currentTitle = d.currentTitle;
  if (!state.unlockedTitles) state.unlockedTitles = d.unlockedTitles;
  if (!state.claimedAchievements) state.claimedAchievements = [];
  if (state._dailyGoalClaimed === undefined) state._dailyGoalClaimed = false;
  if (!state.studyPlan) state.studyPlan = null;
  
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
  } catch (e) {
    console.warn("localStorage переполнен. Попытка сохранить только критичные данные...");
    const minimal = { ...state, savedNotes: state.savedNotes.slice(0, 20) };
    try {
      localStorage.setItem(LS_STATE, JSON.stringify(minimal));
      if (window.toast) window.toast("⚠️ Данные сокращены — слишком много заметок");
    } catch {
      const emergency = { ...state, savedNotes: [] };
      localStorage.setItem(LS_STATE, JSON.stringify(emergency));
      if (window.toast) window.toast("⚠️ Заметки удалены — не хватило места в хранилище");
    }
  }
}

// ---------- Chapter State Helper ----------
export function chState(id) {
  if (!state.chapters[id]) state.chapters[id] = { started: false, checklist: {} };
  return state.chapters[id];
}
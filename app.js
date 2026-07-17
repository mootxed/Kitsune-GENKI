/* app.js — Kitsune Genki main controller */
import { ACHIEVEMENTS, AchievementSystem } from './achievements.js';
import { QuestsManager } from './quests.js';
import { STORIES } from './stories.js';
import { StudyPlan } from './studyplan.js';
import { API } from './services.js';
import { SRS } from './srs.js';
import { SessionManager } from './session-manager.js';

// Экспортируем глобальные объекты для обратной совместимости
window.SRS = SRS;
window.QuestSystem = null; // будет инициализирован позже
window.AchievementSystem = null; // будет инициализирован позже

  const LS_STATE = "kitsune_state_v1";
  const LS_LESSONS = "kitsune_lessons_v1";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const XP_PER_LEVEL = 100;
  const XP_CARD = 1;
  const XP_CHECK = 20;
  const XP_CHAPTER_FULL = 100;
  const COINS_PER_LEVEL = 50;
  const DRAWING_MODE_PROBABILITY = 0.2; // 20% шанс режима рисования

  const MONTHS_RU = [
    "Январь","Февраль","Март","Апрель","Май","Июнь",
    "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"
  ];

  // Canonical Genki chapter names (for display flavour)
  const CH_NAMES = {
    1: ["Новые друзья", "あたらしいともだち"],
    2: ["Покупки", "かいもの"],
    3: ["Назначаем встречу", "デートのやくそく"],
    4: ["Первое свидание", "はじめてのデート"],
    5: ["Поездка на Окинаву", "おきなわりょこう"],
    6: ["Один день Роберта", "ロバートさんのいちにち"],
    7: ["Семья", "かぞく"],
    8: ["Барбекю", "バーベキュー"],
    9: ["Кабуки", "かぶき"],
    10: ["Зимние каникулы", "ふゆやすみ"],
    11: ["После каникул", "やすみのあとで"],
    12: ["Недомогание", "びょうき"],
  };
  const CHECK_ITEMS = [
    ["words", "Слова"], ["grammar", "Грамматика"], ["dialog", "Диалог"],
    ["listening", "Аудирование"], ["reading", "Чтение"],
  ];

  let LESSONS = [];   // normalized chapters
  let state = null;

  // ---------- State ----------
  function defaultState() {
    return {
      initialized: false,
      chapters: {},   // id -> {started, checklist:{}}
      srs: {},        // cardId -> SRS record
      streak: { count: 0, lastActive: null },
      savedNotes: [], // {id,title,content,date}
      settings: { openrouterKey: "", model: "deepseek/deepseek-v4-flash", notifyEnabled: false, notifyTime: "12:00", darkMode: "auto", hideRomaji: false },
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
    };
  }
  function loadState() {
    try { state = JSON.parse(localStorage.getItem(LS_STATE)) || defaultState(); }
    catch { state = defaultState(); }
    // backfill new fields
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
  let saveTimeout = null;
  function save(immediate = false) {
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
        toast("⚠️ Данные сокращены — слишком много заметок");
      } catch {
        const emergency = { ...state, savedNotes: [] };
        localStorage.setItem(LS_STATE, JSON.stringify(emergency));
        toast("⚠️ Заметки удалены — не хватило места в хранилище");
      }
    }
  }

  // ---------- XP & Level ----------
  function addXP(amount) {
    state.xp += amount;
    while (state.xp >= XP_PER_LEVEL) {
      state.xp -= XP_PER_LEVEL;
      state.level += 1;
      state.coins += COINS_PER_LEVEL;
      toast(`🎉 Уровень ${state.level}! +${COINS_PER_LEVEL} 🪙`);
    }
    save();
  }

  // ---------- Rank System ----------
  function getUserRankData(level) {
    // Защита от выхода за рамки (максимум 96 уровень для расчета значков)
    const effectiveLevel = Math.max(1, Math.min(96, level));

    // Определяем лигу (каждая лига длится 24 уровня)
    let league = "alpha";
    let leagueName = "Альфа";
    let baseLevel = effectiveLevel;

    if (effectiveLevel > 72) {
      league = "delta";
      leagueName = "Дельта Мастер";
      baseLevel = effectiveLevel - 72;
    } else if (effectiveLevel > 48) {
      league = "gamma";
      leagueName = "Гамма";
      baseLevel = effectiveLevel - 48;
    } else if (effectiveLevel > 24) {
      league = "beta";
      leagueName = "Бета";
      baseLevel = effectiveLevel - 24;
    }

    // Определяем номер значка от 01 до 12 (растет каждые 2 уровня)
    const iconNumber = Math.ceil(baseLevel / 2);
    const paddedNumber = String(iconNumber).padStart(2, '0');

  return {
    name: `${leagueName} — Ранг ${iconNumber}`,
    leagueName: leagueName,
    levelSuffix: `Ранг ${iconNumber}`,
    icon: `${league}_${paddedNumber}.png`
  };
}

// ===== COMPLETION SCREEN (ЭКРАН УСПЕХА) =====
function showCompletionScreen(options) {
  console.log("=== ВНУТРИ showCompletionScreen ===");
  console.log("Полученные опции:", options);
  
  const {
    title = "おめでとう!",
    subtitle = "Congratulations!",
    desc = "You completed the session!",
    theme = "success", // 'success' или 'levelup'
    rewards = [], // [{icon: "🪙", label: "+10 XP"}, ...]
    onContinue = null
  } = options;

  const overlay = document.getElementById("completion-overlay");
  console.log("Overlay найден в DOM:", !!overlay);
  
  if (!overlay) {
    console.error("❌ Completion overlay не найден в DOM!");
    return;
  }

  console.log("Классы до показа:", overlay.className);
  console.log("Display до показа:", window.getComputedStyle(overlay).display);
  console.log("Opacity до показа:", window.getComputedStyle(overlay).opacity);

  // Заполнить контент
  document.getElementById("completion-title").textContent = title;
  document.getElementById("completion-subtitle").textContent = subtitle;
  document.getElementById("completion-desc").textContent = desc;

  // Установить тему (цвет фона)
  if (theme === "levelup") {
    overlay.style.background = "linear-gradient(135deg, #1a0a2e 0%, #2a1a4e 100%)";
  } else {
    overlay.style.background = "linear-gradient(135deg, #1E3A2F 0%, #2E4A3F 100%)";
  }

  // Сгенерировать награды
  const rewardsContainer = document.getElementById("completion-rewards");
  rewardsContainer.innerHTML = rewards.map(r =>
    `<div class="reward-item">
      <span class="reward-icon">${r.icon}</span>
      <span class="reward-label">${r.label}</span>
    </div>`
  ).join("");

  // Показать оверлей
  overlay.classList.remove("hidden");

  console.log("Классы после показа:", overlay.className);
  console.log("Display после показа:", window.getComputedStyle(overlay).display);
  console.log("Opacity после показа:", window.getComputedStyle(overlay).opacity);
  console.log("Z-index после показа:", window.getComputedStyle(overlay).zIndex);
  console.log("✅ Оверлей должен быть видимым!");

  // Обработчик кнопки
  const btn = document.getElementById("btn-completion-continue");
  btn.onclick = () => {
    console.log("Клик по кнопке CONTINUE");
    overlay.classList.add("hidden");
    if (onContinue) onContinue();
  };
}

// ---------- Data parsing / loading ----------
const LS_LESSON_VERSION = "kitsune_lessons_version_v1";

  async function loadLessons() {
    let raw = localStorage.getItem(LS_LESSONS);
    const cachedVersion = localStorage.getItem(LS_LESSON_VERSION);
    let res, data;
    try {
      res = await fetch("lesson.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (e) {
      console.error("Не удалось загрузить lesson.json:", e);
      if (raw) { LESSONS = JSON.parse(raw); return; }
      LESSONS = [];
      return;
    }
  const fileVersion = data.version || 0;
  if (!raw || String(cachedVersion) !== String(fileVersion)) {
    LESSONS = normalize(data);
    localStorage.setItem(LS_LESSONS, JSON.stringify(LESSONS));
    localStorage.setItem(LS_LESSON_VERSION, String(fileVersion));
  } else {
    LESSONS = JSON.parse(raw);
  }
    // Принудительно обновляем отображение глав после загрузки данных
    if (state && state.initialized) {
      renderHome();
    }
  }
  function normalize(data) {
    const lessons = data.lessons || data;
    const arr = (x) => Array.isArray(x) ? x : (x && typeof x === "object" ? Object.values(x) : []);
    return lessons.map((l) => {
      const id = l.lesson_id;
      const nm = CH_NAMES[id] || [l.title || "Глава " + id, ""];
      return {
        id,
        title: nm[0],
        jp: nm[1],
      words: arr(l.vocabulary).map((v) => ({
        id: v.id, kanji: v.kanji || v.writing, writing: v.writing, romaji: v.romaji, translation: v.translation, category: v.category,
      })),
        grammar: arr(l.notes).map((n) => ({ title: n.title, content: n.content })),
        cultural: arr(l.cultural_notes).map((n) => ({ title: n.title, content: n.content })),
      };
    });
  }
  function chState(id) {
    if (!state.chapters[id]) state.chapters[id] = { started: false, checklist: {} };
    return state.chapters[id];
  }
  function getLesson(id) { return LESSONS.find((l) => l.id === id); }

  // ---------- Streak + Daily Goal ----------
  const LS_LAST_ACTIVITY_DAY = "kitsune_last_activity_day";

  function getLastActivityDay() {
    return localStorage.getItem(LS_LAST_ACTIVITY_DAY);
  }
  function setLastActivityDay(t) {
    localStorage.setItem(LS_LAST_ACTIVITY_DAY, t);
  }

  function markActivity() {
    const t = todayStr();
    const s = state.streak;
    
    // Сброс dailyCards при смене дня (сохраняем в localStorage)
    const lastDay = getLastActivityDay();
    if (lastDay !== t) {
      state.dailyCards = 0;
      state._dailyGoalClaimed = false;
      setLastActivityDay(t);
    }
    
    // Увеличиваем счётчик ежедневных карточек и историю
    state.dailyCards += 1;
    state.history[t] = (state.history[t] || 0) + 1;
    
    // Обновляем прогресс квестов (daily_cards)
    if (window.QuestsManager) {
      window.QuestsManager.updateQuestProgress(state, "daily_cards", 1);
      window.QuestsManager.checkQuestReset(state);
    }
    
    // Проверяем достижения
    if (window.Achievements) {
      const newAchievements = window.Achievements.checkAll(state);
      newAchievements.forEach(ach => {
        toast(`🏆 ${ach.title}! ${ach.desc}`);
      });
    }
    
    // Награда за достижение дневной цели (dailyCards === 10)
    if (state.dailyCards === 10 && !state._dailyGoalClaimed) {
      state._dailyGoalClaimed = true;
      const reward = Math.min(10 + (2 * s.count), 50);
      state.coins += reward;
      toast(`🎯 Дневная цель! +${reward} 🪙`);
      save();
    }
    
    // Стрик продлевается ТОЛЬКО если dailyCards >= 10
    if (state.dailyCards < 10) {
      save();
      return;
    }
    
    if (s.lastActive === t) {
      save();
      return;
    }
    if (!s.lastActive) s.count = 1;
    else {
      const diff = Math.round((new Date(t) - new Date(s.lastActive)) / 86400000);
      if (diff === 1) {
        s.count += 1;
        // Награда за продление стрика
        const reward = Math.min(10 + (2 * s.count), 50);
        state.coins += reward;
        toast(`🔥 Стрик ${s.count} дней! +${reward} 🪙`);
      } else if (diff > 1) s.count = 1;
    }
    s.lastActive = t;
    save();
  }
  
  function resetDailyGoalFlag() {
    state._dailyGoalClaimed = false;
    setLastActivityDay(todayStr());
    save();
  }
  
  function pluralDays(n) {
    if (n % 10 === 1 && n % 100 !== 11) return "день";
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "дня";
    return "дней";
  }
  function refreshStreakDisplay() {
    const s = state.streak;
    let shown = s.count;
    if (s.lastActive) {
      const diff = Math.round((new Date(todayStr()) - new Date(s.lastActive)) / 86400000);
      if (diff > 1) shown = 0;
    } else shown = 0;
    
    // Круговой прогресс стрика
    const dailyGoal = Math.min(state.dailyCards / 10, 1);
    const pct = Math.round(dailyGoal * 100);
    const cBar = $("#streak-circle-progress");
    if (cBar) {
      if (state.dailyCards >= 10) {
        cBar.style.background = `conic-gradient(var(--orange) 0deg 360deg)`;
      } else {
        cBar.style.background = `conic-gradient(var(--orange) 0deg ${pct * 3.6}deg, var(--border) ${pct * 3.6}deg 360deg)`;
      }
    }
    
    const circleInner = $("#streak-circle-inner");
    if (circleInner) {
      circleInner.textContent = state.dailyCards >= 10 ? "🔥" : `${state.dailyCards}/10`;
    }
    
    // Линейный прогресс XP
    const xpPct = Math.min(state.xp / XP_PER_LEVEL * 100, 100);
    const xpBar = $("#xp-bar-fill");
    if (xpBar) xpBar.style.width = `${xpPct}%`;
    const xpText = $("#xp-bar-text");
    if (xpText) xpText.textContent = `${Math.round(state.xp)} / ${XP_PER_LEVEL} XP`;
    const levelText = $("#level-text");
    if (levelText) levelText.textContent = `Уровень ${state.level}`;
    
    // Монеты
    const coinsText = $("#coins-display");
    if (coinsText) coinsText.textContent = `🪙 ${state.coins}`;
    
    // Стрик текст
    const streakNum = $("#streak-num");
    if (streakNum) streakNum.textContent = shown;
    const daysEl = $(".streak-days");
    if (daysEl) daysEl.textContent = pluralDays(shown);
    const hintEl = $("#streak-hint");
    if (hintEl) {
      hintEl.textContent = shown > 0
        ? "Отличная работа! Продолжайте в том же духе."
        : "Решите 10 карточек, чтобы продлить стрик!";
    }
    
    // Применяем скин карточки стрика
    applyStreakSkin();
  }

  // ---------- Apply Streak Skin ----------
  function applyStreakSkin() {
    const card = $(".streak-card");
    if (!card) return;
    const skin = state.currentStreakSkin || "default";
    if (skin === "default") {
      card.removeAttribute("data-skin");
    } else {
      card.setAttribute("data-skin", skin);
    }
  }

  // ---------- Apply Theme ----------
  function applyCustomTheme() {
    const theme = state.currentTheme || "default";
    if (theme === "default") {
      // Если кастомная тема не выбрана, применяем обычную тему (auto/light/dark)
      applyTheme();
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }

  // ---------- SRS helpers ----------
  function dueCards(chapterId) {
    const now = Date.now();
    const seen = new Set();
    return Object.values(state.srs).filter((c) => {
      if (chapterId && cardChapter(c.id) !== chapterId) return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return SRS.isDue(c, now);
    });
  }
  function cardChapter(cardId) {
    const m = /^L(\d+)_/.exec(cardId);
    return m ? parseInt(m[1], 10) : null;
  }
  function allCards(chapterId) {
    return Object.values(state.srs).filter((c) => !chapterId || cardChapter(c.id) === chapterId);
  }
  function startChapter(id) {
    const cs = chState(id);
    if (cs.started) return;
    const lesson = getLesson(id);
    if (!lesson) { toast("Глава не найдена"); return; }
    cs.started = true;
    lesson.words.forEach((w) => { if (!state.srs[w.id]) state.srs[w.id] = SRS.newCard(w.id); });
    save();
    markActivity();
    toast("Глава начата! Слова добавлены в SRS 🎴");
  }
  function wordById(id) {
    for (const l of LESSONS) { const w = l.words.find((x) => x.id === id); if (w) return w; }
    return null;
  }
  
  // Проверка доступности слова на основе прогресса пользователя
  function isWordUnlocked(wordId) {
    const chapterId = cardChapter(wordId);
    if (!chapterId) return true; // Если не можем определить главу, разрешаем доступ
    const chapter = state.chapters[chapterId];
    if (!chapter) return false;
    
    // Корректно считаем выполненные пункты в объекте checklist
    const completedLessons = Object.values(chapter.checklist || {}).filter(val => val === true).length;
    return completedLessons >= 3;
  }

  // ---------- Tab Indicator Animation ----------
  function updateTabIndicator() {
    const activeTab = $(".tab.active");
    const indicator = $(".tab-indicator");
    if (activeTab && indicator) {
      indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      indicator.style.width = `${activeTab.offsetWidth}px`;
    }
  }

  // ---------- Navigation ----------
  const SCREENS = ["home", "profile", "chapter", "srs", "sensei", "library", "settings", "plan", "story", "quests", "ai-story", "crossword"];
function nav(name, opt, skipHistory = false) {
  SCREENS.forEach((s) => $("#screen-" + s).classList.toggle("hidden", s !== name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.nav === name));
  updateTabIndicator();
  
  // Добавляем в историю браузера (кроме случаев, когда skipHistory=true)
  if (!skipHistory) {
    history.pushState({ screen: name, opt: opt }, '', '');
  }
  
  if (name === "home") renderHome();
  if (name === "profile") renderProfile();
  if (name === "srs") renderSRSHome();
  if (name === "library") renderLibrary();
  if (name === "settings") renderSettings();
  if (name === "sensei") renderSensei();
  if (name === "chapter") renderChapter(opt);
  if (name === "plan") renderPlan();
  if (name === "quests") renderQuests();
  if (name === "ai-story") renderAIStory();
  if (name === "crossword") renderCrossword();
  window.scrollTo(0, 0);
  syncAvatars();
}

  // ---------- Avatar Sync ----------
  function syncAvatars() {
    const all = document.querySelectorAll(".logo-fox");
    all.forEach((el) => {
      el.textContent = state.currentAvatar || "🦊";
    });
  }

  // ---------- Format Time Until Reset ----------
  function formatTimeUntilReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const diff = tomorrow - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `⏰ ${hours}ч ${minutes}м`;
  }

  // ---------- Update Main Quests Timer ----------
  function updateMainQuestsTimer() {
    const timerEl = document.getElementById("main-quests-timer");
    if (timerEl) {
      timerEl.textContent = formatTimeUntilReset();
    }
  }

  // ---------- Render: Home ----------
  function renderHome() {
    refreshStreakDisplay();
    updateMainQuestsTimer();
    const due = dueCards().length;
    const total = allCards().length;
    $("#stat-due").textContent = due;
    $("#stat-cards").textContent = total;
    $("#stat-chapters").textContent = LESSONS.length;
    const btn = $("#btn-study-due");
    const extraBtn = $("#btn-extra-review");
    $("#study-due-label").textContent = due > 0 ? `Повторить ${due} карточек` : "Нет карточек к повторению";
    btn.disabled = due === 0;
    if (extraBtn) {
      extraBtn.classList.toggle("hidden", due > 0);
    }
    updateSrsBadge();

    const list = $("#chapter-list");
    list.innerHTML = "";
    LESSONS.forEach((l) => {
      const cs = chState(l.id);
      const items = CHECK_ITEMS.length;
      const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
      const pct = Math.round((done / items) * 100);
      const el = document.createElement("div");
      el.className = "chapter-card" + (cs.started ? " started" : "");
      el.dataset.testid = "chapter-card-" + l.id;
      el.innerHTML = `
        <div class="ch-badge">${l.id}</div>
        <div class="ch-main">
          <p class="ch-name">${l.title}</p>
          <p class="ch-sub">${l.jp || ""}</p>
          <div class="ch-prog"><i style="width:${pct}%"></i></div>
        </div>
        <div class="ch-arrow">›</div>`;
      el.onclick = () => nav("chapter", l.id);
      list.appendChild(el);
    });
    syncAvatars();
  }

  // ---------- AI Story Generator ----------
  function renderAIStory() {
    const body = $("#ai-story-body");
    
    body.innerHTML = `
      <div style="padding: 20px;">
        <div class="card">
          <h3 style="margin: 0 0 12px;">Ваш промпт</h3>
          <textarea 
            id="ai-story-prompt" 
            placeholder="Например: Создай историю про поход в магазин"
            style="width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: 14px; resize: vertical;"
          ></textarea>
          
          <label style="display: flex; align-items: center; gap: 8px; margin: 16px 0; cursor: pointer;">
            <input type="checkbox" id="use-weak-words" style="width: 18px; height: 18px; cursor: pointer;" />
            <span>Использовать слова, в которых я часто ошибаюсь</span>
          </label>
          
          <button class="btn-primary" id="generate-story-btn" style="width: 100%;">
            ✨ Сгенерировать историю
          </button>
        </div>
        
        <div id="ai-story-result" style="margin-top: 20px;"></div>
      </div>
    `;
    
    // Обработчик генерации
    const generateBtn = $("#generate-story-btn");
    if (generateBtn) {
      generateBtn.onclick = generateAndRenderStory;
    }
  }
  
  async function generateAndRenderStory() {
    const promptInput = $("#ai-story-prompt");
    const useWeakWordsCheckbox = $("#use-weak-words");
    const resultContainer = $("#ai-story-result");
    const generateBtn = $("#generate-story-btn");
    
    const prompt = promptInput.value.trim();
    
    if (!prompt) {
      toast("⚠️ Введите промпт для генерации истории");
      return;
    }
    
    // Проверка API ключа
    if (!state.settings.openrouterKey) {
      toast("⚠️ Укажите API-ключ OpenRouter в настройках");
      return;
    }
    
    // Получаем слабые слова, если чекбокс активен
    const weakWords = useWeakWordsCheckbox.checked ? getWeakWords(10) : [];
    
  // Показываем улучшенную загрузку
  generateBtn.disabled = true;
  generateBtn.textContent = "⏳ Генерация...";
  resultContainer.innerHTML = `
    <div class="card ai-loading-card">
      <div class="ai-loading-container">
        <div class="ai-loading-icon">🦊</div>
        <h3 class="ai-loading-title">AI генерирует историю</h3>
        <div class="typing"><i></i><i></i><i></i></div>
        <p class="ai-loading-hint">Это может занять 10-30 секунд</p>
      </div>
    </div>
  `;
    
    try {
      // Запрос к API
      const rawResponse = await API.generateAIStory(prompt, weakWords, state.settings);
      
      // Очистка от markdown (если ИИ не послушается)
      const cleaned = rawResponse
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      
      // Парсинг JSON
      let storyData;
      try {
        storyData = JSON.parse(cleaned);
      } catch (parseError) {
        console.error("Ошибка парсинга JSON:", parseError);
        console.log("Raw response:", rawResponse);
        throw new Error("API вернул невалидный JSON. Попробуйте переформулировать запрос.");
      }
      
      // Проверка структуры данных
      if (!storyData.story || !Array.isArray(storyData.story)) {
        throw new Error("Неверная структура данных в ответе API");
      }
      
      // Рендер через существующую функцию
      const storyHtml = renderInteractiveStory(storyData.story);
      
      resultContainer.innerHTML = `
        <div class="card">
          <h3 style="margin: 0 0 16px;">Сгенерированная история</h3>
          <div class="story-text">${storyHtml}</div>
        </div>
      `;
      
      // Активация обработчиков токенов
      setupTranslationToggleHandlers();
      
      toast("✅ История сгенерирована!");
      
    } catch (error) {
      console.error("Ошибка генерации истории:", error);
      resultContainer.innerHTML = `
        <div class="card" style="border-left: 4px solid var(--danger);">
          <h3 style="margin: 0 0 8px; color: var(--danger);">⚠️ Ошибка генерации</h3>
          <p>${error.message}</p>
        </div>
      `;
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "✨ Сгенерировать историю";
    }
  }

// ---------- Render: Profile ----------
let heatmapMonth = null; // текущий месяц для тепловой карты (Date object)
let chartEndOffsetDays = 0; // смещение окна графика активности (0 = последние 14 дней до сегодня)
let achievementsExpanded = false; // состояние раскрытия списка достижений

function renderProfile() {
    if (!heatmapMonth) {
      const now = new Date();
      heatmapMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    // Вычисляем longest streak из истории
    let longestStreak = 0;
    let currentRun = 0;
    const sortedDates = Object.keys(state.history).sort();
    
    for (let i = 0; i < sortedDates.length; i++) {
      if (state.history[sortedDates[i]] > 0) {
        currentRun++;
        longestStreak = Math.max(longestStreak, currentRun);
        
        // Проверяем, что следующий день идёт подряд
        if (i < sortedDates.length - 1) {
          const currentDate = new Date(sortedDates[i]);
          const nextDate = new Date(sortedDates[i + 1]);
          const diffDays = Math.floor((nextDate - currentDate) / (1000 * 60 * 60 * 24));
          if (diffDays > 1) currentRun = 0;
        }
      } else {
        currentRun = 0;
      }
    }
    
    // Получаем данные о ранге пользователя
    const rankData = getUserRankData(state.level);
    
  const body = $("#profile-body");
  
  // Вычисляем прогресс XP (от 0 до 99)
  const currentXP = state.xp;
  const maxXP = 99;
  const xpPercent = Math.min((currentXP / maxXP) * 100, 100);
  
  body.innerHTML = `
    <div class="profile-header">
    <div class="profile-avatar" id="profile-avatar-display">${state.currentAvatar || "🦊"}</div>
    <h2 class="profile-name">Kitsune Genki</h2>
    <div class="profile-title" id="profile-title">${state.currentTitle || "Новичок"}</div>
    
      <!-- Капсула: иконка ранга перекрывает белую плашку -->
      <div class="profile-level-bar-container">
        <img src="rank/${rankData.icon}" class="profile-rank-icon" alt="${rankData.name}" />
        <div class="profile-level-bar-wrap">
          <div class="profile-level-bar-content">
            <div class="profile-level-bar-track">
              <div class="profile-level-bar-fill" style="width: ${xpPercent}%"></div>
            </div>
            <div class="profile-level-bar-text">${currentXP} / ${maxXP} XP</div>
          </div>
        </div>
      </div>
  </div>
      <div class="profile-stats">
        <div class="profile-stat-card">
          <div class="profile-stat-num">${state.level}</div>
          <div class="profile-stat-label">Уровень</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-label">${rankData.name}</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-num">${state.coins}</div>
          <div class="profile-stat-label">🪙 Монет</div>
        </div>
      </div>
      <div class="achievements-section">
        <h3 class="section-title">ДОСТИЖЕНИЯ</h3>
        <div class="achievements-progress" id="achievements-toggle">
          <div class="achievements-progress-text">
            <p class="achievements-progress-title">ПРОГРЕСС</p>
            <p class="achievements-progress-stats" id="achievements-stats">0 / 0</p>
          </div>
          <div class="achievements-progress-circle" id="achievements-circle"></div>
          <button class="achievements-toggle-btn" id="achievements-expand-btn">
            <span class="achievements-toggle-icon">🏆</span>
            <span class="achievements-toggle-text">Показать все</span>
          </button>
        </div>
        <div class="achievements-grid ${achievementsExpanded ? '' : 'collapsed'}" id="achievements-grid"></div>
      </div>
      <div class="profile-heatmap-wrap">
        <div class="heatmap-streak-card-modern">
          <div class="streak-modern-fire-wrap">
            <span class="streak-modern-emoji">🔥</span>
            <span class="streak-modern-num">${state.streak.count}</span>
          </div>
          <div class="streak-modern-info">
            <div class="streak-modern-title">Текущий стрик</div>
            <div class="streak-modern-record">Рекорд: ${longestStreak} дней</div>
          </div>
        </div>
        <div class="heatmap-calendar-card">
          <div class="heatmap-nav">
            <button class="heatmap-nav-btn" id="heatmap-prev">←</button>
            <span class="heatmap-month-label" id="heatmap-month-label">${monthLabel(heatmapMonth)}</span>
            <button class="heatmap-nav-btn" id="heatmap-next">→</button>
          </div>
          <div class="heatmap-legend" id="heatmap-legend"></div>
          <div class="heatmap-weekdays">
            <div class="heatmap-weekday">Su</div>
            <div class="heatmap-weekday">Mo</div>
            <div class="heatmap-weekday">Tu</div>
            <div class="heatmap-weekday">We</div>
            <div class="heatmap-weekday">Th</div>
            <div class="heatmap-weekday">Fr</div>
            <div class="heatmap-weekday">Sa</div>
          </div>
          <div class="heatmap-grid" id="heatmap-grid"></div>
        </div>
  </div>

    <!-- График активности повторений -->
    <div class="card chart-card" style="position: relative;">
      <div class="chart-header-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <h3 style="margin:0; font-size:18px;">Активность повторений</h3>
          <p class="muted" style="margin:4px 0 0; font-size:12px;">Количество карточек, повторенных за день.</p>
        </div>
        <div class="chart-nav" style="display:flex; gap:8px;">
          <button class="heatmap-nav-btn" id="chart-prev">←</button>
          <button class="heatmap-nav-btn" id="chart-next">→</button>
        </div>
      </div>
      <div class="chart-svg-container" style="width:100%; overflow-x:auto;"></div>
    </div>

    <!-- Тултип для графика и календаря -->
    <div id="chart-tooltip" class="chart-tooltip hidden"></div>
  `;

  renderAchievements();
  renderHeatmap();
  renderActivityChart();
    
    // Обработчик кнопки разворачивания достижений
    const expandBtn = $("#achievements-expand-btn");
    if (expandBtn) {
      // Установить начальное состояние кнопки
      const icon = expandBtn.querySelector(".achievements-toggle-icon");
      const text = expandBtn.querySelector(".achievements-toggle-text");
      if (achievementsExpanded) {
        text.textContent = "Скрыть";
        icon.textContent = "🔽";
      } else {
        text.textContent = "Показать все";
        icon.textContent = "🏆";
      }
      
      expandBtn.onclick = () => {
        const grid = $("#achievements-grid");
        
        if (grid.classList.contains("collapsed")) {
          grid.classList.remove("collapsed");
          achievementsExpanded = true;
          text.textContent = "Скрыть";
          icon.textContent = "🔽";
        } else {
          grid.classList.add("collapsed");
          achievementsExpanded = false;
          text.textContent = "Показать все";
          icon.textContent = "🏆";
        }
      };
    }
    
    $("#heatmap-prev").onclick = () => {
      heatmapMonth.setMonth(heatmapMonth.getMonth() - 1);
      renderProfile();
    };
    $("#heatmap-next").onclick = () => {
      heatmapMonth.setMonth(heatmapMonth.getMonth() + 1);
      renderProfile();
    };
    
    // Обработчики навигации графика активности
    $("#chart-prev").onclick = () => {
      chartEndOffsetDays += 7; // Сдвигаем окно на 7 дней в прошлое
      renderActivityChart();
    };
    $("#chart-next").onclick = () => {
      chartEndOffsetDays = Math.max(0, chartEndOffsetDays - 7); // Возвращаем к сегодняшнему дню (максимум 0)
      renderActivityChart();
    };
    
    syncAvatars();
  }

  function monthLabel(date) {
    return `${MONTHS_RU[date.getMonth()]} ${date.getFullYear()}`;
  }

  function heatmapLevel(count) {
    if (count === 0) return "0";
    if (count <= 2) return "1";
    if (count <= 5) return "2";
    if (count <= 10) return "3";
    return "4";
  }

  function renderAchievements() {
    if (!window.Achievements) return;
    
    const progress = window.Achievements.getProgress(state);
    const allAchievements = window.Achievements.getAll();
    
    const statsEl = $("#achievements-stats");
    if (statsEl) statsEl.textContent = `${progress.unlocked} / ${progress.total}`;
    
    const circleEl = $("#achievements-circle");
    if (circleEl) {
      const deg = Math.round((progress.percent / 100) * 360);
      circleEl.style.background = `conic-gradient(var(--orange) 0deg ${deg}deg, var(--border) ${deg}deg 360deg)`;
      circleEl.textContent = `${progress.percent}%`;
    }
    
    const gridEl = $("#achievements-grid");
    if (!gridEl) return;
    
    gridEl.innerHTML = allAchievements.map(ach => {
      const unlocked = state.unlockedAchievements.includes(ach.id);
      const claimed = state.claimedAchievements.includes(ach.id);
      const canClaim = unlocked && !claimed && ach.rewards;
      
      return `<div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
        ${unlocked ? '<span class="achievement-badge">✓</span>' : ''}
        <div class="achievement-emoji">${ach.emoji}</div>
        <h4 class="achievement-title">${ach.title}</h4>
        <p class="achievement-desc">${ach.desc}</p>
        ${canClaim ? `
          <button class="btn-claim-achievement" data-achievement-id="${ach.id}">
            Забрать награду
          </button>
        ` : ''}
        ${claimed ? '<span class="achievement-claimed-badge">Награда получена</span>' : ''}
      </div>`;
    }).join('');
    
    // Добавляем обработчики для кнопок "Забрать награду"
    $$(".btn-claim-achievement").forEach(btn => {
      btn.onclick = () => claimAchievementReward(btn.dataset.achievementId);
    });
  }

  function renderQuests() {
    if (!window.QuestsManager || !state.quests) return;

    // Получаем оба контейнера (на экране квестов и в профиле)
    const questsContainer = $("#quests-container");
    const profileQuestsContainer = $("#profile-quests-container");
    
    // Если ни один контейнер не найден, выходим
    if (!questsContainer && !profileQuestsContainer) return;
    
    const timeLeft = window.QuestsManager.getTimeUntilReset();
    
  // Рендерим Weekly Challenges
  const weeklyHtml = state.quests.weekly.map(challenge => {
    const progress = Math.min((challenge.current / challenge.target) * 100, 100);
    const canClaim = challenge.completed && !challenge.claimed;
    const claimed = challenge.claimed;
    
    return `
      <div class="quest-card weekly ${claimed ? 'claimed' : ''}">
        <div class="quest-icon-wrap">${challenge.icon}</div>
        <div class="quest-main">
          <div class="quest-header">
            <h4 class="quest-title">${challenge.title}</h4>
            <div class="quest-reward-pill">
              <span>${challenge.reward.xp} XP</span>
              <span>${challenge.reward.coins} 🪙</span>
            </div>
          </div>
          <p class="quest-desc">${challenge.desc}</p>
          <div class="quest-progress-row">
            <div class="quest-progress-bar">
              <div class="quest-progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="quest-counter">${challenge.current}/${challenge.target}</span>
          </div>
        </div>
        <div class="quest-action">
          ${canClaim ? 
            `<button class="btn-claim" data-quest-id="${challenge.id}">Забрать</button>` :
            claimed ? 
              `<button class="btn-claim claimed" disabled>✓</button>` :
              `<button class="btn-claim" disabled>Забрать</button>`
          }
        </div>
      </div>
    `;
  }).join('');
    
  // Рендерим Daily Quests
  const dailyQuestsHtml = state.quests.daily.map(quest => {
    const progress = Math.min((quest.current / quest.target) * 100, 100);
    const canClaim = quest.completed && !quest.claimed;
    const claimed = quest.claimed;
    
    return `
      <div class="quest-card daily ${claimed ? 'claimed' : ''}">
        <div class="quest-icon-wrap">${quest.icon}</div>
        <div class="quest-main">
          <div class="quest-header">
            <h4 class="quest-title">${quest.title}</h4>
            <div class="quest-reward-pill">
              <span>${quest.reward.xp} XP</span>
              <span>${quest.reward.coins} 🪙</span>
            </div>
          </div>
          <p class="quest-desc">${quest.desc}</p>
          <div class="quest-progress-row">
            <div class="quest-progress-bar">
              <div class="quest-progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="quest-counter">${quest.current}/${quest.target}</span>
          </div>
        </div>
        <div class="quest-action">
          ${canClaim ? 
            `<button class="btn-claim" data-quest-id="${quest.id}">Забрать</button>` :
            claimed ? 
              `<button class="btn-claim claimed" disabled>✓</button>` :
              `<button class="btn-claim" disabled>Забрать</button>`
          }
        </div>
      </div>
    `;
  }).join('');
    
    const dailyHtml = `
      <div class="daily-header">
        <span class="daily-label">DAILY QUESTS</span>
        <span class="daily-timer">⏰ ${timeLeft}</span>
      </div>
    ` + dailyQuestsHtml;
    
    console.log("DEBUG dailyHtml length:", dailyHtml.length);
    console.log("DEBUG state.quests.daily:", state.quests.daily);
    console.log("DEBUG dailyQuestsHtml:", dailyQuestsHtml);
    
    const fullHtml = weeklyHtml + dailyHtml;
    
    // Рендерим в оба контейнера, если они существуют
    if (questsContainer) {
      questsContainer.innerHTML = fullHtml;
    }
    if (profileQuestsContainer) {
      profileQuestsContainer.innerHTML = fullHtml;
    }
    
    // Добавляем обработчики для кнопок Claim в обоих контейнерах
    $$(".btn-claim:not([disabled])").forEach(btn => {
      btn.onclick = () => claimQuest(btn.dataset.questId);
    });
  }

  function claimQuest(questId) {
    if (!window.QuestsManager || !questId) return;
    
    const reward = window.QuestsManager.claimQuestReward(state, questId);
    if (!reward) return;
    
    // Начисляем награды
    state.xp += reward.xp;
    state.coins += reward.coins;
    
    // Проверяем повышение уровня
    while (state.xp >= XP_PER_LEVEL) {
      state.xp -= XP_PER_LEVEL;
      state.level += 1;
      state.coins += COINS_PER_LEVEL;
      toast(`🎉 Уровень ${state.level}! +${COINS_PER_LEVEL} 🪙`);
    }
    
    save();
    toast(`🎉 Получено: +${reward.xp} XP, +${reward.coins} 🪙`);
    
    // Обновляем отображение
    renderProfile();
    refreshStreakDisplay();
  }

  function claimAchievementReward(achievementId) {
    if (!window.Achievements || !achievementId) return;
    
    // Проверяем, не забрали ли награду уже
    if (state.claimedAchievements.includes(achievementId)) {
      toast("Награда уже получена");
      return;
    }
    
    // Находим достижение
    const achievement = window.Achievements.getAll().find(a => a.id === achievementId);
    if (!achievement || !achievement.rewards) {
      toast("Достижение не найдено");
      return;
    }
    
    // Проверяем, разблокировано ли достижение
    if (!state.unlockedAchievements.includes(achievementId)) {
      toast("Достижение еще не разблокировано");
      return;
    }
    
    // Начисляем награды
    const { xp, coins } = achievement.rewards;
    state.xp += xp;
    state.coins += coins;
    
    // Проверяем повышение уровня
    while (state.xp >= XP_PER_LEVEL) {
      state.xp -= XP_PER_LEVEL;
      state.level += 1;
      state.coins += COINS_PER_LEVEL;
      toast(`🎉 Уровень ${state.level}! +${COINS_PER_LEVEL} 🪙`);
    }
    
    // Отмечаем награду как полученную
    state.claimedAchievements.push(achievementId);
    save();
    
    // Показываем экран успеха
    showCompletionScreen({
      title: "おめでとう!",
      subtitle: achievement.title,
      desc: achievement.desc,
      theme: "success",
      rewards: [
        { icon: "🏆", label: "Достижение разблокировано!" },
        { icon: "⭐", label: `+${xp} XP` },
        { icon: "🪙", label: `+${coins} монет` }
      ],
      onContinue: () => {
        renderProfile();
        refreshStreakDisplay();
      }
    });
  }

  function renderHeatmap() {
    const grid = $("#heatmap-grid");
    const legend = $("#heatmap-legend");
    if (!grid) return;
    grid.innerHTML = "";
    
    const year = heatmapMonth.getFullYear();
    const month = heatmapMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();
    
    // Подсчитываем статистику для легенды
    let practiceCount = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      const key = `${year}-${mm}-${dd}`;
      if (state.history[key] && state.history[key] > 0) {
        practiceCount++;
      }
    }
    
    // Обновляем легенду
    if (legend) {
      legend.innerHTML = `
        <div class="heatmap-legend-item">
          <div class="heatmap-legend-dot practice"></div>
          <span>${practiceCount} day${practiceCount !== 1 ? 's' : ''} practiced</span>
        </div>
        <div class="heatmap-legend-item">
          <div class="heatmap-legend-dot restore"></div>
          <span>0 restores used</span>
        </div>
      `;
    }
    
    // Первый день месяца: 0=Вс, 1=Пн, ...
    const firstDay = new Date(year, month, 1).getDay();
    
    // Пустые ячейки до первого дня
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement("div");
      empty.className = "heatmap-day heatmap-empty";
      grid.appendChild(empty);
    }
    
    // Заполняем дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      const key = `${year}-${mm}-${dd}`;
      const count = state.history[key] || 0;
      
      const cell = document.createElement("div");
      cell.className = "heatmap-day";
      
      // Проверяем, является ли этот день сегодняшним
      const isToday = day === todayDate && month === todayMonth && year === todayYear;
      
      // Проверяем, является ли день будущим
      const cellDate = new Date(year, month, day);
      const isFuture = cellDate > today;
      
      if (isToday) {
        cell.classList.add("today");
      } else if (isFuture) {
        cell.classList.add("future");
      } else if (count > 0) {
        cell.classList.add("practiced");
      }
      
      cell.textContent = day;
      cell.title = count > 0 ? `${key}: ${count} карточек` : key;
      cell.onclick = (e) => {
        e.stopPropagation();
        const tooltip = $("#chart-tooltip");
        if (!tooltip) return;

        const d = new Date(key + "T00:00:00");
        const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
        
        tooltip.innerHTML = count > 0 
          ? `<b>${count} карточек</b><br><span style="font-size:12px; opacity:0.7;">${d.getDate()} ${months[d.getMonth()]}</span>`
          : `<b>0 карточек</b><br><span style="font-size:12px; opacity:0.7;">${d.getDate()} ${months[d.getMonth()]}</span>`;

        const rect = cell.getBoundingClientRect();
        const bodyEl = $("#profile-body");
        const bodyRect = bodyEl.getBoundingClientRect();

        tooltip.style.left = `${rect.left - bodyRect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.bottom - bodyRect.top + bodyEl.scrollTop + 8}px`;
        tooltip.classList.remove("hidden");
      };
      
      grid.appendChild(cell);
    }
  }

  // Генерация SVG-графика активности
  function generateActivityChartSVG(dates, counts) {
    const viewBoxWidth = 500;
    const viewBoxHeight = 340;
    const padding = { top: 30, right: 30, bottom: 60, left: 40 };
    const chartWidth = viewBoxWidth - padding.left - padding.right;
    const chartHeight = viewBoxHeight - padding.top - padding.bottom;
    
    // Минимальный лимит для maxCount
    const maxCount = Math.max(10, Math.max(...counts));
    
    // Координаты точек
    const points = dates.map((date, i) => {
      const x = padding.left + (i / (dates.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - (counts[i] / maxCount) * chartHeight;
      return { x, y, count: counts[i] };
    });
    
    // Линия (прямые отрезки)
    const linePath = points.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`
    ).join(' ');
    
    // Заливка под линией
    const areaPath = `M ${padding.left},${padding.top + chartHeight} ` +
      points.map(p => `L ${p.x},${p.y}`).join(' ') +
      ` L ${padding.left + chartWidth},${padding.top + chartHeight} Z`;
    
    // Точки-кружочки
    const circles = points.map((p, i) => 
      `<circle cx="${p.x}" cy="${p.y}" r="6" fill="var(--orange-dark)" class="chart-point" data-count="${p.count}" data-date="${dates[i]}" />`
    ).join('');
    
    // Ось X
    const axisY = padding.top + chartHeight;
    
    // Подписи дат (повернутые на -45 градусов)
    const monthNames = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    const dateLabels = dates.map((dateStr, i) => {
      const d = new Date(dateStr + "T00:00:00");
      const label = `${d.getDate()} ${monthNames[d.getMonth()]}`;
      const x = points[i].x;
      const y = axisY + 10;
      return `<text x="${x}" y="${y}" transform="rotate(-45, ${x}, ${y})" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="inherit">${label}</text>`;
    }).join('');
    
    return `
      <svg viewBox="0 0 500 340" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto;">
        <!-- Заливка -->
        <path d="${areaPath}" fill="var(--orange)" opacity="0.15" />
        
        <!-- Линия -->
        <path d="${linePath}" stroke="var(--orange)" stroke-width="4" fill="none" />
        
        <!-- Ось X -->
        <line x1="${padding.left}" y1="${axisY}" x2="${padding.left + chartWidth}" y2="${axisY}" stroke="var(--border)" stroke-width="1" />
        
        <!-- Точки -->
        ${circles}
        
        <!-- Подписи дат -->
        ${dateLabels}
      </svg>
    `;
  }

  // Рендеринг графика активности
  function renderActivityChart() {
    const container = $(".chart-svg-container");
    if (!container) return;
    
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - chartEndOffsetDays);
    
    const dates = [];
    const counts = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dates.push(dateStr);
      counts.push(state.history[dateStr] || 0);
    }
    
    container.innerHTML = generateActivityChartSVG(dates, counts);
    
    // Обработчики для тултипа
    $$(".chart-point").forEach(point => {
      point.onclick = (e) => {
        e.stopPropagation();
        const count = point.dataset.count;
        const dateStr = point.dataset.date;
        const d = new Date(dateStr + "T00:00:00");
        const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
        
        const tooltip = $("#chart-tooltip");
        tooltip.innerHTML = `<b>${count} карточек</b><br><span style="font-size:12px; opacity:0.7;">${d.getDate()} ${months[d.getMonth()]}</span>`;
        
        const rect = point.getBoundingClientRect();
        const bodyEl = $("#profile-body");
        const bodyRect = bodyEl.getBoundingClientRect();
        
        tooltip.style.left = `${rect.left - bodyRect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.bottom - bodyRect.top + bodyEl.scrollTop + 8}px`;
        tooltip.classList.remove("hidden");
      };
    });
    
    // Скрытие тултипа при клике вне графика
    document.addEventListener("click", () => {
      const t = $("#chart-tooltip");
      if (t) t.classList.add("hidden");
    });
  }

  // ---------- Shop ----------
  const SHOP_ITEMS = [
    // Аватарки
    { id: "kitsune", type: "avatar", emoji: "🦊", name: "Кицунэ (стандарт)", price: 0 },
    { id: "onigiri", type: "avatar", emoji: "🍙", name: "Онигири", price: 150 },
    { id: "sakura", type: "avatar", emoji: "🌸", name: "Сакура", price: 300 },
    { id: "matcha", type: "avatar", emoji: "🍵", name: "Маття", price: 150 },
    { id: "sushi", type: "avatar", emoji: "🍣", name: "Суши", price: 100 },
    { id: "bamboo", type: "avatar", emoji: "🎋", name: "Бамбук", price: 200 },
    { id: "torii", type: "avatar", emoji: "⛩️", name: "Врата Тории", price: 500 },
    { id: "fuji", type: "avatar", emoji: "🗻", name: "Фудзи", price: 500 },
    { id: "tengu", type: "avatar", emoji: "👺", name: "Тэнгу", price: 500 },
    { id: "dragon", type: "avatar", emoji: "🐉", name: "Дракон", price: 1000 },
    { id: "crown", type: "avatar", emoji: "👑", name: "Корона", price: 1500 },
    { id: "sensei", type: "avatar", emoji: "🎓", name: "Сенсей", price: 2000 },
    // Скины карточки стрика
    { id: "skin_default", type: "streakSkin", value: "default", name: "Карточка: Стандартная", price: 0, emoji: "🔥" },
    { id: "skin_sakura", type: "streakSkin", value: "sakura", name: "Карточка: Сакура", price: 200, emoji: "🌸" },
    { id: "skin_matcha", type: "streakSkin", value: "matcha", name: "Карточка: Маття", price: 200, emoji: "🍵" },
    { id: "skin_neo_tokyo", type: "streakSkin", value: "neo_tokyo", name: "Карточка: Ночной Токио", price: 250, emoji: "🌃" },
    { id: "skin_kanagawa", type: "streakSkin", value: "kanagawa", name: "Карточка: Волна Канагавы", price: 200, emoji: "🌊" },
    { id: "skin_akaryu", type: "streakSkin", value: "akaryu", name: "Карточка: Красный Дракон", price: 200, emoji: "⛩️" },
    { id: "skin_nezumi", type: "streakSkin", value: "nezumi", name: "Карточка: Эдо", price: 200, emoji: "🌑" },
    // Темы приложения
    { id: "theme_sakura", type: "theme", value: "sakura", name: "Тема: Сакура", price: 400, emoji: "🌸" },
    { id: "theme_matcha", type: "theme", value: "matcha", name: "Тема: Маття", price: 400, emoji: "🍵" },
    { id: "theme_neo_tokyo", type: "theme", value: "neo_tokyo", name: "Тема: Ночной Токио", price: 500, emoji: "🌃" },
    { id: "theme_kanagawa", type: "theme", value: "kanagawa", name: "Тема: Волна Канагавы", price: 400, emoji: "🌊" },
    { id: "theme_akaryu", type: "theme", value: "akaryu", name: "Тема: Красный Дракон", price: 400, emoji: "⛩️" },
    { id: "theme_nezumi", type: "theme", value: "nezumi", name: "Тема: Эдо", price: 400, emoji: "🐀" },
    // Титулы
    { id: "title_kohai", type: "title", value: "Кохай", name: "Титул: Кохай", price: 300, emoji: "👋" },
    { id: "title_sempai", type: "title", value: "Сэмпай", name: "Титул: Сэмпай", price: 600, emoji: "⭐" },
    { id: "title_samurai", type: "title", value: "Самурай словаря", name: "Титул: Самурай словаря", price: 800, emoji: "🗡️" },
    { id: "title_otaku", type: "title", value: "Отаку", name: "Титул: Отаку", price: 500, emoji: "🎮" },
    { id: "title_kanji", type: "title", value: "Покоритель Кандзи", name: "Титул: Покоритель Кандзи", price: 1200, emoji: "🀄" },
  ];

  let shopTab = "avatars";

  function renderShop() {
    const body = $("#shop-body");
    if (!body) return;
    
    // Инициализируем обработчики табов
    $$(".shop-tab").forEach((t) => {
      t.onclick = () => {
        shopTab = t.dataset.shopTab;
        renderShop();
      };
      t.classList.toggle("active", t.dataset.shopTab === shopTab);
    });
    
    // Фильтруем товары по типу
    const typeMap = {
      avatars: "avatar",
      skins: "streakSkin",
      themes: "theme",
      titles: "title",
    };
    const filterType = typeMap[shopTab] || "avatar";
    const items = SHOP_ITEMS.filter((item) => item.type === filterType);
    
    if (items.length === 0) {
      body.innerHTML = `<div class="empty"><div class="em">🛒</div><h3>Нет товаров</h3></div>`;
      return;
    }
    
    body.innerHTML = items.map((item) => {
      let owned, equipped;
      
      if (item.type === "avatar") {
        owned = state.unlockedAvatars.includes(item.emoji);
        equipped = state.currentAvatar === item.emoji;
      } else if (item.type === "streakSkin") {
        owned = state.unlockedStreakSkins.includes(item.value);
        equipped = state.currentStreakSkin === item.value;
      } else if (item.type === "theme") {
        owned = state.unlockedThemes.includes(item.value);
        equipped = state.currentTheme === item.value;
      } else if (item.type === "title") {
        owned = state.unlockedTitles.includes(item.value);
        equipped = state.currentTitle === item.value;
      }
      
      const canBuy = state.coins >= item.price;
      
      let btnHtml;
      if (item.price === 0) {
        btnHtml = `<button class="btn-shop equipped" disabled>✓ Бесплатно</button>`;
      } else if (owned && equipped) {
        btnHtml = `<button class="btn-shop equipped" disabled>✓ Установлено</button>`;
      } else if (owned) {
        btnHtml = `<button class="btn-shop btn-shop-equip" data-id="${item.id}">Установить</button>`;
      } else if (canBuy) {
        btnHtml = `<button class="btn-shop btn-shop-buy" data-id="${item.id}" data-price="${item.price}">Купить за ${item.price} 🪙</button>`;
      } else {
        btnHtml = `<button class="btn-shop btn-shop-buy" disabled>${item.price} 🪙</button>`;
      }
      
      return `<div class="shop-item">
        <div class="shop-item-emoji">${item.emoji}</div>
        <div class="shop-item-info">
          <div class="shop-item-name">${item.name}</div>
          <div class="shop-item-price">${owned ? "✓ Куплено" : `${item.price} 🪙`}</div>
        </div>
        ${btnHtml}
      </div>`;
    }).join("");
    
    // Обработчики покупки
    $$(".btn-shop-buy").forEach((btn) => {
      if (!btn.disabled) {
        btn.onclick = () => {
          const id = btn.dataset.id;
          const price = parseInt(btn.dataset.price, 10);
          const item = SHOP_ITEMS.find((i) => i.id === id);
          if (!item) return;
          if (state.coins >= price) {
            state.coins -= price;
            if (item.type === "avatar") {
              state.unlockedAvatars.push(item.emoji);
            } else if (item.type === "streakSkin") {
              state.unlockedStreakSkins.push(item.value);
            } else if (item.type === "theme") {
              state.unlockedThemes.push(item.value);
            } else if (item.type === "title") {
              state.unlockedTitles.push(item.value);
            }
            save();
            toast(`🎉 Куплен ${item.name}!`);
            renderShop();
          }
        };
      }
    });
    // Обработчики установки
    $$(".btn-shop-equip").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const item = SHOP_ITEMS.find((i) => i.id === id);
        if (!item) return;
        if (item.type === "avatar") {
          state.currentAvatar = item.emoji;
          save();
          syncAvatars();
          toast(`Аватар установлен ${item.emoji}`);
        } else if (item.type === "streakSkin") {
          state.currentStreakSkin = item.value;
          save();
          applyStreakSkin();
          toast(`Скин карточки установлен: ${item.name}`);
        } else if (item.type === "theme") {
          state.currentTheme = item.value;
          state.settings.darkMode = "custom";
          save();
          applyCustomTheme();
          toast(`Тема установлена: ${item.name}`);
        } else if (item.type === "title") {
          state.currentTitle = item.value;
          save();
          toast(`Титул установлен: ${item.value}`);
        }
        renderShop();
      };
    });
  }

  // ---------- Render: Chapter ----------
  function renderChapter(id) {
    const l = getLesson(id);
    if (!l) { toast("Глава не найдена"); nav("home"); return; }
    const cs = chState(id);
    $("#chapter-title").textContent = `Глава ${id}: ${l.title}`;
    $("#chapter-jp").textContent = l.jp || "";
    const body = $("#chapter-body");
    const items = CHECK_ITEMS.length;
    const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
    const total = allCards(id).length;
    const due = dueCards(id).length;

    const startBlock = cs.started
      ? `<div class="card srs-mini">
           <div class="m"><b>${total}</b><span>карточек</span></div>
           <div class="m due"><b>${due}</b><span>к повтору</span></div>
           <button class="btn-study-sm" id="ch-study" ${due === 0 ? "disabled" : ""} data-testid="chapter-study-btn">Учить →</button>
         </div>`
      : `<button class="btn-primary" id="ch-start" data-testid="start-chapter-btn">▶ Начать главу</button>
         <p class="muted" style="text-align:center;margin:10px 0 18px;font-size:13px">Слова и грамматика заблокированы до старта главы 🔒</p>`;

    body.innerHTML = `
      <div class="card">
        <div class="row-between"><span class="card-h" style="margin:0">Прогресс</span><b style="color:var(--orange)">${done}/${items}</b></div>
        <div class="prog-dash">
          <i class="segment ${done >= 1 ? 'active' : ''}"></i>
          <i class="segment ${done >= 2 ? 'active' : ''}"></i>
          <i class="segment ${done >= 3 ? 'active' : ''}"></i>
          <i class="segment ${done >= 4 ? 'active' : ''}"></i>
          <i class="segment ${done >= 5 ? 'active' : ''}"></i>
        </div>
      </div>
      ${startBlock}
      <div class="card">
        <h3 class="card-h">Чек-лист главы</h3>
        ${CHECK_ITEMS.map((c) => {
          const locked = !cs.started;
          const checked = !!cs.checklist[c[0]];
          return `<div class="check-item ${checked ? "done" : ""} ${locked ? "locked" : ""}" data-check="${c[0]}" data-testid="check-${c[0]}">
            <div class="checkbox">${checked ? "✓" : ""}</div>
            <span class="check-label">${c[1]}</span>
          </div>`;
        }).join("")}
      </div>
      <div class="card">
        <h3 class="card-h">Ключевые темы</h3>
        <div class="tag-row">${[...new Set(l.words.map((w) => w.category))].slice(0, 8).map((c) => `<span class="tag">${c}</span>`).join("")}</div>
      </div>`;

    if (cs.started) {
      $("#ch-study").onclick = () => startFlash(id);
    } else {
      $("#ch-start").onclick = () => { startChapter(id); renderChapter(id); renderHome(); };
    }
    $$("#chapter-body .check-item").forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Автоматически начинаем главу при первой отметке чек-листа
        if (!cs.started) {
          startChapter(id);
        }
        
        const k = el.dataset.check;
        
        // Исправлено: теперь можно снимать галочки
        if (cs.checklist[k]) {
          // Снимаем галочку
          cs.checklist[k] = false;
          state.xp = Math.max(0, state.xp - XP_CHECK);
          toast(`❌ Отметка снята, -${XP_CHECK} XP`);
          save(true); markActivity();
          el.classList.remove("done");
          const cb = el.querySelector(".checkbox");
          if (cb) cb.textContent = "";
          const items = CHECK_ITEMS.length;
          const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
          $$("#chapter-body .prog-dash .segment").forEach((seg, idx) => {
            seg.classList.toggle("active", idx < done);
          });
        const progText = $("#chapter-body .row-between b");
        if (progText) progText.textContent = `${done}/${items}`;
        refreshStreakDisplay();
        return;
        }
        
        // Ставим галочку
        cs.checklist[k] = true;
        
        // XP награды за чек-лист
        addXP(XP_CHECK);
        toast(`+${XP_CHECK} XP за чек-лист!`);
        
        const doneCount = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
        if (doneCount === CHECK_ITEMS.length) {
          addXP(XP_CHAPTER_FULL);
          toast(`🎉 Глава пройдена! +${XP_CHAPTER_FULL} XP!`);
        }
        
        save(true); markActivity();
        el.classList.add("done");
        const cb = el.querySelector(".checkbox");
        if (cb) cb.textContent = "✓";
        const items = CHECK_ITEMS.length;
        const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
        $$("#chapter-body .prog-dash .segment").forEach((seg, idx) => {
          seg.classList.toggle("active", idx < done);
        });
        const progText = $("#chapter-body .row-between b");
        if (progText) progText.textContent = `${done}/${items}`;
      };
    });
  }

  // ---------- Flashcards ----------
  let flashQueue = [], flashIdx = 0, flashRevealed = false, flashCtx = null;
  let sessionManager = null; // SessionManager для внутрисессионного обучения
  
  function startFlash(chapterId) {
    flashCtx = chapterId || null;
    const dueCardsList = dueCards(chapterId);
    if (dueCardsList.length === 0) { toast("Нет карточек к повторению"); return; }
    
    // Сбрасываем состояние режима рисования
    kanjiSequence = [];
    currentKanjiIndex = 0;
    
    // Инициализируем SessionManager
    sessionManager = new SessionManager(dueCardsList);
    flashQueue = dueCardsList; // сохраняем для совместимости
    flashIdx = 0; 
    flashRevealed = false;
    nav("srs");
    renderFlash();
  }
  function renderSRSHome() {
    const body = $("#srs-body");
    const due = dueCards();
    const total = allCards().length;
    
    // Обновляем активное состояние табов (табы теперь в HTML)
    const tabsContainer = $("#srs-tabs-container");
    if (tabsContainer) {
      $$(".lib-tab", tabsContainer).forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === currentSRSTab);
        tab.onclick = () => {
          currentSRSTab = tab.dataset.tab;
          renderSRSHome();
        };
      });
    }
    
    // Очищаем body и рендерим только контент
    body.innerHTML = "";
    
    // Обработчики переключения табов (для совместимости, если табы еще в body)
    $$(".lib-tab", body).forEach(tab => {
      tab.onclick = () => {
        currentSRSTab = tab.dataset.tab;
        renderSRSHome();
      };
    });
    
    // Рендерим контент в зависимости от активного таба
    if (currentSRSTab === "repetition") {
      renderSRSRepetition();
    } else {
      renderDictionary();
    }
  }
  
  function renderSRSRepetition() {
    const content = $("#srs-body");
    if (!content) return;
    
    const due = dueCards();
    const total = allCards().length;
    
    if (total === 0) {
      content.innerHTML = emptyState("🎴", "Пока нет карточек", "Начните главу на Главном экране, чтобы добавить слова в повторение.");
      return;
    }
    
    content.innerHTML = `
      <div class="stat-row">
        <div class="stat-box"><div class="stat-num accent">${due.length}</div><div class="stat-cap">К повтору</div></div>
        <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-cap">Всего карточек</div></div>
      </div>
      <button class="btn-primary" id="srs-start" ${due.length === 0 ? "disabled" : ""} data-testid="srs-start-btn">🎴 ${due.length > 0 ? `Учить ${due.length} карточек` : "Всё повторено на сегодня!"}</button>
      <button class="btn-extra-review ${due.length > 0 ? "hidden" : ""}" id="srs-extra-review" data-testid="srs-extra-review-btn">➕ Доп. повторение (10 карточек)</button>
    `;
    
    const b = $("#srs-start");
    if (b) b.onclick = () => startFlash(null);
    const extraBtn = $("#srs-extra-review");
    if (extraBtn) extraBtn.onclick = startExtraReview;
  }
  
  // Функция отображения словаря
  function renderDictionary() {
    const content = $("#srs-body");
    if (!content) return;
    
    content.innerHTML = `
      <div class="dict-search-wrap">
        <input 
          type="search" 
          id="dict-search" 
          class="dict-search-input" 
          placeholder="🔍 Поиск слов..."
          autocomplete="off"
        />
      </div>
      <div id="dict-lessons-container"></div>
    `;
    
    renderDictionaryLessons();
    
    // Обработчик поиска с debounce
    const searchInput = $("#dict-search");
    let searchTimeout;
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          filterDictionaryWords(e.target.value);
        }, 300);
      });
    }
  }
  
  // Функция рендеринга списка уроков и слов
  function renderDictionaryLessons(searchQuery = "") {
    const container = $("#dict-lessons-container");
    if (!container) return;
    
    const query = searchQuery.toLowerCase().trim();
    let totalVisible = 0;
    
    container.innerHTML = LESSONS.map((lesson) => {
      const words = lesson.words || [];
      
      // Фильтруем слова по поисковому запросу
      const filteredWords = query ? words.filter(word => {
        return (word.kanji && word.kanji.toLowerCase().includes(query)) ||
               (word.writing && word.writing.toLowerCase().includes(query)) ||
               (word.romaji && word.romaji.toLowerCase().includes(query)) ||
               (word.translation && word.translation.toLowerCase().includes(query));
      }) : words;
      
      if (filteredWords.length === 0 && query) {
        return ''; // Скрываем урок, если нет подходящих слов
      }
      
      totalVisible += filteredWords.length;
      
      const wordsHtml = filteredWords.map(word => {
        // Проверяем доступность слова
        const isUnlocked = isWordUnlocked(word.id);
        const chapterId = cardChapter(word.id);
        
        // Вычисляем прогресс из state.srs
        const srsRecord = state.srs[word.id];
        let progress = 0;
        let progressClass = 'progress-none';
        
        if (srsRecord) {
          progress = srsRecord.progress || 0;
          if (progress >= 75) progressClass = 'progress-high';
          else if (progress >= 25) progressClass = 'progress-medium';
          else progressClass = 'progress-low';
        }
        
        // Если слово заблокировано, показываем другой контент
        if (!isUnlocked) {
          return `
            <div class="dict-word-card word-locked" data-word-id="${word.id}" data-chapter-id="${chapterId}">
              <div class="dict-word-main">
                <div class="dict-word-lock-icon">🔒</div>
                <div class="dict-word-kanji">${word.kanji || word.writing}</div>
                <div class="dict-word-info">
                  <div class="dict-word-reading">・・・</div>
                  <div class="dict-word-translation">Откроется в Главе ${chapterId}</div>
                </div>
              </div>
              <div class="dict-word-progress">
                <div class="dict-progress-bar">
                  <div class="dict-progress-fill progress-none" style="width: 0%"></div>
                </div>
                <span class="dict-progress-text">🔒</span>
              </div>
            </div>
          `;
        }
        
        return `
          <div class="dict-word-card" data-word-id="${word.id}">
            <div class="dict-word-main">
              <div class="dict-word-kanji">${word.kanji || word.writing}</div>
              <div class="dict-word-info">
                <div class="dict-word-reading">${word.writing}</div>
                <div class="dict-word-translation">${word.translation}</div>
              </div>
            </div>
            <div class="dict-word-progress">
              <div class="dict-progress-bar">
                <div class="dict-progress-fill ${progressClass}" style="width: ${progress}%"></div>
              </div>
              <span class="dict-progress-text">${progress}%</span>
            </div>
          </div>
        `;
      }).join('');
      
      return `
        <div class="dict-lesson">
          <div class="dict-lesson-header">
            <h3 class="dict-lesson-title">Lesson ${lesson.id}: ${lesson.title}</h3>
            <span class="dict-lesson-count">${filteredWords.length} слов</span>
          </div>
          <div class="dict-words-list">
            ${wordsHtml}
          </div>
        </div>
      `;
    }).join('');
    
    // Показываем сообщение, если ничего не найдено
    if (query && totalVisible === 0) {
      container.innerHTML = emptyState("🔍", "Ничего не найдено", `По запросу "${searchQuery}" слова не найдены.`);
      return;
    }
    
    // Добавляем обработчики кликов на карточки слов
    $$(".dict-word-card").forEach(card => {
      card.onclick = () => {
        const wordId = card.dataset.wordId;
        
        // Проверяем, заблокирована ли карточка
        if (card.classList.contains('word-locked')) {
          const chapterId = card.dataset.chapterId;
          toast(`🔒 Начните Главу ${chapterId}, чтобы разблокировать это слово`);
          return;
        }
        
        const word = wordById(wordId);
        if (word) openDictionaryModal(word);
      };
    });
  }
  
  // Функция фильтрации слов
  function filterDictionaryWords(searchQuery) {
    renderDictionaryLessons(searchQuery);
  }
  
  // Функция открытия модального окна с деталями слова
  function openDictionaryModal(word) {
    const body = $("#srs-body");
    if (!body) return;
    
    const kanjiChars = getAllKanji(word.kanji || word.writing);
    const hasKanji = kanjiChars.length > 0;
    
    // Сохраняем текущее состояние для возврата
    const returnToDict = () => {
      currentSRSTab = "dictionary";
      renderSRSHome();
    };
    
    let currentKanjiIdx = 0;
    
    const renderModalContent = () => {
      const selectedKanji = hasKanji ? kanjiChars[currentKanjiIdx] : null;
      
      const kanjiTabsHtml = kanjiChars.length > 1 ? `
        <div class="dict-kanji-tabs">
          ${kanjiChars.map((k, idx) => `
            <button class="dict-kanji-tab ${idx === currentKanjiIdx ? 'active' : ''}" data-kanji-idx="${idx}">
              ${k}
            </button>
          `).join('')}
        </div>
      ` : '';
      
      body.innerHTML = `
        <div class="dict-modal">
          <div class="dict-modal-header">
            <button class="btn-ghost" id="dict-modal-close">← Назад</button>
            <h2 class="dict-modal-title">${word.kanji || word.writing}</h2>
          </div>
          
          <div class="dict-modal-content">
            <div class="dict-modal-info">
              <p class="dict-modal-reading">${word.writing}</p>
              <p class="dict-modal-translation">${word.translation}</p>
              ${word.romaji ? `<p class="dict-modal-romaji">${word.romaji}</p>` : ''}
            </div>
            
            ${hasKanji ? `
              ${kanjiTabsHtml}
              <div class="dict-kanji-writer-container">
                <div id="dict-kanji-writer-target"></div>
              </div>
              <div class="dict-kanji-controls">
                <button class="btn-secondary" id="dict-animate-btn">🎬 Анимация черт</button>
                <button class="btn-secondary" id="dict-quiz-btn">✍️ Пропись</button>
              </div>
            ` : '<p class="dict-no-kanji">В этом слове нет кандзи для отрисовки</p>'}
          </div>
        </div>
      `;
      
      // Обработчик закрытия
      const closeBtn = $("#dict-modal-close");
      if (closeBtn) closeBtn.onclick = returnToDict;
      
      // Обработчики табов кандзи
      if (kanjiChars.length > 1) {
        $$(".dict-kanji-tab").forEach(tab => {
          tab.onclick = () => {
            currentKanjiIdx = parseInt(tab.dataset.kanjiIdx);
            renderModalContent();
          };
        });
      }
      
      // Инициализация HanziWriter
      if (hasKanji && selectedKanji) {
        initDictionaryKanjiWriter(selectedKanji);
      }
    };
    
    renderModalContent();
  }
  
  // Маппинг упрощенных японских кандзи (shinjitai) на традиционные китайские (kyūjitai)
  const kanjiSimplifiedToTraditional = {
    '専': '專', '学': '學', '図': '圖', '実': '實', '医': '醫',
    '体': '體', '国': '國', '会': '會', '帰': '歸', '万': '萬',
    '円': '圓', '亜': '亞', '仏': '佛', '単': '單', '号': '號',
    '売': '賣', '変': '變', '声': '聲', '寝': '寢', '広': '廣',
    '従': '從', '恵': '惠', '応': '應', '斎': '齋', '旧': '舊',
    '権': '權', '楽': '樂', '気': '氣', '温': '溫', '湾': '灣',
    '点': '點', '為': '爲', '画': '畫', '祈': '祈', '禅': '禪',
    '糸': '絲', '経': '經', '絵': '繪', '続': '續', '聴': '聽',
    '脳': '腦', '臓': '臟', '薬': '藥', '虫': '蟲', '号': '號',
    '覚': '覺', '観': '觀', '訳': '譯', '証': '證', '読': '讀',
    '辞': '辭', '鉄': '鐵', '関': '關', '雑': '雜', '霊': '靈',
    '顔': '顏', '駅': '驛', '黄': '黃', '黒': '黑', '歯': '齒'
  };
  
  // Функция инициализации HanziWriter для словаря
  async function initDictionaryKanjiWriter(kanji) {
    const target = document.getElementById("dict-kanji-writer-target");
    const container = target?.parentElement;
    const controls = document.querySelector(".dict-kanji-controls");
    
    if (!target || typeof HanziWriter === 'undefined') {
      toast("⚠️ HanziWriter не загружен");
      return;
    }
    
    target.innerHTML = "";
    target.style.touchAction = "none";
    
    // Функция загрузки данных кандзи с fallback
    const loadKanjiData = async (char) => {
      try {
        // Пытаемся загрузить исходный символ
        const response = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`);
        
        if (response.ok) {
          return await response.json();
        }
        
        // Если 404 и есть традиционный вариант, пробуем его
        if (response.status === 404 && kanjiSimplifiedToTraditional[char]) {
          const traditionalChar = kanjiSimplifiedToTraditional[char];
          const fallbackResponse = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${traditionalChar}.json`);
          
          if (fallbackResponse.ok) {
            return await fallbackResponse.json();
          }
        }
        
        // Если ничего не помогло, выбрасываем ошибку
        throw new Error(`Данные для символа "${char}" недоступны`);
        
      } catch (error) {
        throw error;
      }
    };
    
    try {
      // Адаптивный размер в зависимости от ширины экрана
      const screenWidth = window.innerWidth;
      let writerSize = 280;
      if (screenWidth <= 400) {
        writerSize = 180;
      } else if (screenWidth <= 768) {
        writerSize = 200;
      }
      
      const writer = HanziWriter.create(target, kanji, {
        width: writerSize,
        height: writerSize,
        padding: 10,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 200,
        showOutline: true,
        showCharacter: true,
        
        // Цвета (единообразие с режимом рисования)
        strokeColor: '#1e293b',
        radicalColor: '#168F16',
        outlineColor: '#DDD',
        drawingColor: '#1e293b',
        drawingWidth: 16,
        
        charDataLoader: loadKanjiData,
        onLoadCharDataError: (error) => {
          console.warn(`Не удалось загрузить данные для "${kanji}":`, error);
          // Скрываем контейнер с полотном и кнопками
          if (container) container.style.display = 'none';
          if (controls) controls.style.display = 'none';
          // Показываем сообщение
          if (container && container.parentElement) {
            const message = document.createElement('p');
            message.className = 'dict-no-kanji';
            message.textContent = `Данные для отрисовки символа "${kanji}" недоступны`;
            container.parentElement.insertBefore(message, container);
          }
        }
      });
      
      // Кнопка анимации
      const animateBtn = $("#dict-animate-btn");
      if (animateBtn) {
        animateBtn.onclick = () => {
          writer.animateCharacter();
        };
      }
      
      // Кнопка прописи
      const quizBtn = $("#dict-quiz-btn");
      if (quizBtn) {
        quizBtn.onclick = () => {
          writer.quiz({
            showOutline: true,
            leniency: 1.2,
            onComplete: () => {
              toast("✅ Отлично!");
            }
          });
        };
      }
    } catch (error) {
      console.error("Ошибка инициализации HanziWriter:", error);
      // Скрываем контейнер с полотном и кнопками
      if (container) container.style.display = 'none';
      if (controls) controls.style.display = 'none';
      // Показываем сообщение об ошибке
      if (container && container.parentElement) {
        const message = document.createElement('p');
        message.className = 'dict-no-kanji';
        message.textContent = `Данные для отрисовки символа "${kanji}" недоступны`;
        container.parentElement.insertBefore(message, container);
      }
    }
  }
  
  // Глобальные переменные для SRS
  let currentSRSTab = "repetition"; // "repetition" или "dictionary"
  
  // Глобальная переменная для HanziWriter
  let currentWriter = null;
  let drawingMistakes = 0;
  let totalDrawingMistakes = 0; // Общее количество ошибок для всех кандзи в слове

  // Функция проверки, является ли строка одиночным кандзи
  function isSingleKanji(text) {
    if (!text || text.length === 0) return false;
    const code = text.charCodeAt(0);
    // Проверяем диапазоны кандзи (CJK Unified Ideographs)
    return (code >= 0x4E00 && code <= 0x9FFF) || // Основной блок
           (code >= 0x3400 && code <= 0x4DBF) || // Extension A
           (code >= 0x20000 && code <= 0x2A6DF); // Extension B
  }

  // Функция извлекает первый кандзи из текста
  function getFirstKanji(text) {
    if (!text) return null;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if ((code >= 0x4E00 && code <= 0x9FFF) ||
          (code >= 0x3400 && code <= 0x4DBF) ||
          (code >= 0x20000 && code <= 0x2A6DF)) {
        return text[i];
      }
    }
    return null;
  }

  // Функция извлечения всех кандзи из строки
  function getAllKanji(text) {
    if (!text) return [];
    const kanji = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if ((code >= 0x4E00 && code <= 0x9FFF) ||
          (code >= 0x3400 && code <= 0x4DBF) ||
          (code >= 0x20000 && code <= 0x2A6DF)) {
        kanji.push(text[i]);
      }
    }
    return kanji;
  }

  // Переменные для последовательного рисования
  let kanjiSequence = [];
  let currentKanjiIndex = 0;

  // Отрисовка ячеек прогресса
  function renderKanjiProgressCells() {
    const container = document.getElementById("kanji-progress-cells");
    if (!container || kanjiSequence.length === 0) {
      if (container) container.innerHTML = "";
      return;
    }

    container.innerHTML = kanjiSequence.map((k, idx) => {
      const classes = ['kanji-cell'];
      if (idx < currentKanjiIndex) classes.push('completed');
      if (idx === currentKanjiIndex) classes.push('current');
      
      const displayChar = idx < currentKanjiIndex ? k.kanji : '';
      return `<div class="${classes.join(' ')}">${displayChar}</div>`;
    }).join('');
  }

  // Функция инициализации режима рисования с HanziWriter
  function initDrawingMode(kanji, writing, translation, category, hideRomaji, romaji) {
    const target = document.getElementById("kanji-writer-target");
    if (!target || !kanji || typeof HanziWriter === 'undefined') {
      toast("⚠️ HanziWriter не загружен");
      return;
    }

    // 🛑 ВАЖНО: Блокируем скролл страницы при рисовании пальцем на мобилке
    target.style.touchAction = "none"; 

  // Инициализация последовательности, если это первый кандзи
  if (kanjiSequence.length === 0) {
    const kanjiChars = getAllKanji(kanji);
    kanjiSequence = kanjiChars.map(k => ({
      kanji: k,
      writing: writing,
      translation: translation,
      category: category,
      hideRomaji: hideRomaji,
      romaji: romaji
    }));
    currentKanjiIndex = 0;
    totalDrawingMistakes = 0; // Сброс общего счетчика ошибок для новой последовательности
  }

  renderKanjiProgressCells();
  drawingMistakes = 0;
    
    // Извлекаем текущий кандзи из последовательности
    const currentKanji = kanjiSequence[currentKanjiIndex].kanji;

    function startQuiz() {
      drawingMistakes = 0;
      if (!currentWriter) return;
      
      currentWriter.quiz({
    leniency: 1.2, // НЕ ИЗМЕНЯТЬ ЭТО ЗНАЧЕНИЕ
    onMistake: (strokeData) => {
      drawingMistakes++;
      totalDrawingMistakes++; // Накапливаем общее количество ошибок
          if (drawingMistakes >= 3) {
            currentWriter.updateColor('outlineColor', '#bbbbbb');
            currentWriter.showOutline();
            toast("💡 Слишком много ошибок. Дорисуйте по контуру");
          }
        },
        onComplete: (summaryData) => {
          // Переход к следующему кандзи в последовательности
          currentKanjiIndex++;
          
          if (currentKanjiIndex < kanjiSequence.length) {
            // Есть ещё кандзи для рисования
            const nextKanji = kanjiSequence[currentKanjiIndex];
            renderKanjiProgressCells();
            
            // Очищаем холст и инициализируем следующий кандзи
            const target = document.getElementById("kanji-writer-target");
            if (target) target.innerHTML = "";
            currentWriter = null;
            drawingMistakes = 0;
            
            initDrawingMode(
              nextKanji.kanji,
              nextKanji.writing,
              nextKanji.translation,
              nextKanji.category,
              nextKanji.hideRomaji,
              nextKanji.romaji
            );
            return;
          }
          
          // Все кандзи нарисованы - оцениваем карточку
          const quality = totalDrawingMistakes >= 3 ? 0 : 5;
          const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
          
          const resultText = quality === 5 
            ? "✅ Отлично! Нарисовано без подсказок" 
            : "📝 Нарисовано с подсказками";
          toast(resultText);
          
          if (window.QuestsManager && sessionManager) {
            const cardState = sessionManager.getCardState(card.id);
            const isFirstAttempt = cardState.sessionLapses === 0;
            
            if (quality >= 4 && isFirstAttempt) {
              window.QuestsManager.incrementStreakCorrect(state);
            } else if (quality < 3) {
              window.QuestsManager.resetStreakCorrect(state);
            }
          }
          
          if (sessionManager) {
            sessionManager.answerCard(card.id, quality, state.srs);
          } else {
            SRS.review(state.srs[card.id], quality);
            flashIdx += 1;
          }
          
          addXP(XP_CARD);
          save(true);
          markActivity();
          flashRevealed = false;
          
          // Сбрасываем последовательность
          kanjiSequence = [];
          currentKanjiIndex = 0;
          
          setTimeout(() => {
            renderFlash();
            updateSrsBadge();
          }, 300);
        }
      });
    }

    try {
      target.innerHTML = "";
      
      currentWriter = HanziWriter.create(target, currentKanji, {
        width: 280,
        height: 280,
        padding: 10,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 200,
        showOutline: false,
        showCharacter: false,
        
        // Цвета (идеально совпадают для плавного перехода)
        strokeColor: '#1e293b',       // Цвет готовой правильной черты
        drawingColor: '#1e293b',      // Цвет линии пользователя (тот же!)
        radicalColor: '#168F16',
        outlineColor: '#f2f2f2',
        
        // Толщина линии рисования
        drawingWidth: 16,
        
        // Настройки плавности перехода (примагничивание)
        drawingFadeDuration: 150,     // Скорость исчезновения неровного следа
        strokeFadeDuration: 200,      // Скорость появления идеального вектора
        
        // Чувствительность к точности
        strokeMismatchThreshold: 0.85, // Чувствительность распознавания
        leniency: 1.6                 // Снисходительность к отклонениям
      });

      const undoBtn = document.getElementById("drawing-undo");
      if (undoBtn) {
        undoBtn.onclick = () => {
          if (currentWriter) {
            // Возвращаем бледный контур, если он был сделан темным из-за 3 ошибок
            currentWriter.updateColor('outlineColor', '#f2f2f2');
            startQuiz(); // Перезапускаем викторину
          }
        };
      }

      const startBtn = document.getElementById("drawing-start");
      if (startBtn) {
        startBtn.onclick = () => {
          startQuiz();
        };
      }
      
      // Автозапуск quiz сразу после инициализации
      startQuiz();
    } catch (error) {
      console.error("Ошибка инициализации HanziWriter:", error);
      toast("⚠️ Ошибка загрузки кандзи: " + error.message);
      flashRevealed = true;
      renderFlash();
    }
  }

  // Функция показа карточки после завершения рисования
  function showCardAfterDrawing(kanji, writing, translation, category, hideRomaji, romaji) {
    const body = $("#srs-body");
    
    body.innerHTML = `
      <div class="flash-wrap">
        <div class="flash-top">
          <span class="flash-count" data-testid="flash-progress">${flashIdx + 1} / ${flashQueue.length}</span>
          <button class="btn-ghost" id="flash-exit">Выйти</button>
        </div>
        <div class="flash-card-3d" id="flash-card" data-testid="flash-card">
          <div class="flash-inner flipped">
            <div class="flash-front">
              <button class="flash-speak" id="flash-speak" aria-label="Озвучить">🔊</button>
              <div class="flash-cat">${category}</div>
              <p class="flash-jp">${kanji}</p>
              <p class="flash-tap-hint">Нажмите, чтобы показать ответ</p>
            </div>
            <div class="flash-back">
              <p class="flash-tr">${translation}</p>
              ${kanji !== writing ? `<p class="flash-reading">${writing}</p>` : ""}
              ${hideRomaji ? "" : `<p class="flash-romaji">${romaji}</p>`}
            </div>
          </div>
        </div>
        <div id="rate" class="">
          <div class="rate-row">
            <button class="rate-btn rate-again" data-q="0" data-testid="rate-again">Снова</button>
            <button class="rate-btn rate-hard" data-q="3" data-testid="rate-hard">Трудно</button>
            <button class="rate-btn rate-good" data-q="4" data-testid="rate-good">Хорошо</button>
            <button class="rate-btn rate-easy" data-q="5" data-testid="rate-easy">Легко</button>
          </div>
        </div>
      </div>`;

    // Озвучка
    speak(writing);
    const speakBtn = $("#flash-speak");
    if (speakBtn) speakBtn.onclick = (e) => { e.stopPropagation(); speak(writing); };

    // Кнопка выхода
    const exitBtn = $("#flash-exit");
    if (exitBtn) {
      exitBtn.onclick = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        
        console.log("=== Клик по кнопке Выход (SessionManager режим) ===");
        console.log("sessionManager:", sessionManager);
        if (sessionManager) {
          const stats = sessionManager.getStats();
          console.log("stats:", stats);
          console.log("stats.reviewed:", stats.reviewed);
          if (stats.reviewed > 0) {
            console.log("✓ Условие выполнено: stats.reviewed > 0, показываем экран успеха");
            // Показываем экран успеха с частичной статистикой
            showCompletionScreen({
              title: "おつかれさま!",
              subtitle: "Хорошая работа!",
              desc: `Вы повторили часть карточек`,
              theme: "success",
              rewards: [
                { icon: "📚", label: `${stats.reviewed} карточек` },
                { icon: "✨", label: `${stats.perfect} без ошибок` },
                { icon: "🪙", label: `+${stats.reviewed} XP` }
              ],
              onContinue: () => {
                sessionManager = null;
                flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
              }
            });
            return;
          }
        }
        // Если reviewed === 0 или нет SessionManager, просто выходим
        sessionManager = null;
        flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
      };
    }

    // Обработчики оценок
    $$("#rate .rate-btn").forEach((b) => {
      b.onclick = () => {
        const quality = parseInt(b.dataset.q, 10);
        const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
        
        // ✅ ИСПРАВЛЕНИЕ: Обновляем progress ДО answerCard (пока card.id еще валиден)
        const srsCard = state.srs[card.id];
        if (srsCard) {
          if (srsCard.progress === undefined) srsCard.progress = 0;
          
          if (quality === 0) srsCard.progress = Math.max(0, srsCard.progress - 5);       // Снова: -5%
          else if (quality === 3) srsCard.progress = Math.max(0, srsCard.progress - 3);  // Трудно: -3%
          else if (quality === 4) srsCard.progress = Math.min(100, srsCard.progress + 5); // Хорошо: +5%
          else if (quality === 5) srsCard.progress = Math.min(100, srsCard.progress + 10); // Отлично: +10%
        }
        
        // Трекинг для квеста "5 подряд" ДО обработки ответа
        if (window.QuestsManager && sessionManager) {
          const cardState = sessionManager.getCardState(card.id);
          const isFirstAttempt = cardState.sessionLapses === 0;
          
          if (quality >= 4 && isFirstAttempt) {
            window.QuestsManager.incrementStreakCorrect(state);
          } else if (quality < 3) {
            window.QuestsManager.resetStreakCorrect(state);
          }
        }
        
        // Используем SessionManager если доступен
        if (sessionManager) {
          sessionManager.answerCard(card.id, quality, state.srs);
        } else {
          // Fallback на старую логику
          SRS.review(state.srs[card.id], quality);
          flashIdx += 1;
        }
        
        addXP(XP_CARD);
        save(true);
        markActivity();
        flashRevealed = false;
        renderFlash();
        updateSrsBadge();
      };
    });
  }

  function renderFlash() {
    const body = $("#srs-body");
    
    // Очищаем предыдущий writer при переходе к следующей карточке
    if (currentWriter) {
      const target = document.getElementById("kanji-writer-target");
      if (target) {
        target.innerHTML = '';
      }
      currentWriter = null;
      drawingMistakes = 0;
    }
    
    // Проверяем завершение через SessionManager
    if (sessionManager && sessionManager.isSessionComplete()) {
      const stats = sessionManager.getStats();
      
      // Показываем экран успеха
      showCompletionScreen({
        title: "おめでとう!",
        subtitle: "Отличная работа!",
        desc: `Вы завершили сессию повторения`,
        theme: "success",
        rewards: [
          { icon: "📚", label: `${stats.reviewed} карточек` },
          { icon: "✨", label: `${stats.perfect} без ошибок` },
          { icon: "🪙", label: `+${stats.reviewed} XP` }
        ],
        onContinue: () => {
          sessionManager = null;
          flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
        }
      });
      return;
    }
    
    // Получаем следующую карточку через SessionManager
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
    if (!card) {
      // Fallback на старую логику если SessionManager не работает
      if (flashIdx >= flashQueue.length) {
        // Показываем экран успеха
        showCompletionScreen({
          title: "おめでとう!",
          subtitle: "Сессия завершена!",
          desc: `Повторено карточек: ${flashQueue.length}`,
          theme: "success",
          rewards: [
            { icon: "📚", label: `${flashQueue.length} карточек` },
            { icon: "🪙", label: `+${flashQueue.length} XP` }
          ],
          onContinue: () => {
            flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
          }
        });
        return;
      }
    }
    const w = wordById(card.id);
    if (!w) {
      toast("Ошибка: карточка не найдена");
      flashIdx += 1; renderFlash();
      return;
    }
    
    // Безопасные проверки для полей карточки с фоллбэками
    const displayKanji = w.kanji || w.writing || "???";
    const displayWriting = w.writing || "";
    const displayTranslation = w.translation || "???";
    const displayRomaji = w.romaji || "";
    const displayCategory = w.category || "";
    
    const hideRomaji = state.settings.hideRomaji || false;
    
    // Проверка на режим рисования (извлекаем все кандзи из слова)
    const allKanji = getAllKanji(displayKanji);
    const isDrawingMode = allKanji.length > 0 && Math.random() < DRAWING_MODE_PROBABILITY;
    
    if (isDrawingMode && !flashRevealed && allKanji.length > 0) {
      // Режим рисования (только при первом показе карты)
      const currentProgress = sessionManager ? sessionManager.stats.reviewed + 1 : flashIdx + 1;
      const totalCards = sessionManager ? sessionManager.stats.total : flashQueue.length;
      body.innerHTML = `
        <div class="flash-wrap">
          <div class="flash-top">
            <span class="flash-count" data-testid="flash-progress">${currentProgress} / ${totalCards}</span>
            <button class="btn-ghost" id="flash-exit">Выход</button>
          </div>
          <div class="drawing-mode">
            <div class="drawing-prompt">
              <p class="drawing-translation">${displayTranslation}</p>
                <p class="drawing-hint">Нарисуйте кандзи по памяти</p>
            </div>
            <div class="kanji-progress-cells" id="kanji-progress-cells"></div>
            <div id="kanji-writer-target" style="width: 300px; height: 300px; margin: 20px auto;"></div>
            <button class="btn-ghost" id="drawing-undo">↶ Отменить штрих</button>
          </div>
        </div>`;
    } else {
      // Обычный режим
      const currentProgress = sessionManager ? sessionManager.stats.reviewed + 1 : flashIdx + 1;
      const totalCards = sessionManager ? sessionManager.stats.total : flashQueue.length;
      body.innerHTML = `
        <div class="flash-wrap">
          <div class="flash-top">
            <span class="flash-count" data-testid="flash-progress">${currentProgress} / ${totalCards}</span>
            <button class="btn-ghost" id="flash-exit">Выход</button>
          </div>
          <div class="flash-card-3d" id="flash-card" data-testid="flash-card">
            <div class="flash-inner ${flashRevealed ? "flipped" : ""}">
              <div class="flash-front">
                <button class="flash-speak" id="flash-speak" aria-label="Озвучить">🔊</button>
                <div class="flash-cat">${displayCategory}</div>
                <p class="flash-jp">${displayKanji}</p>
                <p class="flash-tap-hint">Нажмите, чтобы показать ответ</p>
              </div>
              <div class="flash-back">
                <p class="flash-tr">${displayTranslation}</p>
                ${displayKanji !== displayWriting ? `<p class="flash-reading">${displayWriting}</p>` : ""}
                ${hideRomaji ? "" : `<p class="flash-romaji">${displayRomaji}</p>`}
              </div>
            </div>
          </div>
          <div id="rate" class="${flashRevealed ? "" : "hidden"}">
            <div class="rate-row">
              <button class="rate-btn rate-again" data-q="0" data-testid="rate-again">Снова</button>
              <button class="rate-btn rate-hard" data-q="3" data-testid="rate-hard">Трудно</button>
              <button class="rate-btn rate-good" data-q="4" data-testid="rate-good">Хорошо</button>
              <button class="rate-btn rate-easy" data-q="5" data-testid="rate-easy">Легко</button>
            </div>
          </div>
        </div>`;
    }
    // Инициализация режима рисования
    if (isDrawingMode && !flashRevealed && allKanji.length > 0 && typeof HanziWriter !== 'undefined') {
      initDrawingMode(displayKanji, displayWriting, displayTranslation, displayCategory, hideRomaji, displayRomaji);
    } else {
      // Обычный режим - озвучка ТОЛЬКО через кнопку, без автовоспроизведения
      const speakBtn = $("#flash-speak");
      if (speakBtn) speakBtn.onclick = (e) => { e.stopPropagation(); speak(displayWriting, speakBtn); };
      const cardEl = $("#flash-card");
      if (cardEl) {
        cardEl.onclick = () => { 
          if (!flashRevealed) { 
            flashRevealed = true; 
            const inner = document.querySelector(".flash-inner");
            const rate = document.getElementById("rate");
            if (inner) inner.classList.add("flipped");
            if (rate) rate.classList.remove("hidden");
          } 
        };
      }
    }
    
    const exitBtn = $("#flash-exit");
    if (exitBtn) {
      exitBtn.onclick = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        
        // Определяем количество пройденных карточек
        const cardsCompleted = sessionManager ? sessionManager.stats.reviewed : flashIdx;
        
        console.log("=== Клик по кнопке Выход ===");
        console.log("cardsCompleted:", cardsCompleted);
        
        // ВСЕГДА показываем экран успеха при выходе
        showCompletionScreen({
          title: cardsCompleted > 0 ? "おつかれさま!" : "До встречи!",
          subtitle: cardsCompleted > 0 ? "Хорошая работа!" : "Возвращайтесь скорее!",
          desc: cardsCompleted > 0 ? `Вы повторили ${cardsCompleted} карточек` : "Вы не повторили ни одной карточки",
          theme: "success",
          rewards: cardsCompleted > 0 ? [
            { icon: "📚", label: `${cardsCompleted} карточек` },
            { icon: "✨", label: sessionManager ? `${sessionManager.stats.perfect} без ошибок` : "" },
            { icon: "🪙", label: `+${cardsCompleted} XP` }
          ].filter(r => r.label) : [
            { icon: "👋", label: "Увидимся!" }
          ],
          onContinue: () => {
            sessionManager = null;
            flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
          }
        });
        return;
      };
    }
    $$("#rate .rate-btn").forEach((b) => {
      b.onclick = () => {
        const quality = parseInt(b.dataset.q, 10);
        const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
        
        // ✅ ИСПРАВЛЕНИЕ: Добавляем обновление progress ДО answerCard
        const srsCard = state.srs[card.id];
        if (srsCard) {
          if (srsCard.progress === undefined) srsCard.progress = 0;
          
          if (quality === 0) srsCard.progress = Math.max(0, srsCard.progress - 5);
          else if (quality === 3) srsCard.progress = Math.max(0, srsCard.progress - 3);
          else if (quality === 4) srsCard.progress = Math.min(100, srsCard.progress + 5);
          else if (quality === 5) srsCard.progress = Math.min(100, srsCard.progress + 10);
        }
        
        // Трекинг для квеста "5 подряд" ДО обработки ответа
        if (window.QuestsManager && sessionManager) {
          const cardState = sessionManager.getCardState(card.id);
          const isFirstAttempt = cardState.sessionLapses === 0;
          
          if (quality >= 4 && isFirstAttempt) {
            // Правильный ответ с первой попытки
            window.QuestsManager.incrementStreakCorrect(state);
          } else if (quality < 3) {
            // "Снова" или слишком низкая оценка — сбрасываем стрик
            window.QuestsManager.resetStreakCorrect(state);
          }
        }
        
        // Используем SessionManager если доступен
        if (sessionManager) {
          sessionManager.answerCard(card.id, quality, state.srs);
        } else {
          // Fallback на старую логику
          SRS.review(state.srs[card.id], quality);
          flashIdx += 1;
        }
        
        addXP(XP_CARD);
        save(true); 
        markActivity();
        flashRevealed = false;
        renderFlash();
        updateSrsBadge();
      };
    });
  }

  // ---------- Extra Review (Custom Study) ----------
  function startExtraReview() {
    const all = allCards();
    if (all.length === 0) {
      toast("Нет изученных карточек. Сначала начните главу.");
      return;
    }
    // Fisher–Yates shuffle
    const shuffled = [...all];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, Math.min(10, shuffled.length));
    selected.forEach((card) => {
      card.due = Date.now();
    });
    save();
    toast(`🍀 ${selected.length} старых карточек добавлены к повторению!`);
    // Обновляем UI
    renderHome();
    updateSrsBadge();
    // Запускаем сессию изучения
    startFlash(null);
  }

  // ---------- Web Speech (Japanese TTS) ----------
  let ttsAvailable = null; // null = не проверено, true/false = результат проверки
  
  function waitForJapaneseVoice() {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) { 
        ttsAvailable = false;
        resolve(null); 
        return; 
      }
      
      // Проверяем сразу доступные голоса
      const voices = speechSynthesis.getVoices();
      const found = voices.find((v) => v.lang && v.lang.startsWith("ja"));
      if (found) { 
        ttsAvailable = true;
        resolve(found); 
        return; 
      }
      
      // Если голосов нет, ждём события onvoiceschanged
      let resolved = false;
      
      speechSynthesis.onvoiceschanged = () => {
        if (resolved) return;
        resolved = true;
        
        const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith("ja"));
        speechSynthesis.onvoiceschanged = null;
        
        // Fallback: если японского голоса нет, берём любой доступный
        if (!v) {
          const anyVoice = speechSynthesis.getVoices()[0];
          ttsAvailable = anyVoice ? true : false;
          resolve(anyVoice || null);
        } else {
          ttsAvailable = true;
          resolve(v);
        }
      };
      
      // Увеличенный таймаут для мобильных устройств (5 секунд)
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        
        if (speechSynthesis.onvoiceschanged) {
          speechSynthesis.onvoiceschanged = null;
        }
        
        const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith("ja"));
        
        // Fallback: если японского голоса нет, берём любой доступный
        if (!v) {
          const anyVoice = speechSynthesis.getVoices()[0];
          ttsAvailable = anyVoice ? true : false;
          resolve(anyVoice || null);
        } else {
          ttsAvailable = true;
          resolve(v);
        }
      }, 5000);
    });
  }
  async function speak(text, buttonElement) {
    try {
      if (!("speechSynthesis" in window)) {
        toast("⚠️ Озвучка не поддерживается браузером");
        return;
      }
      
      // Проверяем доступность TTS при первом использовании
      if (ttsAvailable === null) {
        if (buttonElement) {
          buttonElement.textContent = "⏳";
          buttonElement.disabled = true;
        }
        await waitForJapaneseVoice();
        if (buttonElement) {
          buttonElement.textContent = "🔊";
          buttonElement.disabled = false;
        }
      }
      
      // Если TTS недоступен, показываем сообщение
      if (ttsAvailable === false) {
        toast("⚠️ Озвучка недоступна на этом устройстве");
        return;
      }
      
      const voice = await waitForJapaneseVoice();
      speechSynthesis.cancel();
      
      // Визуальная обратная связь
      if (buttonElement) {
        buttonElement.classList.add("speaking");
        buttonElement.textContent = "🔉";
      }
      
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.rate = 0.9;
      if (voice) u.voice = voice;
      
      // Обработчики событий для кнопки
      u.onend = () => {
        if (buttonElement) {
          buttonElement.classList.remove("speaking");
          buttonElement.textContent = "🔊";
        }
      };
      
      u.onerror = (e) => {
        console.warn("TTS error:", e);
        if (buttonElement) {
          buttonElement.classList.remove("speaking");
          buttonElement.textContent = "🔊";
        }
        if (e.error !== "canceled") {
          toast("⚠️ Ошибка озвучки");
        }
      };
      
      speechSynthesis.speak(u);
    } catch (e) {
      console.error("Speak error:", e);
      if (buttonElement) {
        buttonElement.classList.remove("speaking");
        buttonElement.textContent = "🔊";
      }
    }
  }

  // ---------- Get Weak Words ----------
  function getWeakWords(limit = 10) {
    // Получаем все карточки и сортируем по сложности
    return Object.values(state.srs)
      .filter(card => card.easeFactor < 2.5 || card.lapses > 2)
      .sort((a, b) => (a.easeFactor + a.lapses) - (b.easeFactor + b.lapses))
      .slice(0, limit)
      .map(card => {
        const word = wordById(card.id);
        return word ? (word.kanji || word.writing) : null;
      })
      .filter(Boolean);
  }

  // ========== CROSSWORD GAME ==========
  
  // Конвертер Хирагана → Катакана
  const HIRAGANA_TO_KATAKANA = {
    'あ': 'ア', 'い': 'イ', 'う': 'ウ', 'え': 'エ', 'お': 'オ',
    'か': 'カ', 'き': 'キ', 'く': 'ク', 'け': 'ケ', 'こ': 'コ',
    'さ': 'サ', 'し': 'シ', 'す': 'ス', 'せ': 'セ', 'そ': 'ソ',
    'た': 'タ', 'ち': 'チ', 'つ': 'ツ', 'て': 'テ', 'と': 'ト',
    'な': 'ナ', 'に': 'ニ', 'ぬ': 'ヌ', 'ね': 'ネ', 'の': 'ノ',
    'は': 'ハ', 'ひ': 'ヒ', 'ふ': 'フ', 'へ': 'ヘ', 'ほ': 'ホ',
    'ま': 'マ', 'み': 'ミ', 'む': 'ム', 'め': 'メ', 'も': 'モ',
    'や': 'ヤ', 'ゆ': 'ユ', 'よ': 'ヨ',
    'ら': 'ラ', 'り': 'リ', 'る': 'ル', 'れ': 'レ', 'ろ': 'ロ',
    'わ': 'ワ', 'を': 'ヲ', 'ん': 'ン',
    'が': 'ガ', 'ぎ': 'ギ', 'ぐ': 'グ', 'げ': 'ゲ', 'ご': 'ゴ',
    'ざ': 'ザ', 'じ': 'ジ', 'ず': 'ズ', 'ぜ': 'ゼ', 'ぞ': 'ゾ',
    'だ': 'ダ', 'ぢ': 'ヂ', 'づ': 'ヅ', 'で': 'デ', 'ど': 'ド',
    'ば': 'バ', 'び': 'ビ', 'ぶ': 'ブ', 'べ': 'ベ', 'ぼ': 'ボ',
    'ぱ': 'パ', 'ぴ': 'ピ', 'ぷ': 'プ', 'ぺ': 'ペ', 'ぽ': 'ポ',
    'ゃ': 'ャ', 'ゅ': 'ュ', 'ょ': 'ョ',
    'っ': 'ッ', 'ー': 'ー'
  };

  function hiraganaToKatakana(text) {
    return text.split('').map(char => HIRAGANA_TO_KATAKANA[char] || char).join('');
  }

  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Генератор кроссворда с ретраями (Правило 1)
  function generateCrossword(gridSize = 11) {
    const maxAttempts = 20;
    let bestResult = null;
    let bestScore = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = tryGenerateCrossword(gridSize);
      
      if (result && result.placedWords.length > bestScore) {
        bestScore = result.placedWords.length;
        bestResult = result;
      }

      // Если разместили достаточно слов, прекращаем попытки
      if (bestScore >= 6) break;
    }

    return bestResult;
  }

  function tryGenerateCrossword(gridSize = 11) {
    // Собираем пул разблокированных слов (исключая дубликаты чтений)
    const unlockedWords = [];
    const seenKana = new Set();

    LESSONS.forEach(lesson => {
      lesson.words.forEach(word => {
        if (isWordUnlocked(word.id) && word.writing) {
          if (seenKana.has(word.writing)) return; // Пропускаем дубликат
          seenKana.add(word.writing);

          unlockedWords.push({
            id: word.id,
            kana: word.writing,
            kanji: word.kanji || word.writing,
            translation: word.translation,
            length: word.writing.length
          });
        }
      });
    });

    if (unlockedWords.length < 6) return null;

    // Перемешиваем весь пул слов
    const shuffledWords = shuffleArray(unlockedWords);
    
    // Инициализируем сетку
    const grid = Array(gridSize).fill(null).map(() => 
      Array(gridSize).fill(null).map(() => ({ letter: null, wordIds: [] }))
    );
    const placedWords = [];
    
    // Оставшийся пул доступных слов
    const availableWords = [...shuffledWords];

    // Размещаем первое случайное слово горизонтально по центру
    const firstWord = availableWords.shift();
    const startRow = Math.floor(gridSize / 2);
    const startCol = Math.floor((gridSize - firstWord.length) / 2);

    for (let i = 0; i < firstWord.length; i++) {
      grid[startRow][startCol + i].letter = firstWord.kana[i];
      grid[startRow][startCol + i].wordIds.push(firstWord.id);
    }

    placedWords.push({
      word: firstWord,
      row: startRow,
      col: startCol,
      direction: 'across',
      number: 1
    });

    let wordNumber = 2;
    const maxWords = 10; // Целевое количество слов

    // Итеративно ищем пересечения для уже размещённых слов
    while (placedWords.length < maxWords && availableWords.length > 0) {
      let foundIntersection = false;

      // Проходим по всем уже размещённым словам
      for (const placedWord of placedWords) {
        if (foundIntersection) break;

        // Проходим по каждой букве размещённого слова
        for (let k = 0; k < placedWord.word.length; k++) {
          if (foundIntersection) break;
          const placedLetter = placedWord.word.kana[k];

          // Ищем слово в доступном пуле с такой же буквой
          for (let wordIdx = 0; wordIdx < availableWords.length; wordIdx++) {
            const word = availableWords[wordIdx];
            
            // Проверяем каждую букву кандидата
            for (let j = 0; j < word.length; j++) {
              const wordLetter = word.kana[j];

              if (wordLetter === placedLetter) {
                const newDirection = placedWord.direction === 'across' ? 'down' : 'across';
                let newRow, newCol;

                if (newDirection === 'down') {
                  newRow = placedWord.row - j;
                  newCol = placedWord.col + k;
                } else {
                  newRow = placedWord.row + k;
                  newCol = placedWord.col - j;
                }

                // Проверяем возможность размещения
                if (canPlaceWord(grid, word, newRow, newCol, newDirection, gridSize)) {
                  placeWord(grid, word, newRow, newCol, newDirection, wordNumber);
                  placedWords.push({
                    word,
                    row: newRow,
                    col: newCol,
                    direction: newDirection,
                    number: wordNumber
                  });
                  wordNumber++;
                  
                  // Удаляем использованное слово из пула
                  availableWords.splice(wordIdx, 1);
                  foundIntersection = true;
                  break;
                }
              }
            }
            
            if (foundIntersection) break;
          }
        }
      }

      // Если не нашли больше пересечений, выходим
      if (!foundIntersection) break;
    }

    // Баг #3: Классическая перенумерация кроссворда
    // Сбрасываем временную нумерацию в сетке и словах
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (grid[r][c]) {
          grid[r][c].number = null;
        }
      }
    }

    let currentNumber = 1;

    // Сканируем сетку в классическом порядке чтения (сверху-вниз, слева-направо)
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = grid[r][c];
        if (!cell || cell.letter === null) continue;

        // Ищем слова, которые начинаются в этой ячейке
        const startingWords = placedWords.filter(pw => pw.row === r && pw.col === c);

        if (startingWords.length > 0) {
          // Присваиваем номер ячейке
          cell.number = currentNumber;

          // Присваиваем номер всем словам, начинающимся в этой ячейке
          startingWords.forEach(pw => {
            pw.number = currentNumber;
          });

          currentNumber++;
        }
      }
    }

    // Формируем подсказки
    const clues = {
      across: placedWords.filter(p => p.direction === 'across').map(p => ({
        number: p.number,
        clue: `${p.word.kanji} — ${p.word.translation}`
      })),
      down: placedWords.filter(p => p.direction === 'down').map(p => ({
        number: p.number,
        clue: `${p.word.kanji} — ${p.word.translation}`
      }))
    };

    return { grid, placedWords, clues, gridSize };
  }

  function canPlaceWord(grid, word, row, col, direction, gridSize) {
    const length = word.length;

    // 1. Проверка границ
    if (direction === 'across') {
      if (col < 0 || col + length > gridSize || row < 0 || row >= gridSize) return false;
    } else {
      if (row < 0 || row + length > gridSize || col < 0 || col >= gridSize) return false;
    }

    // 2. Проверяем клетки до и после слова (они не должны быть заняты, чтобы слова не слипались торцами)
    if (direction === 'across') {
      if (col > 0 && grid[row][col - 1].letter !== null) return false;
      if (col + length < gridSize && grid[row][col + length].letter !== null) return false;
    } else {
      if (row > 0 && grid[row - 1][col].letter !== null) return false;
      if (row + length < gridSize && grid[row + length][col].letter !== null) return false;
    }

    // 3. Проверяем каждую позицию слова
    for (let i = 0; i < length; i++) {
      const r = direction === 'across' ? row : row + i;
      const c = direction === 'across' ? col + i : col;
      const cell = grid[r][c];
      const wordLetter = word.kana[i];

      if (cell.letter !== null) {
        // Если клетка занята, это должно быть валидное пересечение с совпадающей буквой
        if (cell.letter !== wordLetter) return false; 
        // Если буква совпадает, мы пересекаем слово. Нам не нужно проверять соседей этой клетки.
      } else {
        // Если клетка пустая, проверяем, чтобы она не касалась других слов боками (правило Adjacency)
        if (direction === 'across') {
          if (r > 0 && grid[r - 1][c].letter !== null) return false;
          if (r < gridSize - 1 && grid[r + 1][c].letter !== null) return false;
        } else {
          if (c > 0 && grid[r][c - 1].letter !== null) return false;
          if (c < gridSize - 1 && grid[r][c + 1].letter !== null) return false;
        }
      }
    }

    return true;
  }

  function placeWord(grid, word, row, col, direction, number) {
    for (let i = 0; i < word.length; i++) {
      const r = direction === 'across' ? row : row + i;
      const c = direction === 'across' ? col + i : col;
      grid[r][c].letter = word.kana[i];
      grid[r][c].wordIds.push(word.id);
      if (i === 0) grid[r][c].number = number;
    }
  }

  // Рендеринг кроссворда
  function renderCrossword() {
    const body = $("#crossword-body");

    // ИСПРАВЛЕНИЕ 2: Скрыть tabbar при входе в кроссворд
    const tabbar = document.getElementById('tabbar');
    if (tabbar) tabbar.classList.add('hidden');

    // Генерируем кроссворд
    const crosswordData = generateCrossword(11);

    if (!crosswordData || crosswordData.placedWords.length < 3) {
      body.innerHTML = `
        <div class="empty-state">
          <span style="font-size:60px">🧩</span>
          <h3>Недостаточно слов</h3>
          <p>Откройте больше глав, чтобы играть в кроссворд</p>
        </div>
      `;
      return;
    }

    const { grid, placedWords, clues, gridSize } = crosswordData;

    // Состояние игры
    let currentWord = null;
    let userAnswers = {}; // { wordId: {filled: [...буквы], correct: bool} }
    let completedWords = new Set();

    // Инициализируем ответы
    placedWords.forEach(pw => {
      userAnswers[pw.word.id] = { filled: Array(pw.word.length).fill(''), correct: false };
    });

    body.innerHTML = `
      <div class="crossword-game-layout">
        <!-- Кнопки зума (absolute positioning) -->
        <div class="cw-zoom-controls">
          <button class="cw-zoom-btn" id="cw-zoom-in">+</button>
          <button class="cw-zoom-btn" id="cw-zoom-out">−</button>
        </div>

        <!-- Скроллируемая область с сеткой -->
        <div class="crossword-board-area" id="crossword-board-area">
          <div class="crossword-grid" id="crossword-grid" style="
            grid-template-columns: repeat(${gridSize}, var(--cw-cell-size));
            grid-template-rows: repeat(${gridSize}, var(--cw-cell-size));
          ">
            ${renderGridCells(grid, gridSize, placedWords)}
          </div>
        </div>

        <!-- Фиксированная нижняя панель -->
        <div class="crossword-bottom-panel">
          <!-- Активная подсказка -->
          <div class="clue-panel hidden" id="clue-panel">
            <div class="clue-content">
              <span class="clue-translation" id="clue-translation"></span>
          <div class="clue-actions">
            <button class="clue-clear" id="clue-clear">🗑️</button>
            <button class="clue-hint" id="clue-hint">❓</button>
            <button class="clue-speak" id="clue-speak">🔊</button>
          </div>
            </div>
          </div>

          <!-- Кастомная клавиатура -->
          <div class="crossword-keyboard" id="crossword-keyboard"></div>
        </div>

        <!-- Скрытые подсказки (теперь не используются) -->
        <div class="crossword-clues" style="display: none;">
          <details>
            <summary><strong>По горизонтали</strong></summary>
            <ol>
              ${clues.across.map(c => `<li value="${c.number}">${c.clue}</li>`).join('')}
            </ol>
          </details>
          <details>
            <summary><strong>По вертикали</strong></summary>
            <ol>
              ${clues.down.map(c => `<li value="${c.number}">${c.clue}</li>`).join('')}
            </ol>
          </details>
        </div>
      </div>
    `;

  // Инициализация обработчиков
  initCrosswordHandlers(crosswordData, userAnswers, completedWords);

  // ИСПРАВЛЕНИЕ 1: Позиционирование ячеек в CSS Grid
  $$('.grid-cell').forEach(cell => {
    const r = cell.dataset.row;
    const c = cell.dataset.col;
    if (r !== undefined && c !== undefined) {
      cell.style.gridRow = parseInt(r) + 1;
      cell.style.gridColumn = parseInt(c) + 1;
    }
  });

  // Инициализация зума
  initCrosswordZoom();
}

  function renderGridCells(grid, gridSize, placedWords) {
    let html = '';

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const cell = grid[row][col];

      if (cell.letter === null) {
        html += `<div style="grid-row: ${row + 1}; grid-column: ${col + 1}"></div>`;
      } else {
        const number = cell.number || '';
        html += `
          <div class="grid-cell active" data-row="${row}" data-col="${col}" style="grid-row: ${row + 1}; grid-column: ${col + 1}">
            ${number ? `<span class="cell-number">${number}</span>` : ''}
            <div class="cell-kana">
              <span class="kana-hira" data-answer=""></span>
              <span class="kana-kata"></span>
            </div>
          </div>
        `;
      }
      }
    }

    return html;
  }

  function initCrosswordHandlers(crosswordData, userAnswers, completedWords) {
    const { placedWords, grid } = crosswordData;
    let currentWord = null;

    // Сохраняем в глобальное состояние для доступа из обработчиков
    window.cwState = {
      userAnswers: userAnswers,
      placedWords: placedWords,
      grid: grid
    };

    // ИСПРАВЛЕНИЕ 2: Обработчик кнопки "Назад" для показа tabbar
    const backBtn = document.querySelector('.icon-btn.back-btn[data-testid="crossword-back-btn"]');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        const tabbar = document.getElementById('tabbar');
        if (tabbar) tabbar.classList.remove('hidden');
        nav('sensei');
      };
    }

    // Обработчик клика по ячейке
    $$(".grid-cell.active").forEach(cell => {
      cell.onclick = () => {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);

        // Баг #2: Запрещаем удаление из правильных ячеек
        if (cell.classList.contains('correct')) {
          // Только выделяем слово, не удаляем букву
          const word = findWordAtCell(row, col, placedWords);
          if (word) {
            selectWord(word, crosswordData, userAnswers, completedWords);
          }
          return;
        }

        // Правило 4: Возврат кнопок при клике на заполненную ячейку
        const hiraSpan = cell.querySelector('.kana-hira');
        if (hiraSpan && hiraSpan.dataset.answer && currentWord) {
          const letter = hiraSpan.dataset.answer;
          
          // Стираем букву из ячейки
          hiraSpan.dataset.answer = '';
          hiraSpan.textContent = '';
          const kataSpan = cell.querySelector('.kana-kata');
          if (kataSpan) kataSpan.textContent = '';

          // Возвращаем кнопку на клавиатуру
          const keyboardBtns = $$('.kana-key');
          keyboardBtns.forEach(btn => {
            if (btn.dataset.letter === letter) {
              btn.disabled = false;
              btn.style.opacity = '1';
            }
          });

          // Обновляем userAnswers
          const wordData = findWordAtCell(row, col, placedWords);
          if (wordData) {
            const cellIndex = getCellIndexInWord(row, col, wordData);
            if (cellIndex !== -1) {
              userAnswers[wordData.word.id].filled[cellIndex] = '';
            }
          }

          return;
        }

        // Находим слово
        const word = findWordAtCell(row, col, placedWords);
        if (word) {
          selectWord(word, crosswordData, userAnswers, completedWords);
        }
      };
    });

    // Выбрать первое слово автоматически
    if (placedWords.length > 0) {
      selectWord(placedWords[0], crosswordData, userAnswers, completedWords);
    }

    // Обработчик скрытия панели при клике ВНЕ кроссворда
    const boardArea = document.getElementById('crossword-board-area');
    if (boardArea) {
      boardArea.addEventListener('click', (e) => {
        // Если клик НЕ по клетке кроссворда, скрываем панель
        if (!e.target.closest('.grid-cell')) {
          const bottomPanel = document.querySelector('.crossword-bottom-panel');
          if (bottomPanel) bottomPanel.classList.remove('active');
        }
      });
    }
  }

  // Вспомогательная функция: найти индекс ячейки в слове
  function getCellIndexInWord(row, col, placedWord) {
    if (placedWord.direction === 'across') {
      if (placedWord.row === row && col >= placedWord.col && col < placedWord.col + placedWord.word.length) {
        return col - placedWord.col;
      }
    } else {
      if (placedWord.col === col && row >= placedWord.row && row < placedWord.row + placedWord.word.length) {
        return row - placedWord.row;
      }
    }
    return -1;
  }

  // Универсальная функция обновления классов ячеек
  function refreshGridCellClasses(placedWords, userAnswers, currentWordId) {
    $$('.grid-cell').forEach(cell => {
      const r = parseInt(cell.dataset.row);
      const c = parseInt(cell.dataset.col);

      // Находим все слова, проходящие через эту ячейку
      const wordsAtCell = placedWords.filter(pw => {
        if (pw.direction === 'across') {
          return pw.row === r && c >= pw.col && c < pw.col + pw.word.length;
        } else {
          return pw.col === c && r >= pw.row && r < pw.row + pw.word.length;
        }
      });

      // Находим все правильно разгаданные слова в этой ячейке
      const correctWords = wordsAtCell.filter(pw => 
        userAnswers[pw.word.id] && userAnswers[pw.word.id].correct
      );

      const isCorrect = correctWords.length > 0;

      // Ячейка "чистая" (зеленая), если ХОТЯ БЫ ОДНО проходящее через неё угаданное слово разгадано БЕЗ подсказок
      const hasCleanCorrect = correctWords.some(pw => !userAnswers[pw.word.id].usedHint);

      // Проверяем, является ли ячейка частью активного слова
      const isActiveWord = currentWordId && wordsAtCell.some(pw => pw.word.id === currentWordId);

      // Обновляем классы
      cell.classList.remove('highlighted', 'correct', 'correct-hint');
      if (isCorrect) {
        if (hasCleanCorrect) {
          cell.classList.add('correct'); // Зеленый
        } else {
          cell.classList.add('correct-hint'); // Желтый (correct-hint)
        }
      } else if (isActiveWord) {
        cell.classList.add('highlighted');
      }
    });
  }

  function findWordAtCell(row, col, placedWords) {
    for (const pw of placedWords) {
      if (pw.direction === 'across') {
        if (pw.row === row && col >= pw.col && col < pw.col + pw.word.length) {
          return pw;
        }
      } else {
        if (pw.col === col && row >= pw.row && row < pw.row + pw.word.length) {
          return pw;
        }
      }
    }
    return null;
  }

  function selectWord(wordData, crosswordData, userAnswers, completedWords) {
    const { grid, placedWords } = crosswordData;
    
    // Сохраняем текущее слово
    window.currentCrosswordWord = wordData;

    // Используем универсальную функцию обновления классов ячеек
    refreshGridCellClasses(placedWords, userAnswers, wordData.word.id);

    // Обновляем Clue Panel
    updateCluePanel(wordData.word);

    // Генерируем клавиатуру (Правило 3: Smart Intersections)
    generateKeyboard(wordData, userAnswers, grid, placedWords);
    
    // ИСПРАВЛЕНИЕ: Показываем панель при выборе слова
    const bottomPanel = document.querySelector('.crossword-bottom-panel');
    if (bottomPanel) bottomPanel.classList.add('active');
  }

  function updateCluePanel(word) {
    const { userAnswers, placedWords, grid } = window.cwState;
    const panel = $('#clue-panel');
    const translationEl = $('#clue-translation');
    const speakBtn = $('#clue-speak');

    if (panel && translationEl) {
      panel.classList.remove('hidden');
      translationEl.textContent = word.translation;

      if (speakBtn) {
        speakBtn.onclick = () => speak(word.kana, speakBtn);
      }

      // ИСПРАВЛЕНИЕ 3: Рабочая кнопка "Очистить слово"
      const clearBtn = document.getElementById('clue-clear');
      if (clearBtn) {
        clearBtn.onclick = () => {
          const wordData = window.currentCrosswordWord;
          if (!wordData) return;

          const wordAnswer = userAnswers[wordData.word.id];
          if (!wordAnswer) return;

          // Запрет очистки правильно угаданных слов
          if (wordAnswer.correct) {
            return; // Если это конкретное слово уже правильно разгадано, игнорируем очистку
          }

          // Очищаем все буквы текущего слова
          for (let i = 0; i < wordData.word.length; i++) {
            wordAnswer.filled[i] = '';

            const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
            const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;

            const cellDom = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"] .kana-hira`);
            if (cellDom) {
              cellDom.textContent = '';
              cellDom.dataset.answer = '';
            }
          }

          // Восстанавливаем буквы на пересечениях из других слов
          Object.keys(userAnswers).forEach(wordId => {
            if (wordId === wordData.word.id) return;

            const ans = userAnswers[wordId];
            const wData = placedWords.find(w => w.word.id === wordId);
            if (!wData) return;

            for (let k = 0; k < wData.word.length; k++) {
              if (!ans.filled[k]) continue;

              const rr = wData.direction === 'across' ? wData.row : wData.row + k;
              const cc = wData.direction === 'across' ? wData.col + k : wData.col;

              const cDom = document.querySelector(`.grid-cell[data-row="${rr}"][data-col="${cc}"] .kana-hira`);
              if (cDom) {
                cDom.textContent = ans.filled[k];
                cDom.dataset.answer = ans.filled[k];
              }
            }
          });

          // Перегенерируем клавиатуру
          generateKeyboard(wordData, userAnswers, grid, placedWords);
        };
      }

      // Кнопка подсказки
      const hintBtn = document.getElementById('clue-hint');
      if (hintBtn) {
        hintBtn.onclick = () => {
          const wordData = window.currentCrosswordWord;
          if (!wordData) return;

          const wordAnswer = userAnswers[wordData.word.id];
          if (!wordAnswer) return;

          // Помечаем флаг подсказки ДО любых проверок и модификаций
          wordAnswer.usedHint = true;

          // Если слово уже разгадано, не даём подсказку
          if (wordAnswer.correct) return;

          // Находим пустые индексы
          const emptyIndices = [];
          for (let i = 0; i < wordData.word.length; i++) {
            if (wordAnswer.filled[i] === '') {
              emptyIndices.push(i);
            }
          }

          if (emptyIndices.length === 0) return;

          const srsCard = state.srs[wordData.word.id];
          if (srsCard) {
            if (srsCard.progress === undefined) srsCard.progress = 0;
            srsCard.progress = Math.max(0, srsCard.progress - 5); // Подсказка: -5%
          }
          save();

          // Выбираем случайный пустой индекс
          const randomIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
          const correctLetter = wordData.word.kana[randomIndex];

          // Записываем букву в filled
          wordAnswer.filled[randomIndex] = correctLetter;

          // Вычисляем координаты ячейки
          const r = wordData.direction === 'across' ? wordData.row : wordData.row + randomIndex;
          const c = wordData.direction === 'across' ? wordData.col + randomIndex : wordData.col;

          // ИСПРАВЛЕНИЕ БАГА: Объявляем cellData из сетки grid
          const cellData = grid[r][c];

          // Синхронизируем с пересекающимися словами через grid
          if (cellData && cellData.wordIds) {
            cellData.wordIds.forEach(wId => {
              const pw = placedWords.find(p => p.word.id === wId);
              if (pw) {
                const cellIdx = getCellIndexInWord(r, c, pw);
                if (cellIdx !== -1 && userAnswers[wId]) {
                  userAnswers[wId].filled[cellIdx] = correctLetter;
                }
              }
            });
          }

          // Обновляем ячейку в DOM
          const cell = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
          if (cell) {
            const hiraSpan = cell.querySelector('.kana-hira');
            const kataSpan = cell.querySelector('.kana-kata');

            if (hiraSpan) {
              hiraSpan.dataset.answer = correctLetter;
              hiraSpan.textContent = correctLetter;

              if (kataSpan) {
                kataSpan.textContent = hiraganaToKatakana(correctLetter);
              }
            }
          }

          // Перегенерируем клавиатуру (чтобы убрать эту букву из доступных плиток)
          generateKeyboard(wordData, userAnswers, grid, placedWords);

          // Проверяем заполненность слова
          checkWordCompletion(wordData, userAnswers, grid, placedWords);
        };
      }
    }
  }

  function generateKeyboard(wordData, userAnswers, grid, placedWords) {
    const keyboard = $('#crossword-keyboard');
    if (!keyboard) return;

    const wordAnswer = userAnswers[wordData.word.id];
    
  // Правило 3: Учитываем предзаполненные пересечения
  const neededLetters = [];
  for (let i = 0; i < wordData.word.length; i++) {
    const letter = wordData.word.kana[i];
    const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
    const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;

    // Проверяем, заполнена ли ячейка в DOM (из другого слова)
    const cellDom = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"] .kana-hira`);
    const isActuallyEmpty = !cellDom || !cellDom.dataset.answer;

    // Если ячейка действительно пуста, добавляем букву в клавиатуру
    if (isActuallyEmpty) {
      neededLetters.push(letter);
    }
  }

    // Добавляем distractors
    const allKana = Object.keys(HIRAGANA_TO_KATAKANA);
    const distractors = [];
    while (distractors.length < 4) {
      const randomKana = allKana[Math.floor(Math.random() * allKana.length)];
      if (!wordData.word.kana.includes(randomKana) && !distractors.includes(randomKana)) {
        distractors.push(randomKana);
      }
    }

    const keyboardLetters = shuffleArray([...neededLetters, ...distractors]);

    keyboard.innerHTML = keyboardLetters.map(letter => `
      <button class="kana-key" data-letter="${letter}">
        <span class="key-hira">${letter}</span>
        <span class="key-kata">${hiraganaToKatakana(letter)}</span>
      </button>
    `).join('');

    // Обработчики кнопок
    $$('.kana-key').forEach(btn => {
      btn.onclick = () => {
        const letter = btn.dataset.letter;
        insertLetterIntoWord(letter, btn, wordData, userAnswers, grid, placedWords);
      };
    });
  }

  function insertLetterIntoWord(letter, buttonElement, wordData, userAnswers, grid, placedWords) {
    // Находим первую пустую ячейку в текущем слове
    const wordAnswer = userAnswers[wordData.word.id];
    let emptyIndex = -1;

    for (let i = 0; i < wordData.word.length; i++) {
      // Вычисляем координаты ячейки
      const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
      const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;
      
      // Получаем DOM-элемент
      const cellDom = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"] .kana-hira`);
      
      // Проверяем: пуста ли ячейка И в массиве filled, И в DOM
      const isEmptyInFilled = wordAnswer.filled[i] === '';
      const isEmptyInDom = !cellDom || cellDom.textContent.trim() === '';
      
      if (isEmptyInFilled && isEmptyInDom) {
        emptyIndex = i;
        break;
      }
      
      // Синхронизация: если в DOM есть буква, но в filled пусто - копируем из DOM
      if (cellDom && cellDom.textContent.trim() !== '' && wordAnswer.filled[i] === '') {
        wordAnswer.filled[i] = cellDom.textContent.trim();
      }
    }

    if (emptyIndex === -1) return; // Все ячейки заполнены

    // Вписываем букву
    wordAnswer.filled[emptyIndex] = letter;

    // Обновляем UI
    const r = wordData.direction === 'across' ? wordData.row : wordData.row + emptyIndex;
    const c = wordData.direction === 'across' ? wordData.col + emptyIndex : wordData.col;
    const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);

    if (cell) {
      const hiraSpan = cell.querySelector('.kana-hira');
      const kataSpan = cell.querySelector('.kana-kata');

      if (hiraSpan) {
        hiraSpan.dataset.answer = letter;
        hiraSpan.textContent = letter;
      }

      if (kataSpan) {
        kataSpan.textContent = hiraganaToKatakana(letter);
      }
    }

    // Баг #1: Глобальная синхронизация букв на пересечениях
    // Обновляем букву во всех пересекающихся словах в userAnswers
    const cellData = grid[r][c];
    if (cellData && cellData.wordIds) {
      cellData.wordIds.forEach(wId => {
        const pw = placedWords.find(p => p.word.id === wId);
        if (pw) {
          const idx = getCellIndexInWord(r, c, pw);
          if (idx !== -1 && userAnswers[wId]) {
            userAnswers[wId].filled[idx] = letter;
          }
        }
      });
    }

    // Скрываем кнопку
    buttonElement.style.opacity = '0.3';
    buttonElement.disabled = true;

    // Проверяем заполненность слова
    checkWordCompletion(wordData, userAnswers, grid, placedWords);
  }

  function checkWordCompletion(wordData, userAnswers, grid, placedWords) {
    // Баг #1: Проверяем ВСЕ размещённые слова, а не только текущее
    placedWords.forEach(pw => {
      const wordAnswer = userAnswers[pw.word.id];
      if (!wordAnswer) return;
      
      // Проверяем, все ли ячейки заполнены
      const allFilled = wordAnswer.filled.every(l => l !== '');
      if (!allFilled) return;
      
      // Проверяем правильность
      const userWord = wordAnswer.filled.join('');
      const correctWord = pw.word.kana;
      
      if (userWord === correctWord && !wordAnswer.correct) {
        // Слово правильно и ещё не было отмечено
        wordAnswer.correct = true;
        
        const srsCard = state.srs[pw.word.id];
        if (srsCard) {
          if (srsCard.progress === undefined) srsCard.progress = 0;
          if (!wordAnswer.usedHint) {
            srsCard.progress = Math.min(100, srsCard.progress + 8); // Сам угадал: +8%
          }
        }
        
        // Подсвечиваем зеленым все ячейки этого слова
        for (let i = 0; i < pw.word.length; i++) {
          const r = pw.direction === 'across' ? pw.row : pw.row + i;
          const c = pw.direction === 'across' ? pw.col + i : pw.col;
          const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
          if (cell) {
            cell.classList.add('correct');
            cell.classList.remove('highlighted');
          }
        }
        
        // Баг #2: Обновляем классы всех ячеек после правильного ответа
        refreshGridCellClasses(placedWords, userAnswers, wordData.word.id);
        
        // Начисляем награду только за активное слово
        if (pw.word.id === wordData.word.id) {
          markActivity();
          addXP(XP_CHECK);
          toast('✅ Правильно!');
          
          // Добавляем в завершённые
          if (!window.completedCrosswordWords) window.completedCrosswordWords = new Set();
          window.completedCrosswordWords.add(pw.word.id);
          
          // Переходим к следующему слову
          setTimeout(() => {
            const nextWord = findNextIncompleteWord(placedWords, userAnswers);
            if (nextWord) {
              selectWord(nextWord, { grid, placedWords, clues: null, gridSize: grid.length }, userAnswers, window.completedCrosswordWords);
            } else {
              // Все слова разгаданы!
              completeCrossword(placedWords.length);
            }
          }, 1000);
        }
      }
    });

    // Шаг 4: Безопасное завершение игры
    const allCompleted = placedWords.every(pw => userAnswers[pw.word.id] && userAnswers[pw.word.id].correct);
    if (allCompleted) {
      if (!window.crosswordFinished) {
        window.crosswordFinished = true;
        setTimeout(() => {
          completeCrossword(placedWords.length);
        }, 1000);
      }
    }
  }

  function findNextIncompleteWord(placedWords, userAnswers) {
    for (const pw of placedWords) {
      if (!userAnswers[pw.word.id].correct) {
        return pw;
      }
    }
    return null;
  }

  function completeCrossword(totalWords) {
    const userAnswers = window.cwState ? window.cwState.userAnswers : {};
    
    // Подсчитываем слова с подсказками и без
    const wordsWithHint = Object.values(userAnswers).filter(a => a.correct && a.usedHint).length;
    const wordsWithoutHint = Object.values(userAnswers).filter(a => a.correct && !a.usedHint).length;

    // Награда: 20 XP за чистое слово, 10 XP за слово с подсказкой. Монеты = XP / 10.
    const xpReward = wordsWithoutHint * 20 + wordsWithHint * 10;
    const coinsReward = Math.floor(xpReward / 10);

    // Начисляем награды в глобальное состояние игрока и сохраняем прогресс
    addXP(xpReward);
    state.coins = (state.coins || 0) + coinsReward;
    save();

    // Показываем overlay завершения
    showCompletionScreen({
      title: 'おめでとう!',
      subtitle: 'Кроссворд завершён!',
      desc: `Вы разгадали все ${totalWords} слов (чисто: ${wordsWithoutHint}, с подсказками: ${wordsWithHint})!`,
      theme: 'success',
      rewards: [
        { icon: '🧩', label: `${totalWords} слов` },
        { icon: '✨', label: `+${xpReward} XP` },
        { icon: '🪙', label: `+${coinsReward} монет` }
      ],
      onContinue: () => {
        nav('sensei');
      }
    });
  }

  // ---------- Sensei (chat) ----------
  let chatHistory = [];
  let senseiTab = "chat"; // Текущая вкладка: "chat" или "tools"
  
  function renderSensei() {
    // Рендерим вкладки
    $$("[data-senseitab]").forEach(t => t.classList.toggle("active", t.dataset.senseitab === senseiTab));

    const body = $("#sensei-body");

    if (senseiTab === "tools") {
      renderSenseiTools();
      return;
    }

    // Вкладка "Чат" - вставляем элементы внутрь #sensei-body
    body.innerHTML = `
      <div class="chat-area" id="chat-area" data-testid="chat-area"></div>
      <div class="chat-input-bar">
        <input type="text" id="chat-input" class="chat-input" placeholder="質問してください… Задайте вопрос" data-testid="chat-input" />
        <button class="chat-send" id="chat-send" data-testid="chat-send-btn" aria-label="Отправить">➤</button>
      </div>
    `;

    const area = $("#chat-area");
    if (chatHistory.length === 0) {
      addBotMessage("こんにちは！Я — Kitsune Sensei 🦊 Спросите что угодно про японский язык или учебник Genki!");
    } else {
      chatHistory.forEach((msg) => {
        if (msg.role === "user") {
          const wrap = document.createElement("div");
          wrap.className = "msg-wrap user";
          wrap.innerHTML = `<div class="msg user">${escapeHtml(msg.content)}</div>`;
          area.appendChild(wrap);
        } else if (msg.role === "assistant") {
          addBotMessage(msg.content, false);
        }
      });
      requestAnimationFrame(() => area.scrollTop = area.scrollHeight);
    }

    // Привязываем обработчики для чата
    $("#chat-send").onclick = sendChat;
    $("#chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

    syncAvatars();
  }
  
  function renderSenseiTools() {
    const body = $("#sensei-body");

    // Удаляем chat-input-bar если он есть (на случай переключения с вкладки "Чат")
    const inputBar = body.querySelector(".chat-input-bar");
    if (inputBar) {
      inputBar.remove();
    }

  // Проверяем доступность кроссворда (>= 3 полностью пройденных глав)
  const completedLessons = Object.keys(state.chapters).reduce((total, id) => {
    const checklist = state.chapters[id].checklist || {};
    const completed = Object.values(checklist).filter(v => v === true).length;
    // Глава считается пройденной только если выполнены ВСЕ 5 пунктов
    return total + (completed === CHECK_ITEMS.length ? 1 : 0);
  }, 0);
  const crosswordUnlocked = completedLessons >= 3;

    body.innerHTML = `
    <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
      <!-- AI Сенсей (бывший AI-история) -->
      <div class="tool-card" data-nav="ai-story">
        <span class="tool-icon">✨</span>
        <div class="tool-info">
          <h3>AI Сенсей</h3>
          <p>Генерируйте интерактивные истории на основе ваших слабых слов</p>
        </div>
        <span class="tool-arrow">›</span>
      </div>

      <!-- Кроссворд -->
      <div class="tool-card ${crosswordUnlocked ? '' : 'tool-locked'}" data-nav="crossword" data-locked="${!crosswordUnlocked}">
        <span class="tool-icon">🧩</span>
        <div class="tool-info">
          <h3>Кроссворд</h3>
          <p>${crosswordUnlocked ? 'Закрепляйте изученные слова в игровой форме' : '🔒 Откроется после полного прохождения 3 глав'}</p>
        </div>
        <span class="${crosswordUnlocked ? 'tool-arrow' : 'tool-lock'}">${crosswordUnlocked ? '›' : '🔒'}</span>
      </div>
    </div>
    `;

    // Привязываем навигацию
    $$(".tool-card", body).forEach(card => {
      card.onclick = () => {
        const targetNav = card.dataset.nav;
        const isLocked = card.dataset.locked === "true";
        
        if (isLocked) {
          toast("🔒 Кроссворды откроются после полного прохождения 3 глав!");
          return;
        }
        
        nav(targetNav);
      };
    });
  }
  function escapeHtml(s) {
    var a = String.fromCharCode(38);
    return s.replace(/[&<>"']/g, function(c) {
      if (c === '&') return a + 'amp;';
      if (c === '<') return a + 'lt;';
      if (c === '>') return a + 'gt;';
      if (c === '"') return a + 'quot;';
      if (c === "'") return a + '#39;';
      return c;
    });
  }
  function md(text) {
    const codeBlocks = [];
    const preserved = text.replace(/```([\s\S]*?)```/g, (_, c) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre>${escapeHtml(c.trim())}</pre>`);
      return `\x00CODEBLOCK${idx}\x00`;
    });
    let h = escapeHtml(preserved);
    h = h.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx, 10)]);
    h = h.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
    h = h.replace(/^\s*[-*_]{3,}\s*$/gm, "<hr>");
    h = h.replace(/^######\s+(.*)$/gm, "<h6>$1</h6>");
    h = h.replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>");
    h = h.replace(/^####\s+(.*)$/gm, "<h4>$1</h4>");
    h = h.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
    h = h.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
    h = h.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
    h = h.replace(/^>\s+(.*)$/gm, "<blockquote>$1</blockquote>");
    h = h.replace(/((?:^\s*\d+\.\s+.*\n?)+)/gm, (match) => {
      const items = match.trim().split("\n").map(line =>
        line.replace(/^\s*\d+\.\s+(.*)$/, "<li>$1</li>")
      ).join("");
      return "<ol>" + items + "</ol>";
    });
    h = h.replace(/((?:^\s*[-*]\s+.*\n?)+)/gm, (match) => {
      const items = match.trim().split("\n").map(line =>
        line.replace(/^\s*[-*]\s+(.*)$/, "<li>$1</li>")
      ).join("");
      return "<ul>" + items + "</ul>";
    });
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/((?:^\|.*\|\n?)+)/gm, (match) => {
      const lines = match.trim().split("\n").map(l => l.trim()).filter(l => l);
      if (lines.length < 2) return match;
      const sep = lines[1];
      if (!/^\|[-:\s|]+\|$/.test(sep)) return match;
      const header = parseTableRow(lines[0], "th");
      const body = lines.slice(2).map(l => parseTableRow(l, "td")).join("");
      return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
    });
    function parseTableRow(line, tag) {
      const cells = line.split("|").map(c => c.trim()).filter(c => c);
      return "<tr>" + cells.map(c => `<${tag}>${c}</${tag}>`).join("") + "</tr>";
    }
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    h = h.replace(/\*([^*]+)\*/g, "<i>$1</i>");
    h = h.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    h = h.replace(/\n{2,}/g, "\n\n");
    const parts = h.split(/\n{2,}/);
    const blockTags = /^(<pre>|<h[1-6]>|<hr>|<blockquote>|<ul>|<ol>|<div class="table-wrap">)/;
    const out = parts.map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      if (blockTags.test(trimmed)) return trimmed;
      return "<p>" + trimmed.replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
    return out;
  }
  function addBotMessage(content, saveable) {
    const area = $("#chat-area");
    const wrap = document.createElement("div");
    wrap.className = "msg-wrap";
    wrap.innerHTML = `<div class="msg bot">${md(content)}</div>`;
    if (saveable) {
      const btn = document.createElement("button");
      btn.className = "save-note-btn";
      btn.textContent = "＋ Сохранить в учебник";
      btn.dataset.testid = "save-note-btn";
      btn.onclick = () => {
        const title = content.replace(/[#*`]/g, "").split("\n")[0].slice(0, 48) || "Заметка AI";
        state.savedNotes.unshift({ id: "n" + Date.now(), title, content, date: todayStr() });
        save();
        btn.textContent = "✓ Сохранено";
        btn.disabled = true;
        toast("Сохранено в Мини-учебник 📚");
      };
      wrap.appendChild(btn);
    }
    area.appendChild(wrap);
    area.scrollTop = area.scrollHeight;
  }
  function addUserMessage(text) {
    const area = $("#chat-area");
    const wrap = document.createElement("div");
    wrap.className = "msg-wrap user";
    wrap.innerHTML = `<div class="msg user">${escapeHtml(text)}</div>`;
    area.appendChild(wrap);
    area.scrollTop = area.scrollHeight;
  }
  // Дебаунсинг для предотвращения множественных отправок
  let chatSending = false;
  
  async function sendChat() {
    // Защита от множественных кликов
    if (chatSending) {
      toast("⏳ Дождитесь ответа на предыдущий вопрос");
      return;
    }
    
    const input = $("#chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    
    // Проверка API ключа перед отправкой
    if (!state.settings.openrouterKey) {
      toast("⚠️ Укажите API-ключ OpenRouter в настройках");
      return;
    }
    
    chatSending = true;
    addUserMessage(text);
    chatHistory.push({ role: "user", content: text });
    const area = $("#chat-area");
    const t = document.createElement("div");
    t.className = "msg-wrap";
    t.innerHTML = `<div class="msg bot"><div class="typing"><i></i><i></i><i></i></div></div>`;
    area.appendChild(t); area.scrollTop = area.scrollHeight;
    $("#chat-send").disabled = true;
    $("#chat-input").disabled = true;
    try {
      const reply = await API.askSensei(chatHistory, state.settings);
      chatHistory.push({ role: "assistant", content: reply });
      t.remove();
      addBotMessage(reply, true);
      markActivity();
    } catch (e) {
      t.remove();
      addBotMessage("⚠️ " + e.message);
    } finally {
      state.chatHistory = chatHistory;
      save();
      $("#chat-send").disabled = false;
      $("#chat-input").disabled = false;
      chatSending = false;
    }
  }
  window.sendChat = sendChat;

  // ---------- Library ----------
  let libTab = "grammar", libChapter = 1;
  function renderLibrary() {
    $$(".lib-tab").forEach((t) => t.classList.toggle("active", t.dataset.libtab === libTab));
    const body = $("#library-body");
    if (libTab === "stories") {
      renderStories();
      return;
    }
    if (libTab === "notes") {
      if (state.savedNotes.length === 0) {
        body.innerHTML = emptyState("📝", "Заметок пока нет", "Сохраняйте ответы AI-Сенсея кнопкой «Сохранить в учебник».");
        return;
      }
      body.innerHTML = state.savedNotes.map((n) => `
        <div class="gram-card note-card" data-testid="note-${n.id}">
          <div class="gram-head row-between">
            <span>${escapeHtml(n.title)}</span>
            <div style="display:flex;gap:6px">
              <button class="btn-ghost btn-toggle-note" data-toggle="${n.id}" style="padding:6px 10px;font-size:12px" aria-label="Свернуть/развернуть">▼</button>
              <button class="btn-ghost" data-del="${n.id}" style="padding:6px 10px">✕</button>
            </div>
          </div>
          <div class="gram-body note-body" id="note-body-${n.id}">${md(n.content)}</div>
        </div>`).join("");
      $$("#library-body [data-del]").forEach((b) => b.onclick = () => {
        state.savedNotes = state.savedNotes.filter((x) => x.id !== b.dataset.del);
        save(); renderLibrary(); toast("Заметка удалена");
      });
      $$("#library-body [data-toggle]").forEach((b) => b.onclick = () => {
        const noteId = b.dataset.toggle;
        const body = document.getElementById("note-body-" + noteId);
        if (body) {
          body.classList.toggle("collapsed");
          b.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
        }
      });
      return;
    }
    // grammar
    const chips = LESSONS.map((l) => {
      const locked = !chState(l.id).started;
      return `<button class="chip ${l.id === libChapter ? "active" : ""} ${locked ? "locked" : ""}" data-chip="${l.id}" data-testid="lib-chip-${l.id}">Гл.${l.id}${locked ? " 🔒" : ""}</button>`;
    }).join("");
    const l = getLesson(libChapter);
    if (!l) { body.innerHTML = ""; return; }
    const locked = !chState(libChapter).started;
    let content;
    if (locked) {
      content = `<div class="card gram-locked" data-testid="lib-locked"><span style="font-size:30px">🔒</span>
        <div><b>Глава ${libChapter} закрыта</b><div class="muted">Нажмите «Начать главу», чтобы открыть грамматику.</div></div></div>`;
    } else if (l.grammar.length === 0) {
      content = emptyState("📖", "Нет грамматики", "В этой главе нет грамматических заметок.");
    } else {
      content = l.grammar.map((g) => `
        <div class="gram-card">
          <div class="gram-head">${escapeHtml(g.title)}</div>
          <div class="gram-body">${escapeHtml(g.content)}</div>
        </div>`).join("");
      if (l.cultural.length) {
        content += `<h2 class="section-title" style="margin-top:18px">КУЛЬТУРНЫЕ ЗАМЕТКИ</h2>` +
          l.cultural.map((g) => `<div class="gram-card"><div class="gram-head">${escapeHtml(g.title)}</div><div class="gram-body">${escapeHtml(g.content)}</div></div>`).join("");
      }
    }
    body.innerHTML = `<div class="chip-row" data-testid="lib-chip-row">${chips}</div>
      <h2 class="section-title">ГЛАВА ${libChapter}: ${l.title.toUpperCase()}</h2>${content}`;
    $$("#library-body .chip").forEach((c) => c.onclick = () => { libChapter = parseInt(c.dataset.chip, 10); renderLibrary(); });
  }

  // ---------- Stories ----------
  function renderStories() {
    const body = $("#library-body");
    
    if (!window.STORIES || STORIES.length === 0) {
      body.innerHTML = emptyState("📖", "Историй пока нет", "Скоро здесь появятся интересные истории!");
      return;
    }
    
    body.innerHTML = STORIES.map(story => {
      const isUnlocked = chState(story.lesson_id).started;
      const lockedClass = isUnlocked ? '' : 'story-locked';
      
      return `
        <div class="story-card ${lockedClass}" data-story-id="${story.id}" data-testid="story-${story.id}">
          <div class="story-cover-wrap">
            <img src="${story.cover_url}" alt="${story.title}" class="story-cover" />
            ${!isUnlocked ? '<div class="story-lock-overlay"><span class="story-lock-icon">🔒</span></div>' : ''}
          </div>
          <div class="story-info">
            <h3 class="story-title">${story.title}</h3>
            <p class="story-lesson">Урок ${story.lesson_id}: ${CH_NAMES[story.lesson_id][0]}</p>
          </div>
        </div>
      `;
    }).join("");
    
    $$(".story-card").forEach(card => {
      card.onclick = () => {
        const storyId = parseInt(card.dataset.storyId);
        const story = STORIES.find(s => s.id === storyId);
        if (!story) return;
        
        const isUnlocked = chState(story.lesson_id).started;
        
        if (!isUnlocked) {
          toast(`🔒 Пройдите Урок ${story.lesson_id}, чтобы открыть эту историю`);
          return;
        }
        
        openStory(storyId);
      };
    });
  }

  // Функция рендеринга интерактивной истории с токенами
  function renderInteractiveStory(content) {
    return content.map(sentence => {
      const tokensHtml = sentence.tokens.map((token, idx) => {
        // Пропускаем пунктуацию без обёртки
        if (token.type === "Punctuation") {
          return token.kanji;
        }
        
        // Для слов с фуриганой используем <ruby>
        if (token.writing && token.writing !== token.kanji) {
          return `<ruby><span class="word-token" 
                    data-word-id="${sentence.sentence_id}-${idx}"
                    data-kanji="${token.kanji}"
                    data-writing="${token.writing}"
                    data-translation="${token.translation}"
                    data-type="${token.type}">${token.kanji}</span><rt>${token.writing}</rt></ruby>`;
        }
        
        // Для слов без фуриganы (хирагана)
        return `<span class="word-token" 
                  data-word-id="${sentence.sentence_id}-${idx}"
                  data-kanji="${token.kanji}"
                  data-translation="${token.translation}"
                  data-type="${token.type}">${token.kanji}</span>`;
      }).join('');
      
      return `
        <div class="story-sentence">
          ${sentence.speaker ? `<strong class="speaker">${sentence.speaker}:</strong>` : ''}
          <p class="sentence-jp">${tokensHtml}</p>
          <button class="toggle-translation-btn">Показать перевод</button>
          <p class="sentence-translation hidden">${sentence.translation}</p>
        </div>
      `;
    }).join('');
  }

  // Функция открытия Bottom Sheet для перевода слова
  function openWordBottomSheet(tokenElement) {
    const sheet = $("#word-bottom-sheet");
    if (!sheet) return;
    
    const kanji = tokenElement.dataset.kanji;
    const writing = tokenElement.dataset.writing || kanji;
    const translation = tokenElement.dataset.translation;
    const type = tokenElement.dataset.type;
    
    // Заполняем данные с защитой от null
    const modalKanji = $("#modal-kanji");
    const modalReading = $("#modal-reading");
    const modalTranslation = $("#modal-translation");
    const modalType = $("#modal-type");
    
    if (modalKanji) modalKanji.textContent = kanji;
    if (modalReading) modalReading.textContent = writing !== kanji ? writing : '';
    if (modalTranslation) modalTranslation.textContent = translation;
    if (modalType) modalType.textContent = type;
    
    // Показываем шторку
    sheet.classList.add("active");
  }

  // Функция закрытия Bottom Sheet
  function closeWordBottomSheet() {
    const sheet = $("#word-bottom-sheet");
    if (sheet) sheet.classList.remove("active");
  }

  // Удалено setupWordClickHandlers - используется делегирование событий в init()

  // Функция установки обработчиков переключения переводов
  function setupTranslationToggleHandlers() {
    const buttons = $$(".toggle-translation-btn");
    buttons.forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const translation = btn.nextElementSibling;
        if (translation && translation.classList.contains('sentence-translation')) {
          const isHidden = translation.classList.toggle('hidden');
          btn.textContent = isHidden ? 'Показать перевод' : 'Скрыть перевод';
        }
      };
    });
  }

  function openStory(storyId) {
    const story = STORIES.find(s => s.id === storyId);
    if (!story) return;
    
    const storyTitle = $("#story-title");
    const storyTitleJp = $("#story-title-jp");
    
    if (storyTitle) storyTitle.textContent = story.title;
    if (storyTitleJp) storyTitleJp.textContent = story.titleJP || "";
    
  // Используем новую функцию рендеринга для интерактивного текста
  $("#story-body").innerHTML = `
  <div class="story-content">
    <div class="story-meta">
      <span class="story-lesson-badge">Урок ${story.lesson_id}</span>
    </div>
    <div class="story-text">${renderInteractiveStory(story.content)}</div>
    ${story.questions && story.questions.length > 0 ? `
      <div class="story-actions">
        <button id="btn-finish-story" class="btn-primary-large">
          📖 Завершить историю
        </button>
      </div>
    ` : ''}
  </div>
  `;

  // Добавляем обработчики переключения переводов
  setupTranslationToggleHandlers();

  // Обработчик кнопки "Завершить историю"
  const finishBtn = document.getElementById("btn-finish-story");
  if (finishBtn) {
    finishBtn.onclick = () => {
      startStoryQuiz(story);
    };
  }

  nav("story");
}

// ===== STORY QUIZ SYSTEM =====
function startStoryQuiz(story) {
  // Фоллбек: если у истории нет вопросов, создаём дефолтный
  if (!story.questions || story.questions.length === 0) {
    story.questions = [{
      question: "Вы внимательно прочитали историю?",
      options: ["Да, всё понятно!", "Нет, хочу перечитать"],
      correctAnswer: 0
    }];
  }
  
  let currentQuestionIndex = 0;
  let attemptsCount = 0; // Счётчик попыток (для сброса при ошибке)
  
  function renderQuestion(index) {
    const q = story.questions[index];
    const storyBody = $("#story-body");
    
    storyBody.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-header">
          <button class="btn-ghost" id="quiz-back-btn">← Назад к истории</button>
          <div class="quiz-progress">Вопрос ${index + 1} из ${story.questions.length}</div>
        </div>
        <h2 class="quiz-question">${q.question}</h2>
        <div class="quiz-options" id="quiz-options">
          ${q.options.map((opt, i) => 
            `<button class="quiz-option-btn" data-index="${i}">${opt}</button>`
          ).join('')}
        </div>
      </div>
    `;
    
    // Обработчик кнопки "Назад"
    const backBtn = $("#quiz-back-btn");
    if (backBtn) {
      backBtn.onclick = () => {
        openStory(story.id);
      };
    }
    
    // Обработчики для кнопок ответов
    document.querySelectorAll('.quiz-option-btn').forEach(btn => {
      btn.onclick = () => {
        const selectedIndex = parseInt(btn.dataset.index, 10);
        checkAnswer(selectedIndex, q.correctAnswer, btn);
      };
    });
  }
  
  function checkAnswer(selectedIndex, correctIndex, buttonElement) {
    const allButtons = document.querySelectorAll('.quiz-option-btn');
    
    // Блокируем все кнопки после клика
    allButtons.forEach(b => b.disabled = true);
    
    if (selectedIndex === correctIndex) {
      // ✅ Правильный ответ
      buttonElement.classList.add('correct');
      
      setTimeout(() => {
        currentQuestionIndex++;
        attemptsCount = 0; // Сбрасываем счётчик попыток
        
        if (currentQuestionIndex < story.questions.length) {
          renderQuestion(currentQuestionIndex);
        } else {
          // Все вопросы пройдены
          completeStory(story);
        }
      }, 1000);
      
    } else {
      // ❌ Неправильный ответ
      buttonElement.classList.add('incorrect');
      attemptsCount++;
      
      setTimeout(() => {
        // Сбрасываем тест на первый вопрос
        currentQuestionIndex = 0;
        toast("❌ Попробуйте снова с начала");
        renderQuestion(0);
      }, 1500);
    }
  }
  
  // Начинаем с первого вопроса
  renderQuestion(0);
}

function completeStory(story) {
  // Инициализируем completedStories если нет
  if (!state.completedStories) state.completedStories = [];
  
  // Проверяем, проходилась ли история ранее
  const isFirstCompletion = !state.completedStories.includes(story.id);
  
  // Определяем награды в зависимости от статуса
  let xpReward, coinsReward, rewardLabel;
  
  if (isFirstCompletion) {
    // Полные награды за первое прохождение
    xpReward = story.rewards?.xp || 20;
    coinsReward = story.rewards?.coins || 15;
    rewardLabel = "Первое прохождение!";
    
    // Отмечаем историю как завершённую
    state.completedStories.push(story.id);
  } else {
    // Символические награды за повторное прохождение
    xpReward = 1;
    coinsReward = 0;
    rewardLabel = "Повторное прохождение";
  }
  
  // Начисляем награды
  state.xp += xpReward;
  state.coins += coinsReward;
  
  // Проверяем повышение уровня
  while (state.xp >= XP_PER_LEVEL) {
    state.xp -= XP_PER_LEVEL;
    state.level += 1;
    state.coins += COINS_PER_LEVEL;
    toast(`🎉 Уровень ${state.level}! +${COINS_PER_LEVEL} 🪙`);
  }
  
  save();
  refreshStreakDisplay();
  markActivity();
  
  // Показываем экран успеха с соответствующими наградами
  const rewards = isFirstCompletion 
    ? [
        { icon: "📖", label: rewardLabel },
        { icon: "🪙", label: `+${coinsReward} монет` },
        { icon: "⭐", label: `+${xpReward} XP` }
      ]
    : [
        { icon: "🔄", label: rewardLabel },
        { icon: "⭐", label: `+${xpReward} XP` }
      ];
  
  showCompletionScreen({
    title: isFirstCompletion ? "おめでとう!" : "よくできました!",
    subtitle: story.title,
    desc: isFirstCompletion ? "История успешно пройдена!" : "История перечитана!",
    theme: "success",
    rewards: rewards,
    onContinue: () => {
      nav("library");
    }
  });
}

  // ---------- Backup / Restore ----------
  async function shareProgressBackup() {
    try {
      const backupData = {
        app: "kitsune_genki",
        version: "1.2",
        timestamp: new Date().toISOString(),
        chapters: state.chapters,
        srs: state.srs,
        streak: state.streak,
        savedNotes: state.savedNotes,
        settings: {
          ...state.settings,
          openrouterKey: "", // Не экспортируем API ключ в целях безопасности
        },
        xp: state.xp,
        level: state.level,
        coins: state.coins,
        dailyCards: state.dailyCards,
        history: state.history,
        currentAvatar: state.currentAvatar,
        unlockedAvatars: state.unlockedAvatars,
        currentStreakSkin: state.currentStreakSkin,
        unlockedStreakSkins: state.unlockedStreakSkins,
        currentTheme: state.currentTheme,
        unlockedThemes: state.unlockedThemes,
        currentTitle: state.currentTitle,
        unlockedTitles: state.unlockedTitles,
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const file = new File([blob], "kitsune_genki_backup.json", { type: "application/json" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Бэкап Kitsune Genki 🦊",
        text: "Мой прогресс изучения японского языка",
      });
      toast("Меню «Поделиться» открыто 🦊");
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = "kitsune_genki_backup.json";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Файл сохранён в Загрузки 📁");
    }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Не удалось создать бэкап:", error);
        toast("Ошибка: " + error.message);
      }
    }
  }

  function restoreProgressBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data.app || data.app !== "kitsune_genki") {
            toast("Неверный формат файла бэкапа");
            return;
          }
          state.chapters = data.chapters || {};
          state.srs = data.srs || {};
          state.streak = data.streak || { count: 0, lastActive: null };
          state.savedNotes = data.savedNotes || [];
          state.settings = Object.assign({}, defaultState().settings, data.settings || {});
          state.xp = data.xp || 0;
          state.level = data.level || 1;
          state.coins = data.coins || 0;
          state.dailyCards = data.dailyCards || 0;
          state.history = data.history || {};
          state.currentAvatar = data.currentAvatar || "🦊";
          state.unlockedAvatars = data.unlockedAvatars || ["🦊"];
          state.currentStreakSkin = data.currentStreakSkin || "default";
          state.unlockedStreakSkins = data.unlockedStreakSkins || ["default"];
          state.currentTheme = data.currentTheme || "default";
          state.unlockedThemes = data.unlockedThemes || ["default"];
          state.currentTitle = data.currentTitle || "Новичок";
          state.unlockedTitles = data.unlockedTitles || ["Новичок"];
          state.initialized = true;
          save();
          toast("Данные восстановлены ✓");
          nav("home");
          updateSrsBadge();
        } catch (err) {
          console.error("Ошибка восстановления:", err);
          toast("Неверный формат файла бэкапа");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ---------- Settings ----------
  function renderSettings() {
    const s = state.settings;
    const body = $("#settings-body");
    body.innerHTML = `
      <div class="set-group">
        <div class="set-item">
          <label>🔑 API-ключ OpenRouter</label>
          <input type="password" id="set-key" value="${s.openrouterKey || ""}" placeholder="sk-or-v1-..." data-testid="set-openrouter-key" />
          <div class="set-hint">Получите ключ на openrouter.ai. Хранится только на этом устройстве.</div>
          <div class="set-warning">⚠️ Ключ хранится в браузере. Не делитесь файлом бэкапа, если используете платный ключ.</div>
        </div>
        <div class="set-item">
          <label>🤖 Модель</label>
          <input type="text" id="set-model" value="${s.model || ""}" placeholder="deepseek/deepseek-v4-flash" data-testid="set-model" />
          <div class="set-hint">По умолчанию deepseek v4 flash. Можно указать любую модель OpenRouter (напр. добавить «:free»).</div>
        </div>
      </div>

      <div class="set-group">
        <div class="set-item">
          <label>📦 Бэкап прогресса</label>
          <div class="set-hint">Сохраните копию вашего прогресса (стрик, карточки SRS, настройки), чтобы перенести на другое устройство или восстановить.</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
            <button class="btn-ghost" id="btn-share-backup" data-testid="share-backup-btn">💾 Сохранить копию</button>
            <button class="btn-ghost" id="btn-restore-backup" data-testid="restore-backup-btn">📂 Восстановить</button>
          </div>
        </div>
      </div>

      <div class="set-group">
        <div class="set-item row-between">
          <div><label style="margin:0">🔔 Ежедневное напоминание</label><div class="set-hint">Напомнить продолжить учёбу, если стрик под угрозой.</div></div>
          <label class="switch"><input type="checkbox" id="set-notify" ${s.notifyEnabled ? "checked" : ""} data-testid="set-notify" /><span class="slider"></span></label>
        </div>
        <div class="set-item">
          <label>Время напоминания</label>
          <input type="time" id="set-notify-time" value="${s.notifyTime || "12:00"}" data-testid="set-notify-time" />
          <div class="set-hint">Напоминание сработает, пока приложение открыто/в фоне. Кнопка ниже — проверить.</div>
        </div>
        <div class="set-item"><button class="btn-ghost" id="btn-test-notif" data-testid="test-notif-btn">Тестовое уведомление</button></div>
      </div>

      <div class="set-group">
        <div class="set-item">
          <label>🎨 Тема оформления</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-ghost" id="theme-auto" style="flex:1;${s.darkMode === "auto" ? "background:var(--orange);color:#fff" : ""}">Авто</button>
            <button class="btn-ghost" id="theme-light" style="flex:1;${s.darkMode === "light" ? "background:var(--orange);color:#fff" : ""}">☀️ Светлая</button>
            <button class="btn-ghost" id="theme-dark" style="flex:1;${s.darkMode === "dark" ? "background:var(--orange);color:#fff" : ""}">🌙 Тёмная</button>
            <button class="btn-ghost" id="theme-custom" style="flex:1;${s.darkMode === "custom" ? "background:var(--orange);color:#fff" : ""}">🎨 Кастомная</button>
          </div>
          <div class="set-hint">Авто — следует за системной темой устройства. Кастомная — выбранная в магазине тема.</div>
        </div>
      </div>

      <div class="set-group">
        <div class="set-item row-between">
          <div><label style="margin:0">🔤 Скрыть Ромадзи</label><div class="set-hint">В карточках будет скрыто латинское чтение.</div></div>
          <label class="switch"><input type="checkbox" id="set-hide-romaji" ${s.hideRomaji ? "checked" : ""} data-testid="set-hide-romaji" /><span class="slider"></span></label>
        </div>
      </div>

      <div class="set-group">
        <div class="set-item"><button class="btn-ghost" id="btn-reset" style="color:var(--danger)" data-testid="reset-btn">Сбросить весь прогресс</button></div>
      </div>
      <div class="bottom-pad"></div>`;

    const bindEvent = (id, event, fn) => { const e = $(id); if (e) e.addEventListener(event, fn); };
    const persist = () => {
      s.openrouterKey = $("#set-key").value.trim();
      s.model = $("#set-model").value.trim() || "deepseek/deepseek-v4-flash";
      s.notifyTime = $("#set-notify-time").value || "12:00";
      save();
    };
    ["#set-key", "#set-model", "#set-notify-time"].forEach((id) => bindEvent(id, "change", persist));

    bindEvent("#set-notify", "change", async (e) => {
      if (e.target.checked) {
        const p = await Notification.requestPermission();
        if (p !== "granted") { e.target.checked = false; toast("Разрешение на уведомления не выдано"); return; }
        s.notifyEnabled = true; scheduleNotify();
      } else s.notifyEnabled = false;
      save();
    });
    bindEvent("#btn-test-notif", "click", () => showNotification("Kitsune Genki 🦊", "Пора продолжить изучение японского!"));
    bindEvent("#set-hide-romaji", "change", (e) => { s.hideRomaji = e.target.checked; save(); });
    bindEvent("#theme-auto", "click", () => setThemeAndSave("auto"));
    bindEvent("#theme-light", "click", () => setThemeAndSave("light"));
    bindEvent("#theme-dark", "click", () => setThemeAndSave("dark"));
    bindEvent("#theme-custom", "click", () => setThemeAndSave("custom"));

    bindEvent("#btn-reset", "click", () => {
      if (confirm("Сбросить весь прогресс? Это действие необратимо.")) {
        localStorage.removeItem(LS_STATE);
        localStorage.removeItem(LS_LESSONS);
        localStorage.removeItem(LS_LESSON_VERSION);
        localStorage.removeItem(LS_LAST_ACTIVITY_DAY);
        loadState(); save(); toast("Прогресс сброшен"); nav("home");
      }
    });

    bindEvent("#btn-share-backup", "click", shareProgressBackup);
    bindEvent("#btn-restore-backup", "click", restoreProgressBackup);
  }

  // ---------- Dark Mode ----------
  const LS_THEME = "kitsune_theme";
  function applyTheme() {
    // Сначала проверяем отдельный ключ в localStorage для надёжности
    const savedTheme = localStorage.getItem(LS_THEME);
    let dm;
    if (savedTheme) {
      state.settings.darkMode = savedTheme;
      dm = savedTheme;
    } else {
      dm = state.settings.darkMode || "auto";
    }
    
    // Если кастомная тема — применяем её
    if (dm === "custom" && state.currentTheme && state.currentTheme !== "default") {
      document.documentElement.setAttribute("data-theme", state.currentTheme);
      return;
    }
    
    if (dm === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (dm === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    }
    if (window.applyThemeMediaListener) {
      window.applyThemeMediaListener.remove();
    }
    if (dm === "auto" && window.matchMedia) {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = (e) => {
        document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      };
      mql.addEventListener("change", listener);
      window.applyThemeMediaListener = { remove: () => mql.removeEventListener("change", listener) };
    }
  }
  // Сохраняем тему в отдельный ключ localStorage для надёжности
  function saveTheme(theme) {
    state.settings.darkMode = theme;
    localStorage.setItem(LS_THEME, theme);
    save();
  }
  // Переопределяем setTheme в renderSettings
  function setThemeAndSave(theme) {
    saveTheme(theme);
    if (theme === "custom") {
      applyCustomTheme();
    } else {
      applyTheme();
      // При переключении на стандартную тему сбрасываем скин карточки на стандартный
      if (state.currentStreakSkin !== "default") {
        state.currentStreakSkin = "default";
        applyStreakSkin();
        save();
      }
    }
    renderSettings();
  }

  // ---------- Notifications ----------
  let notifTimer = null;
  function streakAtRisk() {
    const s = state.streak;
    if (!s.lastActive) return true;
    return s.lastActive !== todayStr();
  }
  function showNotification(title, bodyTxt) {
    if (!("Notification" in window) || Notification.permission !== "granted") { toast(title + " — " + bodyTxt); return; }
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body: bodyTxt, icon: "icon.svg", badge: "icon.svg", tag: "kitsune-daily" }))
        .catch(() => new Notification(title, { body: bodyTxt }));
    } else new Notification(title, { body: bodyTxt });
  }
  function scheduleNotify() {
    if (notifTimer) clearInterval(notifTimer);
    if (!state.settings.notifyEnabled) return;
    const lastKey = "kitsune_notif_day";
    notifTimer = setInterval(() => {
      if (!state.settings.notifyEnabled) return;
      const [h, m] = (state.settings.notifyTime || "12:00").split(":").map(Number);
      const now = new Date();
      if (now.getHours() === h && now.getMinutes() === m && localStorage.getItem(lastKey) !== todayStr()) {
        if (streakAtRisk()) {
          showNotification("Kitsune Genki 🦊🔥", "Ваш стрик под угрозой! Позанимайтесь сегодня.");
          localStorage.setItem(lastKey, todayStr());
        }
      }
    }, 30000);
  }

  // ---------- Misc UI ----------
  function emptyState(em, h, p) {
    return `<div class="empty"><div class="em">${em}</div><h3>${h}</h3><p>${p}</p></div>`;
  }
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("show");
    }, 2600);
  }
  function updateSrsBadge() {
    const n = dueCards().length;
    const b = $("#tab-srs-badge");
    b.textContent = n > 9 ? "9+" : n;
    b.classList.toggle("hidden", n === 0);
  }

  // ---------- Plan (Study Plan) ----------
  function renderCompletedChaptersList() {
    const container = $("#completed-chapters-list");
    if (!container) {
      return;
    }

    container.innerHTML = "";
    
    LESSONS.forEach((lesson) => {
      const cs = chState(lesson.id);
      const items = CHECK_ITEMS.length;
      const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
      const isCompleted = done === items;
      
      const wrapper = document.createElement("div");
      wrapper.className = "completed-chapter-item";
      
      const checkboxWrapper = document.createElement("label");
      checkboxWrapper.className = "custom-checkbox";
      
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `completed-ch-${lesson.id}`;
      input.dataset.chapterId = lesson.id;
      input.checked = isCompleted;
      
      const checkmark = document.createElement("span");
      checkmark.className = "checkmark";
      
      const labelText = document.createElement("span");
      labelText.className = "checkbox-label";
      labelText.textContent = `Глава ${lesson.id}: ${lesson.title}`;
      
      if (isCompleted) {
        labelText.classList.add("completed");
      }
      
      checkboxWrapper.appendChild(input);
      checkboxWrapper.appendChild(checkmark);
      checkboxWrapper.appendChild(labelText);
      wrapper.appendChild(checkboxWrapper);
      container.appendChild(wrapper);
    });
  }
  
  function renderPlan() {
    const today = new Date().toISOString().split("T")[0];
    $("#plan-start-date").value = today;
    
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 90);
    $("#plan-deadline-date").value = defaultDeadline.toISOString().split("T")[0];
    
    // Генерируем список глав для выбора изученных
    // Исправлено: проверяем, что LESSONS загружены перед рендерингом
    if (LESSONS && LESSONS.length > 0) {
      // Используем requestAnimationFrame для более надежного рендеринга после DOM
      requestAnimationFrame(() => renderCompletedChaptersList());
    } else {
      // Если LESSONS еще не загружены, повторяем попытку через 100мс
      setTimeout(() => {
        if (LESSONS && LESSONS.length > 0) {
          renderCompletedChaptersList();
        }
      }, 100);
    }
    
    if (state.studyPlan) {
      $("#plan-form-container").classList.add("hidden");
      $("#plan-view-container").classList.remove("hidden");
      $("#plan-recalc-btn").classList.remove("hidden");
      renderPlanTimeline();
      renderStudyAdvice();
    } else {
      $("#plan-form-container").classList.remove("hidden");
      $("#plan-view-container").classList.add("hidden");
    }
    
    setupPlanEventHandlers();
  }

  function setupPlanEventHandlers() {
    const backBtn = $("#screen-plan .back-btn");
    if (backBtn && !backBtn.dataset.listenerAttached) {
      backBtn.onclick = () => nav("home");
      backBtn.dataset.listenerAttached = "true";
    }
    
    $$(".plan-deadline-toggle .toggle-btn").forEach(btn => {
      btn.onclick = () => {
        $$(".plan-deadline-toggle .toggle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        const mode = btn.dataset.mode;
        if (mode === "days") {
          $("#plan-days-input").classList.remove("hidden");
          $("#plan-deadline-input").classList.add("hidden");
        } else {
          $("#plan-days-input").classList.add("hidden");
          $("#plan-deadline-input").classList.remove("hidden");
        }
      };
    });
    
    $$(".weekday-btn").forEach(btn => {
      btn.onclick = () => btn.classList.toggle("active");
    });
    
    const generateBtn = $("#plan-generate-btn");
    if (generateBtn && !generateBtn.dataset.listenerAttached) {
      generateBtn.onclick = handleGeneratePlan;
      generateBtn.dataset.listenerAttached = "true";
    }
    
    const recalcBtn = $("#plan-recalc-btn");
    if (recalcBtn && !recalcBtn.dataset.listenerAttached) {
      recalcBtn.onclick = handleRecalcPlan;
      recalcBtn.dataset.listenerAttached = "true";
    }
    
    $$(".plan-view-toggle .toggle-btn").forEach(btn => {
      btn.onclick = () => {
        $$(".plan-view-toggle .toggle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        const view = btn.dataset.view;
        if (view === "timeline") {
          $("#plan-timeline").classList.remove("hidden");
          $("#plan-calendar-grid").classList.add("hidden");
        } else {
          $("#plan-timeline").classList.add("hidden");
          $("#plan-calendar-grid").classList.remove("hidden");
          renderPlanCalendarGrid();
        }
      };
    });
  }

  function handleGeneratePlan() {
    const startDateStr = $("#plan-start-date").value;
    const mode = $(".plan-deadline-toggle .toggle-btn.active").dataset.mode;
    
    let deadlineStr;
    if (mode === "days") {
      const days = parseInt($("#plan-total-days").value, 10);
      const deadline = new Date(startDateStr);
      deadline.setDate(deadline.getDate() + days);
      deadlineStr = deadline.toISOString().split("T")[0];
    } else {
      deadlineStr = $("#plan-deadline-date").value;
    }
    
    const studyDaysOfWeek = [];
    $$(".weekday-btn.active").forEach(btn => {
      studyDaysOfWeek.push(parseInt(btn.dataset.day, 10));
    });
    
    if (studyDaysOfWeek.length === 0) {
      toast("Выберите хотя бы один день недели 📅");
      return;
    }
    
    // Собираем главы, отмеченные пользователем как изученные
    const completedChapters = [];
    $$("#completed-chapters-list input[type='checkbox']:checked").forEach(input => {
      const chapterId = parseInt(input.dataset.chapterId, 10);
      if (chapterId) completedChapters.push(chapterId);
    });
    
    const params = {
      startDate: startDateStr,
      deadline: deadlineStr,
      studyDaysOfWeek: studyDaysOfWeek
    };
    
    const result = window.StudyPlan.generatePlan(params, LESSONS, completedChapters);
    
    if (result.error) {
      $("#plan-warning").textContent = result.error + (result.minDays ? ` Минимум: ${result.minDays} учебных дней.` : "");
      $("#plan-warning").classList.remove("hidden");
      return;
    }
    
    $("#plan-warning").classList.add("hidden");
    state.studyPlan = result;
    save();
    toast("План создан! 🎉");
    
    $("#plan-form-container").classList.add("hidden");
    $("#plan-view-container").classList.remove("hidden");
    $("#plan-recalc-btn").classList.remove("hidden");
    renderPlanTimeline();
    renderStudyAdvice();
  }

  function handleRecalcPlan() {
    if (!state.studyPlan) return;
    
    const completedChapters = LESSONS.filter(l => {
      const cs = chState(l.id);
      const items = CHECK_ITEMS.length;
      const done = CHECK_ITEMS.filter(c => cs.checklist[c[0]]).length;
      return done === items;
    }).map(l => l.id);
    
    const result = window.StudyPlan.recalcPlan(state.studyPlan, LESSONS, completedChapters);
    
    if (result.error) {
      toast(result.error);
      return;
    }
    
    state.studyPlan = result;
    save();
    toast("План пересчитан 🔄");
    renderPlanTimeline();
    renderStudyAdvice();
  }

  function getSegmentStatus(segment) {
    const today = new Date().toISOString().split("T")[0];
    const start = segment.startDate;
    const end = segment.endDate;
    
    if (segment.type === "review") {
      if (today > end) return "done";
      if (today >= start && today <= end) return "in-progress";
      return "upcoming";
    }
    
    const cs = chState(segment.chapterId);
    const items = CHECK_ITEMS.length;
    const done = CHECK_ITEMS.filter(c => cs.checklist[c[0]]).length;
    const isCompleted = done === items;
    
    if (isCompleted) return "done";
    if (today > end) return "overdue";
    if (today >= start && today <= end) return "in-progress";
    return "upcoming";
  }

  function renderPlanTimeline() {
    const container = $("#plan-timeline");
    if (!container || !state.studyPlan) return;
    
    container.innerHTML = "";
    const today = new Date().toISOString().split("T")[0];
    
    state.studyPlan.segments.forEach((seg, idx) => {
      const status = getSegmentStatus(seg);
      const el = document.createElement("div");
      el.className = `segment-card ${seg.type} ${status}`;
      el.dataset.testid = `segment-${idx}`;
      
      let title, badge;
      if (seg.type === "review") {
        title = "📚 Повторение";
        badge = "Буфер";
      } else {
        const lesson = LESSONS.find(l => l.id === seg.chapterId);
        title = lesson ? lesson.title : `Глава ${seg.chapterId}`;
        badge = `Глава ${seg.chapterId}`;
      }
      
      const statusLabels = {
        upcoming: "Предстоит",
        "in-progress": "Сейчас",
        done: "Завершено",
        overdue: "Просрочено"
      };
      
      el.innerHTML = `
        <div class="segment-header">
          <h3 class="segment-title">${title}</h3>
          <span class="segment-badge">${badge}</span>
        </div>
        <p class="segment-dates">${formatDate(seg.startDate)} — ${formatDate(seg.endDate)} (${seg.days} дн.)</p>
        <span class="segment-status ${status}">${statusLabels[status]}</span>
      `;
      
      if (seg.type === "chapter") {
        el.onclick = () => nav("chapter", seg.chapterId);
      }
      
      container.appendChild(el);
    });
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDate();
    const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    return `${day} ${months[d.getMonth()]}`;
  }

  function renderPlanCalendarGrid() {
    const container = $("#plan-calendar-grid");
    if (!container || !state.studyPlan) return;
    
    container.innerHTML = "";
    const today = new Date().toISOString().split("T")[0];
    
    const dateMap = {};
    state.studyPlan.segments.forEach(seg => {
      let current = new Date(seg.startDate + "T00:00:00");
      const end = new Date(seg.endDate + "T00:00:00");
      
      while (current <= end) {
        const key = current.toISOString().split("T")[0];
        dateMap[key] = seg;
        current.setDate(current.getDate() + 1);
      }
    });
    
    const months = {};
    Object.keys(dateMap).forEach(date => {
      const d = new Date(date + "T00:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months[key]) months[key] = [];
      months[key].push(date);
    });
    
    Object.keys(months).sort().forEach(monthKey => {
      const [year, month] = monthKey.split("-").map(Number);
      renderMonth(container, year, month - 1, dateMap, today);
    });
  }

  function renderMonth(container, year, month, dateMap, today) {
    const monthDiv = document.createElement("div");
    monthDiv.className = "calendar-month";
    
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", 
                        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    
    monthDiv.innerHTML = `<div class="calendar-month-header">${monthNames[month]} ${year}</div>`;
    
    const weekdays = document.createElement("div");
    weekdays.className = "calendar-weekdays";
    ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].forEach(day => {
      const wd = document.createElement("div");
      wd.className = "calendar-weekday";
      wd.textContent = day;
      weekdays.appendChild(wd);
    });
    monthDiv.appendChild(weekdays);
    
    const grid = document.createElement("div");
    grid.className = "calendar-grid";
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    
    for (let i = 0; i < offset; i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-cell empty";
      grid.appendChild(empty);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      cell.textContent = day;
      
      const seg = dateMap[dateStr];
      if (seg) {
        cell.classList.add(seg.type);
        const status = getSegmentStatus(seg);
        if (status === "done") cell.classList.add("done");
        
        if (seg.type === "chapter") {
          const badge = document.createElement("span");
          badge.className = "calendar-cell-badge";
          badge.textContent = seg.chapterId;
          cell.appendChild(badge);
          
          cell.onclick = () => nav("chapter", seg.chapterId);
        }
      }
      
      if (dateStr === today) {
        cell.classList.add("today");
      }
      
      grid.appendChild(cell);
    }
    
    monthDiv.appendChild(grid);
    container.appendChild(monthDiv);
  }

  function renderStudyAdvice() {
    const container = $("#plan-advice-container");
    if (!container || !state.studyPlan) return;
    
    const today = new Date().toISOString().split("T")[0];
    const currentSeg = state.studyPlan.segments.find(seg => 
      seg.type === "chapter" && seg.startDate <= today && seg.endDate >= today
    );
    
    if (!currentSeg) {
      container.classList.add("hidden");
      return;
    }
    
    container.classList.remove("hidden");
    
    const chapter = LESSONS.find(l => l.id === currentSeg.chapterId);
    if (!chapter) return;
    
    const advice = window.StudyPlan.getHeuristicAdvice(chapter, currentSeg.days);
    
    const bar = $("#plan-advice-bar");
    bar.innerHTML = `
      <div class="advice-segment words" style="flex: ${advice.words}">
        ${advice.words}%
      </div>
      <div class="advice-segment grammar" style="flex: ${advice.grammar}">
        ${advice.grammar}%
      </div>
      <div class="advice-segment reading" style="flex: ${advice.reading}">
        ${advice.reading}%
      </div>
      <div class="advice-segment listening" style="flex: ${advice.listening}">
        ${advice.listening}%
      </div>
    `;
    
    const percentages = $("#plan-advice-percentages");
    percentages.innerHTML = `
      <div class="advice-item">
        <span class="advice-dot words"></span>
        <span class="advice-label">Слова</span>
        <span class="advice-percent">${advice.words}%</span>
      </div>
      <div class="advice-item">
        <span class="advice-dot grammar"></span>
        <span class="advice-label">Грамматика</span>
        <span class="advice-percent">${advice.grammar}%</span>
      </div>
      <div class="advice-item">
        <span class="advice-dot reading"></span>
        <span class="advice-label">Чтение</span>
        <span class="advice-percent">${advice.reading}%</span>
      </div>
      <div class="advice-item">
        <span class="advice-dot listening"></span>
        <span class="advice-label">Аудирование</span>
        <span class="advice-percent">${advice.listening}%</span>
      </div>
    `;
    
    $("#plan-advice-tip").textContent = advice.tip;
  }

  // ---------- Init ----------
  async function init() {
    loadState();
    await loadLessons();
    
    // Миграция v1.2.1: если в главе есть отметки чек-листа, но started=false, запускаем главу
    if (!state.migration_v1_2_1) {
      let migrationApplied = false;
      LESSONS.forEach((lesson) => {
        const cs = chState(lesson.id);
        if (!cs.started) {
          const hasChecks = CHECK_ITEMS.some((c) => cs.checklist[c[0]]);
          if (hasChecks) {
            cs.started = true;
            lesson.words.forEach((w) => {
              if (!state.srs[w.id]) state.srs[w.id] = SRS.newCard(w.id);
            });
            migrationApplied = true;
            console.log(`✅ Миграция: глава ${lesson.id} запущена (было ${Object.keys(cs.checklist).filter(k => cs.checklist[k]).length} отметок)`);
          }
        }
      });
      
      if (migrationApplied) {
        state.migration_v1_2_1 = true;
        save(true);
        console.log("✅ Миграция v1.2.1 завершена успешно");
        toast("🔄 Данные обновлены до новой версии");
      } else {
        state.migration_v1_2_1 = true;
        save(true);
      }
    }
    
    state.initialized = true; save();

    chatHistory = state.chatHistory || [];
    
    // Скрыть loader после инициализации
    const loader = $("#app-loader");
    if (loader) {
      setTimeout(() => {
        loader.classList.add("hidden");
      }, 300);
    }

    // global nav bindings
    $$("[data-nav]").forEach((el) => {
      el.onclick = () => {
        if (el.dataset.nav === "shop") {
          // Для магазина открываем модальное окно
          const modal = $("#shop-modal");
          if (modal) {
            modal.classList.remove("hidden");
            renderShop(); // Рендерим товары при открытии
          }
        } else {
          nav(el.dataset.nav);
        }
      };
    });
    
    // Логотип лисы открывает профиль
    const logoFoxes = $$(".logo-fox");
    logoFoxes.forEach((el) => {
      el.style.cursor = "pointer";
      el.onclick = () => nav("profile");
    });
    
    $("#btn-study-due").onclick = () => startFlash(null);
    const extraReviewBtn = $("#btn-extra-review");
    if (extraReviewBtn) extraReviewBtn.onclick = startExtraReview;
    
    const planEntryBtn = $("[data-testid='plan-entry-btn']");
    if (planEntryBtn) planEntryBtn.onclick = () => nav("plan");
    
    $$(".lib-tab").forEach((t) => t.onclick = () => { libTab = t.dataset.libtab; renderLibrary(); });
    
    // Обработчики табов AI Сенсей
    document.addEventListener("click", (e) => {
      if (e.target.dataset.senseitab) {
        senseiTab = e.target.dataset.senseitab;
        renderSensei();
      }
    });
    
    // Shop modal — close handler (open handler is in renderProfile)
    const shopModal = $("#shop-modal");
    const shopCloseBtn = $("#shop-modal-close");
    if (shopCloseBtn) {
      shopCloseBtn.onclick = () => {
        if (shopModal) shopModal.classList.add("hidden");
      };
    }
    // Закрытие при клике по оверлею
    if (shopModal) {
      shopModal.onclick = (e) => {
        if (e.target === shopModal) {
          shopModal.classList.add("hidden");
        }
      };
    }
    
    // Bottom Sheet для перевода слов — обработчик закрытия
    const bottomSheet = $("#word-bottom-sheet");
    if (bottomSheet) {
      const backdrop = $(".bottom-sheet-backdrop", bottomSheet);
      if (backdrop) {
        backdrop.onclick = closeWordBottomSheet;
      }
    }
    
    // Делегирование событий для токенов слов в историях (вместо множественных обработчиков)
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("word-token")) {
        openWordBottomSheet(e.target);
      }
    });
    // Обработчики табов магазина — в renderShop()

    if ("speechSynthesis" in window) {
      speechSynthesis.getVoices();
      // Если обработчик событий ещё не установлен, подписываемся
      if (!speechSynthesis.onvoiceschanged) {
        speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
      }
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

    applyTheme();
    applyStreakSkin();
    scheduleNotify();
    
    // Устанавливаем начальное состояние истории браузера
    history.replaceState({ screen: 'home' }, '', '');
    nav("home", null, true); // skipHistory=true для начальной загрузки
    
    // Обработчик кнопки "Назад" браузера
    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.screen) {
        // Навигация с флагом skipHistory=true, чтобы не добавлять в историю снова
        nav(event.state.screen, event.state.opt, true);
      } else {
        // Если истории нет (первоначальное состояние), возвращаемся на главную
        nav('home', null, true);
      }
    });
    
    updateSrsBadge();
    syncAvatars();
    
    // Инициализация позиции индикатора табов
    setTimeout(() => updateTabIndicator(), 100);
    
    // Показать onboarding для новых пользователей
    if (!state.onboardingCompleted) {
      setTimeout(() => showOnboarding(), 500);
    }
  }

  // ===== ONBOARDING WIZARD =====
  function showOnboarding() {
    const overlay = document.createElement("div");
    overlay.className = "onboarding-overlay";
    overlay.innerHTML = `
      <div class="onboarding-modal">
        <div class="onboarding-step active" data-step="1">
          <div class="onboarding-icon">🦊</div>
          <h2 class="onboarding-title">Добро пожаловать в Kitsune Genki!</h2>
          <p class="onboarding-subtitle">Твой персональный тренажёр японского языка по учебнику Genki</p>
          <div class="onboarding-features">
            <div class="onboarding-feature">
              <div class="onboarding-feature-icon">📚</div>
              <div class="onboarding-feature-content">
                <h3 class="onboarding-feature-title">12 глав Genki I</h3>
                <p class="onboarding-feature-desc">Структурированное обучение с прогрессом</p>
              </div>
            </div>
            <div class="onboarding-feature">
              <div class="onboarding-feature-icon">🧠</div>
              <div class="onboarding-feature-content">
                <h3 class="onboarding-feature-title">SRS система</h3>
                <p class="onboarding-feature-desc">Умное повторение для запоминания</p>
              </div>
            </div>
            <div class="onboarding-feature">
              <div class="onboarding-feature-icon">🤖</div>
              <div class="onboarding-feature-content">
                <h3 class="onboarding-feature-title">AI-сенсей</h3>
                <p class="onboarding-feature-desc">Ответы на вопросы 24/7</p>
              </div>
            </div>
          </div>
          <div class="onboarding-progress">
            <div class="onboarding-dot active"></div>
            <div class="onboarding-dot"></div>
            <div class="onboarding-dot"></div>
          </div>
          <div class="onboarding-buttons">
            <button class="onboarding-btn-skip">Пропустить</button>
            <button class="onboarding-btn-next">Далее →</button>
          </div>
        </div>
        <div class="onboarding-step" data-step="2">
          <div class="onboarding-icon">🔥</div>
          <h2 class="onboarding-title">Прокачивайся каждый день</h2>
          <p class="onboarding-subtitle">Система мотивации поможет тебе не бросить обучение</p>
          <div class="onboarding-quick-tips">
            <div class="onboarding-tip-card">
              <div class="onboarding-tip-icon">📊</div>
              <div class="onboarding-tip-label">Получай XP и уровни</div>
            </div>
            <div class="onboarding-tip-card">
              <div class="onboarding-tip-icon">🔥</div>
              <div class="onboarding-tip-label">Сохраняй стрик</div>
            </div>
            <div class="onboarding-tip-card">
              <div class="onboarding-tip-icon">🪙</div>
              <div class="onboarding-tip-label">Зарабатывай монеты</div>
            </div>
            <div class="onboarding-tip-card">
              <div class="onboarding-tip-icon">🎨</div>
              <div class="onboarding-tip-label">Открывай скины</div>
            </div>
          </div>
          <div class="onboarding-progress">
            <div class="onboarding-dot"></div>
            <div class="onboarding-dot active"></div>
            <div class="onboarding-dot"></div>
          </div>
          <div class="onboarding-buttons">
            <button class="onboarding-btn-skip">Пропустить</button>
            <button class="onboarding-btn-next">Далее →</button>
          </div>
        </div>
        <div class="onboarding-step" data-step="3">
          <div class="onboarding-icon">🚀</div>
          <h2 class="onboarding-title">Готов начать?</h2>
          <p class="onboarding-subtitle">Выбери главу и начни своё путешествие в мир японского языка</p>
          <div class="onboarding-features">
            <div class="onboarding-feature">
              <div class="onboarding-feature-icon">✅</div>
              <div class="onboarding-feature-content">
                <h3 class="onboarding-feature-title">Изучай по чек-листу</h3>
                <p class="onboarding-feature-desc">Слова, грамматика, диалоги</p>
              </div>
            </div>
            <div class="onboarding-feature">
              <div class="onboarding-feature-icon">🗂️</div>
              <div class="onboarding-feature-content">
                <h3 class="onboarding-feature-title">Создавай заметки</h3>
                <p class="onboarding-feature-desc">Сохраняй важное из чата</p>
              </div>
            </div>
            <div class="onboarding-feature">
              <div class="onboarding-feature-icon">📅</div>
              <div class="onboarding-feature-content">
                <h3 class="onboarding-feature-title">Планируй обучение</h3>
                <p class="onboarding-feature-desc">AI составит расписание</p>
              </div>
            </div>
          </div>
          <div class="onboarding-progress">
            <div class="onboarding-dot"></div>
            <div class="onboarding-dot"></div>
            <div class="onboarding-dot active"></div>
          </div>
          <div class="onboarding-buttons">
            <button class="onboarding-btn-next">Начать обучение 🎉</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    let currentStep = 1;
    const updateStep = () => {
      $$(".onboarding-step", overlay).forEach(s => s.classList.toggle("active", s.dataset.step == currentStep));
    };
    const closeOnboarding = () => {
      overlay.classList.add("fade-out");
      setTimeout(() => overlay.remove(), 300);
      state.onboardingCompleted = true;
      save();
    };
    $$(".onboarding-btn-skip", overlay).forEach(b => b.addEventListener("click", closeOnboarding));
    $$(".onboarding-btn-next", overlay).forEach(b => b.addEventListener("click", () => {
      if (currentStep < 3) { currentStep++; updateStep(); }
      else closeOnboarding();
    }));
  }

  // Автообновление таймера квестов каждую минуту
  setInterval(() => {
    updateMainQuestsTimer();
  }, 60000);

  // ===== ЗАДАЧА 3: Функция инициализации зума =====
  function initCrosswordZoom() {
    let currentZoom = 40; // базовый размер клетки в px
    const gridEl = document.getElementById('crossword-grid');
    
    const updateZoom = (delta) => {
      currentZoom = Math.max(30, Math.min(80, currentZoom + delta));
      if (gridEl) gridEl.style.setProperty('--cw-cell-size', `${currentZoom}px`);
    };

    const zoomInBtn = document.getElementById('cw-zoom-in');
    const zoomOutBtn = document.getElementById('cw-zoom-out');
    if (zoomInBtn) zoomInBtn.onclick = () => updateZoom(5);
    if (zoomOutBtn) zoomOutBtn.onclick = () => updateZoom(-5);
  }

document.addEventListener("DOMContentLoaded", init);

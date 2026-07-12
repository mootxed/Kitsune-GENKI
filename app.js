/* app.js — Kitsune Genki main controller */
(function () {
  "use strict";

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
      saveTimeout = setTimeout(performSave, 300);
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

  // ---------- Navigation ----------
  const SCREENS = ["home", "profile", "chapter", "srs", "sensei", "library", "settings", "plan", "story", "quests"];
  function nav(name, opt) {
    SCREENS.forEach((s) => $("#screen-" + s).classList.toggle("hidden", s !== name));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.nav === name));
    if (name === "home") renderHome();
    if (name === "profile") renderProfile();
    if (name === "srs") renderSRSHome();
    if (name === "library") renderLibrary();
    if (name === "settings") renderSettings();
    if (name === "sensei") renderSensei();
    if (name === "chapter") renderChapter(opt);
    if (name === "plan") renderPlan();
    if (name === "quests") renderQuests();
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

  // ---------- Render: Home ----------
  function renderHome() {
    refreshStreakDisplay();
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

  // ---------- Render: Profile ----------
  let heatmapMonth = null; // текущий месяц для тепловой карты (Date object)

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
    
    const body = $("#profile-body");
    body.innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar" id="profile-avatar-display">${state.currentAvatar || "🦊"}</div>
        <h2 class="profile-name">Kitsune Genki</h2>
        <div class="profile-title" id="profile-title">${state.currentTitle || "Новичок"}</div>
      </div>
      <div class="profile-stats">
        <div class="profile-stat-card">
          <div class="profile-stat-num">${state.level}</div>
          <div class="profile-stat-label">Уровень</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-num">${state.xp}</div>
          <div class="profile-stat-label">XP</div>
        </div>
        <div class="profile-stat-card">
          <div class="profile-stat-num">${state.coins}</div>
          <div class="profile-stat-label">🪙 Монет</div>
        </div>
      </div>
      <div class="quests-section">
        <h3 class="section-title">КВЕСТЫ И ЧЕЛЛЕНДЖИ</h3>
        <div id="quests-container"></div>
      </div>
      <div class="achievements-section">
        <h3 class="section-title">ДОСТИЖЕНИЯ</h3>
        <div class="achievements-progress">
          <div class="achievements-progress-text">
            <p class="achievements-progress-title">ПРОГРЕСС</p>
            <p class="achievements-progress-stats" id="achievements-stats">0 / 0</p>
          </div>
          <div class="achievements-progress-circle" id="achievements-circle"></div>
        </div>
        <div class="achievements-grid" id="achievements-grid"></div>
      </div>
      <div class="profile-heatmap-wrap">
        <div class="heatmap-streak-card">
          <div class="heatmap-streak-icon">🔥</div>
          <div class="heatmap-streak-stats">
            <div class="heatmap-streak-item">
              <div class="heatmap-streak-num">${state.streak.count}</div>
              <div class="heatmap-streak-label">Current streak</div>
            </div>
            <div class="heatmap-streak-divider"></div>
            <div class="heatmap-streak-item">
              <div class="heatmap-streak-num">${longestStreak}</div>
              <div class="heatmap-streak-label">Longest streak</div>
            </div>
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
      <button class="btn-outline" id="btn-open-shop" style="margin-top:8px">🛒 Магазин Кицунэ</button>`;
    renderHeatmap();
    renderAchievements();
    renderQuests();
    
    $("#heatmap-prev").onclick = () => {
      heatmapMonth.setMonth(heatmapMonth.getMonth() - 1);
      renderProfile();
    };
    $("#heatmap-next").onclick = () => {
      heatmapMonth.setMonth(heatmapMonth.getMonth() + 1);
      renderProfile();
    };
    // Shop open handler (button is created dynamically)
    const shopBtn = $("#btn-open-shop");
    if (shopBtn) {
      shopBtn.onclick = () => {
        const shopModal = $("#shop-modal");
        if (shopModal) {
          shopModal.classList.remove("hidden");
          renderShop();
        }
      };
    }
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
      return `<div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
        ${unlocked ? '<span class="achievement-badge">✓</span>' : ''}
        <div class="achievement-emoji">${ach.emoji}</div>
        <h4 class="achievement-title">${ach.title}</h4>
        <p class="achievement-desc">${ach.desc}</p>
      </div>`;
    }).join('');
  }

  function renderQuests() {
    if (!window.QuestsManager || !state.quests) return;

    console.log("DEBUG renderQuests: state.quests.daily =", state.quests.daily);
    console.log("DEBUG renderQuests: state.quests.daily.length =", state.quests.daily?.length);

    const container = $("#quests-container");
    if (!container) return;
    
    const timeLeft = window.QuestsManager.getTimeUntilReset();
    
    // Рендерим Weekly Challenges
    const weeklyHtml = state.quests.weekly.map(challenge => {
      const progress = Math.min((challenge.current / challenge.target) * 100, 100);
      const canClaim = challenge.completed && !challenge.claimed;
      const claimed = challenge.claimed;
      
      return `
        <div class="quest-card weekly ${claimed ? 'claimed' : ''}">
          <div class="quest-icon">${challenge.icon}</div>
          <div class="quest-info">
            <h4 class="quest-title">${challenge.title}</h4>
            <p class="quest-desc">${challenge.desc}</p>
            <div class="quest-progress-bar">
              <div class="quest-progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="quest-counter">${challenge.current}/${challenge.target}</span>
          </div>
          <div class="quest-reward">
            <span class="quest-reward-xp">${challenge.reward.xp} XP</span>
            <span class="quest-reward-coins">${challenge.reward.coins} 🪙</span>
          </div>
          ${canClaim ? 
            `<button class="btn-claim" data-quest-id="${challenge.id}">Забрать</button>` :
            claimed ? 
              `<button class="btn-claim claimed" disabled>✅ Забрано</button>` :
              `<button class="btn-claim" disabled>Забрать</button>`
          }
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
          <div class="quest-icon">${quest.icon}</div>
          <div class="quest-info">
            <h4 class="quest-title">${quest.title}</h4>
            <p class="quest-desc">${quest.desc}</p>
            <div class="quest-progress-bar">
              <div class="quest-progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="quest-counter">${quest.current}/${quest.target}</span>
          </div>
          <div class="quest-reward">
            <span class="quest-reward-xp">${quest.reward.xp} XP</span>
            <span class="quest-reward-coins">${quest.reward.coins} 🪙</span>
          </div>
          ${canClaim ? 
            `<button class="btn-claim" data-quest-id="${quest.id}">Забрать</button>` :
            claimed ? 
              `<button class="btn-claim claimed" disabled>✅ Забрано</button>` :
              `<button class="btn-claim" disabled>Забрать</button>`
          }
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
    
    container.innerHTML = weeklyHtml + dailyHtml;
    
    // Добавляем обработчики для кнопок Claim
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
      cell.onclick = () => {
        if (count > 0) {
          toast(`${key}: ${count} карточек 📊`);
        }
      };
      
      grid.appendChild(cell);
    }
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
        if (!cs.started) { toast("Сначала начните главу 🔒"); return; }
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
          updateXP();
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
    if (total === 0) {
      body.innerHTML = emptyState("🎴", "Пока нет карточек", "Начните главу на Главном экране, чтобы добавить слова в повторение.");
      return;
    }
    body.innerHTML = `
      <header style="padding:6px 0 14px"><h1 class="app-title">Повторение (SRS)</h1><p class="app-subtitle">Интервальные повторения по SM-2</p></header>
      <div class="stat-row">
        <div class="stat-box"><div class="stat-num accent">${due.length}</div><div class="stat-cap">К повтору</div></div>
        <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-cap">Всего карточек</div></div>
      </div>
      <button class="btn-primary" id="srs-start" ${due.length === 0 ? "disabled" : ""} data-testid="srs-start-btn">🎴 ${due.length > 0 ? `Учить ${due.length} карточек` : "Всё повторено на сегодня!"}</button>
      <button class="btn-extra-review ${due.length > 0 ? "hidden" : ""}" id="srs-extra-review" data-testid="srs-extra-review-btn">➕ Доп. повторение (10 карточек)</button>`;
    const b = $("#srs-start");
    if (b) b.onclick = () => startFlash(null);
    const extraBtn = $("#srs-extra-review");
    if (extraBtn) extraBtn.onclick = startExtraReview;
  }
  function renderFlash() {
    const body = $("#srs-body");
    
    // Проверяем завершение через SessionManager
    if (sessionManager && sessionManager.isSessionComplete()) {
      const stats = sessionManager.getStats();
      body.innerHTML = emptyState("🎉", "Сессия завершена!", 
        `Повторено: ${stats.reviewed} карточек<br>Без ошибок: ${stats.perfect}<br>С доучиванием: ${stats.relearned}`) +
        `<button class="btn-primary" id="flash-done" data-testid="flash-done-btn">Готово</button>`;
      $("#flash-done").onclick = () => { 
        sessionManager = null; // очищаем менеджер
        flashCtx ? nav("chapter", flashCtx) : renderSRSHome(); 
      };
      return;
    }
    
    // Получаем следующую карточку через SessionManager
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
    if (!card) {
      // Fallback на старую логику если SessionManager не работает
      if (flashIdx >= flashQueue.length) {
        body.innerHTML = emptyState("🎉", "Сессия завершена!", `Повторено карточек: ${flashQueue.length}`) +
          `<button class="btn-primary" id="flash-done" data-testid="flash-done-btn">Готово</button>`;
        $("#flash-done").onclick = () => { flashCtx ? nav("chapter", flashCtx) : renderSRSHome(); };
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
    
    body.innerHTML = `
      <div class="flash-wrap">
        <div class="flash-top">
          <span class="flash-count" data-testid="flash-progress">${flashIdx + 1} / ${flashQueue.length}</span>
          <button class="btn-ghost" id="flash-exit">Выйти</button>
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
    speak(displayWriting);
    $("#flash-speak").onclick = (e) => { e.stopPropagation(); speak(displayWriting); };
    $("#flash-exit").onclick = () => { flashCtx ? nav("chapter", flashCtx) : renderSRSHome(); };
    $("#flash-card").onclick = () => { 
      if (!flashRevealed) { 
        flashRevealed = true; 
        const inner = document.querySelector(".flash-inner");
        const rate = document.getElementById("rate");
        if (inner) inner.classList.add("flipped");
        if (rate) rate.classList.remove("hidden");
      } 
    };
    $$("#rate .rate-btn").forEach((b) => {
      b.onclick = () => {
        const quality = parseInt(b.dataset.q, 10);
        
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
  function waitForJapaneseVoice() {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) { resolve(null); return; }
      const voices = speechSynthesis.getVoices();
      const found = voices.find((v) => v.lang && v.lang.startsWith("ja"));
      if (found) { resolve(found); return; }
      speechSynthesis.onvoiceschanged = () => {
        const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith("ja"));
        speechSynthesis.onvoiceschanged = null;
        resolve(v || null);
      };
      setTimeout(() => {
        if (speechSynthesis.onvoiceschanged) {
          speechSynthesis.onvoiceschanged = null;
          const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith("ja"));
          resolve(v || null);
        }
      }, 2000);
    });
  }
  async function speak(text) {
    try {
      if (!("speechSynthesis" in window)) return;
      const voice = await waitForJapaneseVoice();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.rate = 0.9;
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  // ---------- Sensei (chat) ----------
  let chatHistory = []; // {role,content}
  function renderSensei() {
    const area = $("#chat-area");
    area.innerHTML = "";
    if (chatHistory.length === 0) {
      addBotMessage("こんにちは！Я — Kitsune Sensei 🦊 Спросите что угодно про японский язык или учебник Genki!");
      return;
    }
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
    syncAvatars();
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
      codeBlocks.push(`<pre>${c.trim()}</pre>`);
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
      </div>
    `;
    
    // Добавляем обработчики переключения переводов
    setupTranslationToggleHandlers();
    
    nav("story");
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
        settings: state.settings,
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
    t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
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
    $$("[data-nav]").forEach((el) => el.onclick = () => nav(el.dataset.nav));
    
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
    $("#chat-send").onclick = sendChat;
    
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
    
    $("#chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

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
    nav("home");
    updateSrsBadge();
    syncAvatars();
    
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

  document.addEventListener("DOMContentLoaded", init);
})();

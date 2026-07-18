/* ui/home.js — Home screen */
import { state, save, chState } from '../state/store.js';
import { refreshStreakDisplay, syncAvatars, updateSrsBadge } from './shared.js';
import { $, todayStr, pluralDays, toast } from '../src/utils.js';
import { dueCards, allCards } from '../srs.js';
import { SRS } from '../src/srs-helpers.js';

// ---------- Constants ----------
const LS_LESSONS = "kitsune_lessons_v1";
const LS_LESSON_VERSION = "kitsune_lessons_version_v1";
const LS_LAST_ACTIVITY_DAY = "kitsune_last_activity_day";

export const CH_NAMES = {
  1: ["Приветствия", "挨拶 (あいさつ)"],
  2: ["Числа и время", "数字と時間 (すうじととき)"],
  3: ["Семья", "家族 (かぞく)"],
  4: ["Еда и напитки", "食べ物と飲み物 (たべものとのみもの)"],
  5: ["Транспорт", "交通 (こうつう)"],
  6: ["Покупки", "買い物 (かいもの)"],
  7: ["Дом", "家 (いえ)"],
  8: ["Природа", "自然 (しぜん)"],
  9: ["Работа и учёба", "仕事と勉強 (しごととべんきょう)"],
  10: ["Хобби", "趣味 (しゅみ)"]
};

export const CHECK_ITEMS = [
  ["vocab", "Vocabulary"],
  ["grammar", "Grammar"],
  ["cultural", "Cultural Notes"],
  ["practice", "Practice"]
];

// Глобальный список уроков
export let LESSONS = [];

// ---------- Load Lessons ----------
export async function loadLessons() {
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

export function getLesson(id) { 
  return LESSONS.find((l) => l.id === id); 
}

// ---------- Streak + Daily Goal ----------
function getLastActivityDay() {
  return localStorage.getItem(LS_LAST_ACTIVITY_DAY);
}

function setLastActivityDay(t) {
  localStorage.setItem(LS_LAST_ACTIVITY_DAY, t);
}

export function markActivity() {
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

export function resetDailyGoalFlag() {
  state._dailyGoalClaimed = false;
  setLastActivityDay(todayStr());
  save();
}

// ---------- Chapter Management ----------
export function startChapter(id) {
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

// ---------- Update Main Quests Timer ----------
export function updateMainQuestsTimer() {
  const timerEl = document.getElementById("main-quests-timer");
  if (timerEl && window.formatTimeUntilReset) {
    timerEl.textContent = window.formatTimeUntilReset();
  }
}

// ---------- Render: Home ----------
export function renderHome() {
  refreshStreakDisplay();
  updateMainQuestsTimer();
  const due = dueCards(state.srs).length;
  const total = allCards(state.srs).length;
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
    el.onclick = () => window.nav("chapter", l.id);
    list.appendChild(el);
  });
  syncAvatars();
}
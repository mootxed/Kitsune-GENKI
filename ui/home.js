/* ui/home.js — Home screen */
import { state, save, chState, loadedChapters } from '../state/store.js';
import { refreshStreakDisplay, syncAvatars, updateSrsBadge } from './shared.js';
import { $, todayStr, pluralDays } from '../src/utils.js';
import { dueCards, allCards, cardChapter } from '../src/srs-helpers.js';
import { SRS } from '../srs.js';
import { loadContentIndex, loadChapterData } from '../src/content-loader.js';
import { toast } from '../app.js';

// ---------- Constants ----------
const LS_LESSONS = 'kitsune_lessons_v1';
const LS_LESSON_VERSION = 'kitsune_lessons_version_v1';
const LS_LAST_ACTIVITY_DAY = 'kitsune_last_activity_day';

export const CH_NAMES = {
  1: ['Приветствия', '挨拶 (あいさつ)'],
  2: ['Числа и время', '数字と時間 (すうじととき)'],
  3: ['Семья', '家族 (かぞく)'],
  4: ['Еда и напитки', '食べ物と飲み物 (たべものとのみもの)'],
  5: ['Транспорт', '交通 (こうつう)'],
  6: ['Покупки', '買い物 (かいもの)'],
  7: ['Дом', '家 (いえ)'],
  8: ['Природа', '自然 (しぜん)'],
  9: ['Работа и учёба', '仕事と勉強 (しごととべんきょう)'],
  10: ['Хобби', '趣味 (しゅみ)'],
  11: ['Здоровье', '健康 (けんこう)'],
  12: ['Путешествия', '旅行 (りょこう)'],
};

export const CHECK_ITEMS = [
  ['vocab', 'Vocabulary'],
  ['grammar', 'Grammar'],
  ['cultural', 'Cultural Notes'],
  ['practice', 'Practice'],
];

// Полные уроки, загруженные лениво (по мере обращения к главам)
export let LESSONS = [];

// Лёгкий индекс глав (метаданные без полного контента)
export let CONTENT_INDEX = [];

// ---------- Load Lessons ----------
// На старте грузим только лёгкий content-index; полные уроки подгружаются
// по требованию через ensureLesson()
export async function loadLessons() {
  // Восстанавливаем ранее загруженные уроки из localStorage (оффлайн-доступ)
  const raw = localStorage.getItem(LS_LESSONS);
  if (raw) {
    try {
      LESSONS = JSON.parse(raw);
      LESSONS.forEach((l) => loadedChapters.set(l.id, { lesson: l, story: undefined }));
    } catch {
      LESSONS = [];
    }
  }

  try {
    const data = await loadContentIndex();
    const fileVersion = data.version || 0;
    const cachedVersion = localStorage.getItem(LS_LESSON_VERSION);
    if (String(cachedVersion) !== String(fileVersion)) {
      // Версия контента изменилась — сбрасываем устаревший кэш уроков
      LESSONS = [];
      loadedChapters.clear();
      localStorage.removeItem(LS_LESSONS);
      localStorage.setItem(LS_LESSON_VERSION, String(fileVersion));
    }
    CONTENT_INDEX = data.chapters || [];
  } catch (e) {
    console.error('Не удалось загрузить content-index.json:', e);
    // Фоллбэк: строим индекс из того, что есть в кэше
    CONTENT_INDEX = LESSONS.map((l) => ({
      id: l.id,
      title: l.title,
      story: null,
      storyMeta: null,
    }));
  }

  // Принудительно обновляем отображение глав после загрузки данных
  if (state && state.initialized) {
    renderHome();
  }
}

// Нормализация одного сырого урока из data/lessons/lesson-XX.json
function normalizeLesson(l) {
  const arr = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);
  const id = l.lesson_id;
  const nm = CH_NAMES[id] || [l.title || 'Глава ' + id, ''];
  return {
    id,
    title: nm[0],
    jp: nm[1],
    words: arr(l.vocabulary).map((v) => ({
      id: v.id,
      kanji: v.kanji || v.writing,
      writing: v.writing,
      romaji: v.romaji,
      translation: v.translation,
      category: v.category,
    })),
    grammar: arr(l.notes).map((n) => ({ title: n.title, content: n.content })),
    cultural: arr(l.cultural_notes).map((n) => ({ title: n.title, content: n.content })),
  };
}

function persistLessonsCache() {
  try {
    localStorage.setItem(LS_LESSONS, JSON.stringify(LESSONS));
  } catch (e) {
    console.warn('Не удалось закэшировать уроки в localStorage:', e);
  }
}

// Ленивая загрузка полного контента главы (урок + история)
export async function ensureLesson(id) {
  id = Number(id);
  if (loadedChapters.has(id)) return loadedChapters.get(id);

  const { lesson, story } = await loadChapterData(id);
  const normalized = normalizeLesson(lesson);

  if (!LESSONS.some((l) => l.id === id)) {
    LESSONS.push(normalized);
    LESSONS.sort((a, b) => a.id - b.id);
    persistLessonsCache();
  }

  const entry = { lesson: normalized, story };
  loadedChapters.set(id, entry);
  return entry;
}

// Подгрузка уроков для всех карточек, уже находящихся в SRS
export async function ensureLessonsForSrs() {
  const ids = new Set(
    allCards(state.srs)
      .map((card) => cardChapter(card.id))
      .filter(Boolean)
  );
  await Promise.all([...ids].map((id) => ensureLesson(id).catch(() => null)));
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
    window.QuestsManager.updateQuestProgress(state, 'daily_cards', 1);
    window.QuestsManager.checkQuestReset(state);
  }

  // Проверяем достижения
  if (window.Achievements) {
    const newAchievements = window.Achievements.checkAll(state);
    newAchievements.forEach((ach) => {
      toast(`🏆 ${ach.title}! ${ach.desc}`);
    });
  }

  // Награда за достижение дневной цели (dailyCards === 10)
  if (state.dailyCards === 10 && !state._dailyGoalClaimed) {
    state._dailyGoalClaimed = true;
    const reward = Math.min(10 + 2 * s.count, 50);
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
      const reward = Math.min(10 + 2 * s.count, 50);
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
  if (!lesson) {
    toast('Глава не найдена');
    return;
  }
  cs.started = true;
  lesson.words.forEach((w) => {
    if (!state.srs[w.id]) state.srs[w.id] = SRS.newCard(w.id);
  });
  save();
  markActivity();
  toast('Глава начата! Слова добавлены в SRS 🎴');
}

// ---------- Update Main Quests Timer ----------
export function updateMainQuestsTimer() {
  const timerEl = document.getElementById('main-quests-timer');
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
  $('#stat-due').textContent = due;
  $('#stat-cards').textContent = total;
  $('#stat-chapters').textContent = CONTENT_INDEX.length;
  const btn = $('#btn-study-due');
  const extraBtn = $('#btn-extra-review');
  $('#study-due-label').textContent =
    due > 0 ? `Повторить ${due} карточек` : 'Нет карточек к повторению';
  btn.disabled = due === 0;
  if (extraBtn) {
    extraBtn.classList.toggle('hidden', due > 0);
  }
  updateSrsBadge();

  const list = $('#chapter-list');
  list.innerHTML = '';
  CONTENT_INDEX.forEach((ch) => {
    const nm = CH_NAMES[ch.id] || [ch.title || 'Глава ' + ch.id, ''];
    const cs = chState(ch.id);

    // Проверка разблокировки: Глава 1 всегда открыта, остальные открываются если предыдущая начата
    const isUnlocked = ch.id === 1 || (ch.id > 1 && chState(ch.id - 1).started);

    const items = CHECK_ITEMS.length;
    const done = CHECK_ITEMS.filter((c) => cs.checklist[c[0]]).length;
    const pct = Math.round((done / items) * 100);
    const el = document.createElement('div');
    el.className = 'chapter-card' + (cs.started ? ' started' : '') + (!isUnlocked ? ' locked' : '');
    el.dataset.testid = 'chapter-card-' + ch.id;

    if (!isUnlocked) {
      el.innerHTML = `
        <div class="ch-badge">🔒</div>
        <div class="ch-main">
          <p class="ch-name">${nm[0]}</p>
          <p class="ch-sub">Завершите предыдущую главу</p>
          <div class="ch-prog"><i style="width:0%"></i></div>
        </div>
        <div class="ch-arrow">›</div>`;
      el.onclick = () => toast('Сначала завершите предыдущую главу');
    } else {
      el.innerHTML = `
        <div class="ch-badge">${ch.id}</div>
        <div class="ch-main">
          <p class="ch-name">${nm[0]}</p>
          <p class="ch-sub">${nm[1] || ''}</p>
          <div class="ch-prog"><i style="width:${pct}%"></i></div>
        </div>
        <div class="ch-arrow">›</div>`;
      el.onclick = () => window.nav('chapter', ch.id);
    }

    list.appendChild(el);
  });
  syncAvatars();
}

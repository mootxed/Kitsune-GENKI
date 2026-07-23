/* ui/home.js — Home screen */
import { state, save, chState, loadedChapters } from '../state/store.js';
import { refreshStreakDisplay, syncAvatars, updateSrsBadge } from './shared.js';
import { $, todayStr } from '../src/utils.js';
import { dueCards, allCards, cardChapter } from '../src/srs-helpers.js';
import { SRS } from '../srs.js';
import { StudyPlan } from '../studyplan.js';
import {
  KNOWLEDGE_TYPES,
  SKILLS,
  makeCardId,
  vocabularySkills,
  vocabularySkillsReadyForIntroduction,
} from '../src/knowledge-model.js';
import { loadContentIndex, loadChapterData } from '../src/content-loader.js';
import { db, STORES } from '../src/db.js';
import { countAvailableCardsForSession } from '../src/srs-limits.js';
import { formatDateKey, parseDateKey } from '../src/local-date.js';
import {
  REQUIRED_CHAPTER_SECTIONS,
  ensureActiveChapterId,
  getChapterProgress,
  isChapterAvailable,
  isChapterCompleted,
} from '../src/chapter-progress.js';

// ---------- Constants ----------
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

export const CHECK_ITEMS = REQUIRED_CHAPTER_SECTIONS.map(({ id, label }) => [id, label]);

const DUE_FIRST_THRESHOLD = 20;
const FALLBACK_CHAPTER_METRICS = [
  [60, 5, 2, 105],
  [57, 9, 1.5, 125],
  [56, 11, 1.5, 135],
  [62, 13, 1, 145],
  [52, 8, 1.5, 115],
  [47, 9, 1.5, 120],
  [52, 8, 1, 110],
  [56, 10, 1.5, 130],
  [55, 7, 1, 115],
  [56, 10, 1, 130],
  [68, 10, 0.7, 145],
  [53, 7, 1, 110],
];

function fallbackContentIndex() {
  return FALLBACK_CHAPTER_METRICS.map(
    ([vocabCount, grammarCount, importanceWeight, estimatedMinutes], index) => {
      const id = index + 1;
      return {
        id,
        title: `Урок ${id}`,
        lesson: `data/lessons/lesson-${String(id).padStart(2, '0')}.json`,
        story: `data/stories/story-${String(id).padStart(2, '0')}.json`,
        vocabCount,
        grammarCount,
        estimatedItems: vocabCount + grammarCount * 4,
        importanceWeight,
        estimatedMinutes,
        checklist: CHECK_ITEMS.map(([sectionId]) => sectionId),
      };
    }
  );
}

// Полные уроки, загруженные лениво (по мере обращения к главам)
export let LESSONS = [];

// Лёгкий индекс глав (метаданные без полного контента)
export let CONTENT_INDEX = [];

// ---------- Load Lessons ----------
// На старте грузим только лёгкий content-index; полные уроки подгружаются
// по требованию через ensureLesson()
export async function loadLessons() {
  // Восстанавливаем ранее загруженные уроки из IndexedDB (оффлайн-доступ)
  const raw = await db.get(STORES.CONTENT_CACHE, 'lessons');
  if (raw) {
    try {
      LESSONS = Array.isArray(raw) ? raw : JSON.parse(raw);
      LESSONS.forEach((l) => loadedChapters.set(l.id, { lesson: l, story: undefined }));
      let reconciled = false;
      for (const lesson of LESSONS) {
        if (!state.chapters[lesson.id]?.started) continue;
        for (const word of lesson.words || []) {
          reconciled = ensureVocabularySkillCards(word) || reconciled;
        }
      }
      if (reconciled) await save(true);
    } catch {
      LESSONS = [];
    }
  }

  try {
    const data = await loadContentIndex();
    const fileVersion = data.version || 0;
    const cachedVersion = await db.get(STORES.CONTENT_CACHE, 'lesson_version');
    if (String(cachedVersion) !== String(fileVersion)) {
      // Версия контента изменилась — сбрасываем устаревший кэш уроков
      LESSONS = [];
      loadedChapters.clear();
      await db.delete(STORES.CONTENT_CACHE, 'lessons');
      await db.set(STORES.CONTENT_CACHE, 'lesson_version', String(fileVersion));
    }
    CONTENT_INDEX = data.chapters || [];
    await db.set(STORES.CONTENT_CACHE, 'content_index', data);
    const previousActiveChapterId = state.activeChapterId;
    ensureActiveChapterId(state, CONTENT_INDEX);
    if (previousActiveChapterId !== state.activeChapterId) await save(true);
  } catch (e) {
    console.error('Не удалось загрузить content-index.json:', e);
    // План никогда не строится из частично загруженного LESSONS.
    const cachedIndex = await db.get(STORES.CONTENT_CACHE, 'content_index');
    CONTENT_INDEX = cachedIndex?.chapters || fallbackContentIndex();
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
    particles: arr(l.particles),
    words: arr(l.vocabulary).map((v) => ({
      id: v.id,
      kanji: v.kanji || v.writing,
      writing: v.writing,
      romaji: v.romaji,
      translation: v.translation,
      category: v.category,
      lexemeId: v.lexemeId || v.lexeme_id || null,
      acceptedAnswers: v.acceptedAnswers || v.accepted_answers || null,
      contextProduction: v.contextProduction || v.context_production || null,
    })),
    grammar: arr(l.notes).map((n) => ({ title: n.title, content: n.content })),
    cultural: arr(l.cultural_notes).map((n) => ({ title: n.title, content: n.content })),
  };
}

async function persistLessonsCache() {
  try {
    await db.set(STORES.CONTENT_CACHE, 'lessons', LESSONS);
  } catch (e) {
    console.warn('Не удалось закэшировать уроки в IndexedDB:', e);
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
  if (state.chapters[id]?.started) {
    const changed = normalized.words.reduce(
      (result, word) => ensureVocabularySkillCards(word) || result,
      false
    );
    if (changed) await save(true);
  }
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
  let added = false;
  for (const lesson of LESSONS) {
    if (!state.chapters[lesson.id]?.started) continue;
    lesson.words.forEach((word) => {
      added = ensureVocabularySkillCards(word) || added;
    });
  }
  if (added) await save(true);
}

function ensureVocabularySkillCards(word) {
  let changed = false;
  const applicable = new Set(vocabularySkills(word));
  const ready = new Set(
    vocabularySkillsReadyForIntroduction(
      word,
      state.reviewEvents || [],
      state.masteryArchive?.[word.id]
    )
  );

  for (const skill of Object.values(SKILLS)) {
    const cardId = makeCardId(word.id, skill);
    const existing = state.srs[cardId];
    if (existing) {
      const shouldSuspend = !applicable.has(skill) || !ready.has(skill);
      if (existing.suspended !== shouldSuspend) {
        existing.suspended = shouldSuspend;
        changed = true;
      }
      continue;
    }

    if (ready.has(skill)) {
      state.srs[cardId] = SRS.newCard(cardId, {
        itemId: word.id,
        skill,
        knowledgeType: KNOWLEDGE_TYPES.VOCABULARY,
      });
      changed = true;
    }
  }
  return changed;
}

export function getLesson(id) {
  return LESSONS.find((l) => l.id === id);
}

// ---------- Streak + Daily Goal ----------
async function getLastActivityDay() {
  return await db.get(STORES.CONTENT_CACHE, 'last_activity_day');
}

async function setLastActivityDay(t) {
  await db.set(STORES.CONTENT_CACHE, 'last_activity_day', t);
}

export function countCompletedReviewsForDate(appState, dateKey) {
  return new Set(
    (appState.reviewEvents || [])
      .filter(
        (event) =>
          !event.undoneAt &&
          event.eventType === 'review' &&
          Number.isInteger(event.reviewedAt) &&
          formatDateKey(event.reviewedAt) === dateKey
      )
      .map((event) => event.eventId || `${event.cardId}:${event.reviewedAt}`)
  ).size;
}

export async function markActivity(toastFn = null) {
  const t = todayStr();
  const s = state.streak;

  // Сброс dailyCards при смене дня (сохраняем в IndexedDB)
  const lastDay = await getLastActivityDay();
  if (lastDay !== t) {
    state.dailyCards = 0;
    state._dailyGoalClaimed = false;
    await setLastActivityDay(t);
  }

  // dailyCards — только фактически записанные FSRS review events.
  // Запуск главы, Sensei, история и чек-лист больше не раздувают этот счётчик.
  const previousDailyCards = Number(state.dailyCards || 0);
  state.dailyCards = countCompletedReviewsForDate(state, t);
  state.history[t] = state.dailyCards;
  const reviewDelta = Math.max(0, state.dailyCards - previousDailyCards);

  // Обновляем прогресс квестов (daily_cards)
  if (window.QuestsManager && reviewDelta > 0) {
    window.QuestsManager.updateQuestProgress(state, 'daily_cards', reviewDelta);
    window.QuestsManager.checkQuestReset(state);
  }

  // Проверяем достижения
  if (window.Achievements) {
    const newAchievements = window.Achievements.checkAll(state);
    newAchievements.forEach((ach) => {
      if (toastFn) toastFn(`🏆 ${ach.title}! ${ach.desc}`);
    });
  }

  // Награда за достижение дневной цели (dailyCards === 10)
  if (state.dailyCards === 10 && !state._dailyGoalClaimed) {
    state._dailyGoalClaimed = true;
    const reward = Math.min(10 + 2 * s.count, 50);
    state.coins += reward;
    if (toastFn) toastFn(`🎯 Дневная цель! +${reward} 🪙`);
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
    const diff = Math.round((parseDateKey(t) - parseDateKey(s.lastActive)) / 86400000);
    if (diff === 1) {
      s.count += 1;
      // Награда за продление стрика
      const reward = Math.min(10 + 2 * s.count, 50);
      state.coins += reward;
      if (toastFn) toastFn(`🔥 Стрик ${s.count} дней! +${reward} 🪙`);
    } else if (diff > 1) s.count = 1;
  }
  s.lastActive = t;
  save();
}

export async function resetDailyGoalFlag() {
  state._dailyGoalClaimed = false;
  await setLastActivityDay(todayStr());
  save();
}

// ---------- Chapter Management ----------
export function startChapter(id, toastFn = null) {
  const cs = chState(id);
  if (cs.started) return;
  if (!isChapterAvailable(state, CONTENT_INDEX, id)) {
    if (toastFn) toastFn('Сначала завершите предыдущую главу');
    return;
  }
  const lesson = getLesson(id);
  if (!lesson) {
    if (toastFn) toastFn('Глава не найдена');
    return;
  }
  cs.started = true;
  cs.startedAt ||= Date.now();
  if (!state.activeChapterId) state.activeChapterId = Number(id);
  lesson.words.forEach((w) => {
    ensureVocabularySkillCards(w);
  });
  save();
  markActivity(toastFn);
  if (toastFn) toastFn('Глава начата! Слова добавлены в SRS 🎴');
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
  const today = todayStr();
  state.dailyCards = countCompletedReviewsForDate(state, today);
  state.history[today] = state.dailyCards;
  refreshStreakDisplay();
  if (state.studyPlan) state.studyPlan = StudyPlan.normalizePlan(state.studyPlan);
  const due = countAvailableCardsForSession(dueCards(state.srs), state.srs);
  const activeChapterId = ensureActiveChapterId(state, CONTENT_INDEX);
  const activeChapter = CONTENT_INDEX.find((chapter) => chapter.id === activeChapterId) || null;
  const progress = activeChapter
    ? getChapterProgress(state, activeChapter.id, activeChapter)
    : null;
  const continueButton = $('#btn-continue-learning');
  const continueTitle = $('#continue-learning-title');
  const continueContext = $('#continue-learning-context');
  const dueFirst = due >= DUE_FIRST_THRESHOLD;

  if (continueTitle) {
    continueTitle.textContent =
      activeChapterId === null ? 'Повторить слабые знания' : 'Продолжить обучение';
  }
  if (continueContext) {
    if (dueFirst) {
      continueContext.textContent = `${due} обязательных повторений накопилось — сначала разберём их`;
    } else if (activeChapter && progress) {
      const section = progress.nextSection?.label || 'Итоговая проверка';
      const minutes = activeChapter.estimatedMinutes
        ? ` · ~${Math.max(10, Math.ceil(activeChapter.estimatedMinutes / 5))} мин`
        : '';
      continueContext.textContent = `Глава ${activeChapter.id}: ${activeChapter.title} · ${section} · ${progress.completedCount} из ${progress.totalCount}${minutes}`;
    } else {
      continueContext.textContent = 'Все главы завершены — закрепите знания по FSRS';
    }
  }
  if (continueButton) {
    continueButton.onclick = () => {
      if (dueFirst || activeChapterId === null) window.nav('srs');
      else window.nav('chapter', activeChapterId);
    };
  }

  const todayContainer = $('#home-plan-today');
  if (todayContainer) {
    todayContainer.innerHTML = renderHomeTodayCard(state, activeChapter, progress);
    todayContainer.querySelector('[data-action="review"]')?.addEventListener('click', () => {
      window.nav('srs');
    });
    todayContainer.querySelector('[data-action="chapter"]')?.addEventListener('click', () => {
      if (activeChapterId) window.nav('chapter', activeChapterId);
    });
    todayContainer.querySelector('[data-action="create-plan"]')?.addEventListener('click', () => {
      window.nav('plan');
    });
    todayContainer.querySelector('[data-action="open-plan"]')?.addEventListener('click', () => {
      window.nav('plan');
    });
  }

  const courseButton = $('#home-course-link');
  if (courseButton) courseButton.onclick = () => window.nav('course');
  updateSrsBadge();
  syncAvatars();
}

function renderHomeTodayCard(appState, activeChapter, progress) {
  if (!appState.studyPlan) {
    return `
      <div class="today-plan-empty">
        <div>
          <span class="today-eyebrow">ПЛАН НА СЕГОДНЯ</span>
          <h2>Составить план обучения</h2>
          <p>Выберите учебные дни и срок — план свяжет главы с ежедневными повторениями.</p>
        </div>
        <button class="btn-primary compact" data-action="create-plan">Составить план</button>
      </div>`;
  }

  const context = StudyPlan.getDailyPlanContext(
    appState.studyPlan,
    appState.srs || {},
    appState.masteryArchive || {},
    undefined,
    {
      reviewEvents: appState.reviewEvents || [],
      learningEvents: appState.learningEvents || [],
    }
  );
  const segment = context.activeSegment;
  const remaining = Math.max(0, (progress?.totalCount || 0) - (progress?.completedCount || 0));
  const duration = activeChapter?.estimatedMinutes
    ? Math.max(10, Math.ceil(activeChapter.estimatedMinutes / 5))
    : null;
  const reviewLabel =
    context.reviewTotalToday > 0
      ? `${context.reviewedToday} из ${context.reviewTotalToday} выполнено`
      : 'На сегодня всё выполнено';
  const overdueLabel =
    context.overdueCount > 0
      ? `<span class="today-overdue">${context.overdueCount} просрочено</span>`
      : '<span class="today-ok">без просрочки</span>';

  return `
    <div class="today-card-header">
      <div>
        <span class="today-eyebrow">ПЛАН НА СЕГОДНЯ</span>
        <h2>${context.dateStatus === 'rest-day' ? 'День отдыха' : 'Конкретные шаги'}</h2>
      </div>
      <button class="text-button" data-action="open-plan">Весь план</button>
    </div>
    <div class="today-action required">
      <div class="today-action-icon">↻</div>
      <div class="today-action-copy">
        <span class="today-action-kind">ОБЯЗАТЕЛЬНО · FSRS</span>
        <strong>Повторить ${context.dueCount} карточек</strong>
        <small>${reviewLabel} · ${overdueLabel}</small>
        <div class="today-progress"><i style="width:${Math.round(context.reviewProgress * 100)}%"></i></div>
      </div>
      <button class="today-action-button" data-action="review" ${context.dueCount === 0 ? 'disabled' : ''}>Начать</button>
    </div>
    ${
      activeChapter && progress
        ? `<div class="today-action">
      <div class="today-action-icon">章</div>
      <div class="today-action-copy">
        <span class="today-action-kind">${segment ? 'ТЕКУЩИЙ СЕГМЕНТ' : 'ОСНОВНОЙ РАЗДЕЛ'}</span>
        <strong>Глава ${activeChapter.id}: ${progress.nextSection?.label || 'Итоговая проверка'}</strong>
        <small>${progress.completedCount} из ${progress.totalCount} разделов · осталось ${remaining}${duration ? ` · ~${duration} мин` : ''}</small>
        <div class="today-progress chapter"><i style="width:${Math.round(progress.ratio * 100)}%"></i></div>
      </div>
      <button class="today-action-button" data-action="chapter">Продолжить</button>
    </div>`
        : `<div class="today-action complete">
      <div class="today-action-icon">✓</div>
      <div class="today-action-copy"><strong>Основной курс завершён</strong><small>FSRS продолжит назначать повторения слабых знаний.</small></div>
    </div>`
    }`;
}

export function renderCourse() {
  const list = $('#course-list');
  if (!list) return;
  ensureActiveChapterId(state, CONTENT_INDEX);
  list.innerHTML = '';
  CONTENT_INDEX.forEach((chapter) => {
    const chapterState = chState(chapter.id);
    const progress = getChapterProgress(state, chapter.id, chapter);
    const available = isChapterAvailable(state, CONTENT_INDEX, chapter.id);
    const completed = isChapterCompleted(chapterState, chapter);
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `chapter-card course-chapter ${completed ? 'completed' : ''} ${available ? '' : 'locked'}`;
    element.dataset.testid = `chapter-card-${chapter.id}`;
    element.innerHTML = `
      <span class="ch-badge">${completed ? '✓' : available ? chapter.id : '🔒'}</span>
      <span class="ch-main">
        <span class="ch-name">Глава ${chapter.id}: ${chapter.title}</span>
        <span class="ch-sub">${completed ? 'Завершено' : `${progress.completedCount} из ${progress.totalCount} разделов`}</span>
        <span class="ch-prog"><i style="width:${Math.round(progress.ratio * 100)}%"></i></span>
      </span>
      <span class="ch-arrow">›</span>`;
    element.onclick = () => {
      if (!available && !completed) {
        window.toast?.('Сначала завершите предыдущую главу');
        return;
      }
      window.nav('chapter', chapter.id);
    };
    list.appendChild(element);
  });
}

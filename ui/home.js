/* ui/home.js — Home screen */
import { state, save, chState, loadedChapters } from '../state/store.js';
import { refreshStreakDisplay, syncAvatars, updateSrsBadge } from './shared.js';
import { $, todayStr } from '../src/utils.js';
import { dueCards, allCards, cardChapter } from '../src/srs-helpers.js';
import { SRS } from '../srs.js';
import { StudyPlan } from '../studyplan.js';
import { loadContentIndex, loadChapterData } from '../src/content-loader.js';
import { normalizeWord } from '../src/normalize-word.js';
import { db, STORES } from '../src/db.js';
import { ExamplesDB } from '../src/examples-db.js';
import { countAvailableCardsForSession } from '../src/srs-limits.js';
import { formatDateKey, parseDateKey } from '../src/local-date.js';
import {
  REQUIRED_CHAPTER_SECTIONS,
  ensureActiveChapterId,
  getChapterProgress,
  isChapterAvailable,
  isChapterCompleted,
  shouldChapterHaveVocabularyCards,
} from '../src/chapter-progress.js';
import {
  ensureVocabularySkillCards as ensureVocabularySkillCardsImpl,
  ensureChapterVocabularyCards as ensureChapterVocabularyCardsImpl,
  reconcilePriorKnowledgeVocabulary,
} from '../src/chapter-vocabulary.js';
import {
  unlockDailyVocabularyBatch,
  getVocabularyBatchProgress,
  getTodayVocabularyUnlockDecision,
  FALLBACK_DAILY_NEW_VOCABULARY_LIMIT,
  ensureTodayVocabularyBatch,
  getNextStudyAction,
  getOldestIncompleteVocabularyBatch,
  startVocabularyBatchSession,
} from '../src/vocabulary-unlock-plan.js';

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

const NORMALIZED_WORD_SCHEMA_VERSION = 3;

// ---------- Load Lessons ----------
// На старте грузим только лёгкий content-index; полные уроки подгружаются
// по требованию через ensureLesson()
export async function loadLessons() {
  let fileVersion = 0;
  let indexData = null;
  try {
    indexData = await loadContentIndex();
    fileVersion = indexData.version || 0;
  } catch (e) {
    console.error('Не удалось загрузить content-index.json:', e);
  }

  const cachedVersion = await db.get(STORES.CONTENT_CACHE, 'lesson_version');
  const cachedSchemaVersion = (await db.get(STORES.CONTENT_CACHE, 'schema_version')) || 0;

  const contentVersionMatches = String(cachedVersion) === String(fileVersion);
  const schemaVersionMatches = cachedSchemaVersion === NORMALIZED_WORD_SCHEMA_VERSION;

  const raw = await db.get(STORES.CONTENT_CACHE, 'lessons');
  let cachedLessons = [];
  if (raw) {
    try {
      cachedLessons = Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch {
      cachedLessons = [];
    }
  }

  if (cachedLessons.length > 0 && (!contentVersionMatches || !schemaVersionMatches)) {
    // Migration: reconstruct safely from actual lesson JSON
    const migratedLessons = [];
    for (const oldLesson of cachedLessons) {
      try {
        const { lesson } = await loadChapterData(oldLesson.id);
        migratedLessons.push(normalizeLesson(lesson));
      } catch (e) {
        // Fallback to old lesson if offline
        migratedLessons.push(oldLesson);
      }
    }
    LESSONS = migratedLessons;
    await db.set(STORES.CONTENT_CACHE, 'lessons', LESSONS);
    await db.set(STORES.CONTENT_CACHE, 'lesson_version', String(fileVersion));
    await db.set(STORES.CONTENT_CACHE, 'schema_version', NORMALIZED_WORD_SCHEMA_VERSION);
  } else {
    LESSONS = cachedLessons;
    // Ensure if we don't have cache but version matches, we set the schema version anyway
    if (cachedLessons.length === 0 && indexData) {
      await db.set(STORES.CONTENT_CACHE, 'lesson_version', String(fileVersion));
      await db.set(STORES.CONTENT_CACHE, 'schema_version', NORMALIZED_WORD_SCHEMA_VERSION);
    }
  }

  if (LESSONS.length > 0) {
    reconcileLessonIds();
    LESSONS.forEach((l) => {
      loadedChapters.set(l.id, { lesson: l, story: undefined });
      ExamplesDB.registerLesson(l);
    });
    ExamplesDB.rebuildIndex();
    let reconciled = false;
    for (const lesson of LESSONS) {
      if (!shouldChapterHaveVocabularyCards(state, lesson.id)) continue;
      const res = ensureChapterVocabularyCardsImpl(state, lesson);
      if (res.changed) reconciled = true;
    }
    if (reconciled) await save(true);
  }

  if (indexData) {
    CONTENT_INDEX = indexData.chapters || [];
    await db.set(STORES.CONTENT_CACHE, 'content_index', indexData);
  } else {
    const cachedIndex = await db.get(STORES.CONTENT_CACHE, 'content_index');
    CONTENT_INDEX = cachedIndex?.chapters || fallbackContentIndex();
  }

  // Runtime backfill reconciliation for prior knowledge chapters
  if (Array.isArray(state.priorKnowledgeChapterIds) && state.priorKnowledgeChapterIds.length > 0) {
    try {
      const pkResult = await reconcilePriorKnowledgeVocabulary(state, ensureLesson);
      if (pkResult.addedCards > 0) await save(true);
    } catch (e) {
      console.warn('[loadLessons] Prior knowledge backfill reconciliation error:', e);
    }
  }

  const previousActiveChapterId = state.activeChapterId;
  ensureActiveChapterId(state, CONTENT_INDEX);
  if (previousActiveChapterId !== state.activeChapterId) await save(true);

  try {
    const res = await fetch('data/particles-dictionary.json');
    if (res.ok) {
      const data = await res.json();
      ExamplesDB.registerParticlesDictionary(data);
      ExamplesDB.rebuildIndex();
    }
  } catch (e) {
    console.warn('Не удалось загрузить словарь частиц для ExamplesDB:', e);
  }

  // Загрузка curated примеров слов
  try {
    const res = await fetch('data/curated-word-examples.json');
    if (res.ok) {
      const data = await res.json();
      ExamplesDB.registerCuratedWordExamples(data);
      ExamplesDB.rebuildIndex();
    }
  } catch (e) {
    console.warn('Не удалось загрузить curated примеры для ExamplesDB:', e);
  }

  // Координатор дневных порций слов после загрузки уроков
  if (state && state.initialized && state.activeChapterId) {
    const batchRes = ensureTodayVocabularyBatch(state, state.activeChapterId, {
      plan: state.studyPlan,
    });
    if (batchRes.created) await save(true);
  }

  // Принудительно обновляем отображение глав после загрузки данных
  if (state && state.initialized) {
    renderHome();
  }
}

export function reconcileLessonIds() {
  const lexemeToLessons = new Map();
  // Сначала соберем все lessonIds для каждого lexemeId
  for (const l of LESSONS) {
    for (const w of l.words || []) {
      if (w.lexemeId) {
        if (!lexemeToLessons.has(w.lexemeId)) {
          lexemeToLessons.set(w.lexemeId, new Set());
        }
        const set = lexemeToLessons.get(w.lexemeId);
        set.add(Number(l.id));
        if (Array.isArray(w.lessonIds)) {
          w.lessonIds.forEach((id) => set.add(Number(id)));
        }
      }
    }
  }
  // Теперь обновим lessonIds во всех словах
  for (const l of LESSONS) {
    for (const w of l.words || []) {
      if (w.lexemeId) {
        w.lessonIds = Array.from(lexemeToLessons.get(w.lexemeId)).sort((a, b) => a - b);
      }
    }
  }
}

// Нормализация одного сырого урока из data/lessons/lesson-XX.json
function normalizeLesson(l) {
  const arr = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);
  const id = Number(l.id || l.lesson_id);
  const nm = CH_NAMES[id] || [l.title || 'Глава ' + id, ''];
  return {
    id,
    title: nm[0],
    jp: nm[1],
    particles: arr(l.particles),
    words: arr(l.vocabulary).map((v) => normalizeWord(v, id)),
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
  let entry = loadedChapters.get(id);
  if (entry && entry.story !== undefined) return entry;

  const { lesson, story } = await loadChapterData(id);
  const normalized = entry ? entry.lesson : normalizeLesson(lesson);

  // Register in ExamplesDB
  ExamplesDB.registerLesson(normalized);
  if (story) {
    ExamplesDB.registerStory(story);
  }
  ExamplesDB.rebuildIndex();

  if (!LESSONS.some((l) => l.id === id)) {
    LESSONS.push(normalized);
    LESSONS.sort((a, b) => a.id - b.id);
    reconcileLessonIds();
    persistLessonsCache();
  } else if (!entry) {
    const idx = LESSONS.findIndex((l) => l.id === id);
    if (idx !== -1) LESSONS[idx] = normalized;
    reconcileLessonIds();
    persistLessonsCache();
  }

  const newEntry = { lesson: normalized, story: story || null };
  loadedChapters.set(id, newEntry);
  if (shouldChapterHaveVocabularyCards(state, id)) {
    const res = ensureChapterVocabularyCardsImpl(state, normalized);
    if (res.changed) await save(true);
  }
  return newEntry;
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
    if (!shouldChapterHaveVocabularyCards(state, lesson.id)) continue;
    const res = ensureChapterVocabularyCardsImpl(state, lesson);
    if (res.changed) added = true;
  }
  if (added) await save(true);
}

export function ensureVocabularySkillCards(word) {
  return ensureVocabularySkillCardsImpl(state, word);
}

export function ensureChapterVocabularyCards(lesson) {
  return ensureChapterVocabularyCardsImpl(state, lesson);
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
  ensureChapterVocabularyCardsImpl(state, lesson, { planLocked: true });

  const batchRes = ensureTodayVocabularyBatch(state, id, {
    plan: state.studyPlan,
    words: lesson.words,
  });

  save();
  markActivity(toastFn);
  if (batchRes.blockedByPreviousBatch) {
    if (toastFn) toastFn('Сначала завершите предыдущую дневную порцию слов');
  } else if (toastFn) {
    toastFn('Глава начата! Первая порция слов доступна 🎴');
  }
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

  const activeChapterId = ensureActiveChapterId(state, CONTENT_INDEX);
  const activeChapter = CONTENT_INDEX.find((chapter) => chapter.id === activeChapterId) || null;
  const progress = activeChapter
    ? getChapterProgress(state, activeChapter.id, activeChapter)
    : null;

  if (activeChapterId) {
    const batchRes = ensureTodayVocabularyBatch(state, activeChapterId, {
      plan: state.studyPlan,
      dateKey: today,
    });
    if (batchRes.created) save();
  }

  const nextAction = getNextStudyAction(state, {
    activeChapterId,
    chapterProgress: progress,
    today,
  });

  const continueButton = $('#btn-continue-learning');
  const continueTitle = $('#continue-learning-title');
  const continueContext = $('#continue-learning-context');

  if (continueTitle) continueTitle.textContent = nextAction.title;
  if (continueContext) continueContext.textContent = nextAction.contextText;
  if (continueButton) {
    continueButton.onclick = () => {
      if (nextAction.action === 'review') {
        window.nav('srs');
      } else if (nextAction.action === 'vocab-session') {
        startVocabularyBatchSession(nextAction.chapterId, nextAction.dateKey, state, {
          toast: window.toast,
          QuestsManager: window.QuestsManager,
          save,
          renderFlash: window.renderFlash,
        });
      } else if (nextAction.action === 'chapter') {
        if (nextAction.chapterId) window.nav('chapter', nextAction.chapterId);
        else window.nav('course');
      } else if (nextAction.action === 'course') {
        window.nav('course');
      } else {
        window.nav('srs');
      }
    };
  }

  const todayContainer = $('#home-plan-today');
  if (todayContainer) {
    todayContainer.innerHTML = renderHomeTodayCard(state, activeChapter, progress);

    // Bind click events on interactive child elements within today-plan-empty
    todayContainer.querySelector('[data-action="create-plan"]')?.addEventListener('click', () => {
      window.nav('plan');
    });
    todayContainer.querySelector('[data-action="open-plan"]')?.addEventListener('click', () => {
      window.nav('plan');
    });

    // Bind row click handlers and double-click protection for buttons
    todayContainer.querySelectorAll('.today-action.clickable').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        const action = row.dataset.action;
        const dateKey = row.dataset.dateKey || today;
        if (action === 'review') window.nav('srs');
        else if (action === 'vocab-session') {
          startVocabularyBatchSession(activeChapterId, dateKey, state, {
            toast: window.toast,
            QuestsManager: window.QuestsManager,
            save,
            renderFlash: window.renderFlash,
          });
        } else if (action === 'chapter') {
          if (activeChapterId) window.nav('chapter', activeChapterId);
        } else if (action === 'ai-story') {
          window.nav('ai-story');
        } else if (action === 'crossword') {
          window.nav('crossword');
        }
      });
    });

    // Also bind explicit button clicks inside the rows
    todayContainer.querySelectorAll('.today-action-button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const dateKey = btn.dataset.dateKey || today;
        if (action === 'review') window.nav('srs');
        else if (action === 'vocab-session') {
          startVocabularyBatchSession(activeChapterId, dateKey, state, {
            toast: window.toast,
            QuestsManager: window.QuestsManager,
            save,
            renderFlash: window.renderFlash,
          });
        } else if (action === 'chapter') {
          if (activeChapterId) window.nav('chapter', activeChapterId);
        } else if (action === 'ai-story') {
          window.nav('ai-story');
        } else if (action === 'crossword') {
          window.nav('crossword');
        }
      });
    });
  }

  const courseButton = $('#home-course-link');
  if (courseButton) courseButton.onclick = () => window.nav('course');
  updateSrsBadge();
  syncAvatars();
}

export function renderHomeTodayCard(appState, activeChapter, progress) {
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

  const today = todayStr();
  const context = StudyPlan.getDailyPlanContext(
    appState.studyPlan,
    appState.srs || {},
    appState.masteryArchive || {},
    today,
    {
      reviewEvents: appState.reviewEvents || [],
      learningEvents: appState.learningEvents || [],
    }
  );

  const dateStatus = context.dateStatus;
  const dueCount = context.dueCount;
  const reviewedToday = context.reviewedToday;
  const reviewTotalToday = context.reviewTotalToday;
  const overdueCount = context.overdueCount;

  // Real event evidence of learning section completion today
  const hasLearningEvidence =
    (appState.learningEvents || []).some(
      (event) =>
        !event.undoneAt &&
        event.dateKey === today &&
        event.chapterId === (activeChapter?.id || null) &&
        ['section-completed', 'chapter-completed'].includes(event.eventType)
    ) || false;

  const hasFSRSTask = dueCount > 0 || reviewedToday > 0;
  const fsrsCompleted = dueCount === 0;

  const isRestDay = dateStatus === 'rest-day';
  const hasChapterTask = !isRestDay && activeChapter !== null;
  const chapterCompleted = progress ? progress.completed || hasLearningEvidence : true;

  // Build the display tasks array
  const tasksToDisplay = [];

  if (hasFSRSTask) {
    const overdueLabel =
      overdueCount > 0 ? ` · <span class="today-overdue">${overdueCount} просрочено</span>` : '';
    tasksToDisplay.push({
      id: 'fsrs',
      isMandatory: true,
      isCompleted: fsrsCompleted,
      title: `Повторить ${reviewTotalToday} карточек`,
      subtext: `${reviewedToday} из ${reviewTotalToday} выполнено${overdueLabel}`,
      action: 'review',
      progressHTML: `<div class="today-progress"><i style="width:${Math.round(context.reviewProgress * 100)}%"></i></div>`,
    });
  }

  const oldVocabBatch = activeChapter
    ? getOldestIncompleteVocabularyBatch(appState, activeChapter.id, today)
    : null;

  if (oldVocabBatch) {
    tasksToDisplay.push({
      id: 'old-vocab-batch',
      isMandatory: true,
      isCompleted: false,
      title: `Продолжить слова за ${oldVocabBatch.dateKey}`,
      subtext: `Глава ${activeChapter.id} · Осталось ${oldVocabBatch.remaining} слов`,
      action: 'vocab-session',
      batchDateKey: oldVocabBatch.dateKey,
      progressHTML: `<div class="today-progress vocab"><i style="width:${Math.round(oldVocabBatch.progress.ratio * 100)}%"></i></div>`,
    });
  } else {
    const vocabProgress = activeChapter
      ? getVocabularyBatchProgress(appState, activeChapter.id, today)
      : null;
    const hasVocabTask = vocabProgress && vocabProgress.total > 0;

    if (hasVocabTask) {
      tasksToDisplay.push({
        id: 'vocab-batch',
        isMandatory: true,
        isCompleted: vocabProgress.isCompleted,
        title: `Новые слова · Глава ${activeChapter.id}`,
        subtext: `${vocabProgress.completed} из ${vocabProgress.total} изучено`,
        action: 'vocab-session',
        batchDateKey: today,
        progressHTML: `<div class="today-progress vocab"><i style="width:${Math.round(vocabProgress.ratio * 100)}%"></i></div>`,
      });
    }
  }

  if (hasChapterTask) {
    const remaining = Math.max(0, (progress?.totalCount || 0) - (progress?.completedCount || 0));
    const duration = activeChapter?.estimatedMinutes
      ? Math.max(10, Math.ceil(activeChapter.estimatedMinutes / 5))
      : null;
    const durationLabel = duration ? ` · ~${duration} мин` : '';
    const sectionLabel = progress?.nextSection?.label || 'Итоговая проверка';

    tasksToDisplay.push({
      id: 'chapter',
      isMandatory: true,
      isCompleted: chapterCompleted,
      title: `Глава ${activeChapter.id} · ${sectionLabel}`,
      subtext: `${progress?.completedCount || 0} из ${progress?.totalCount || 0} разделов · осталось ${remaining}${durationLabel}`,
      action: 'chapter',
      progressHTML: `<div class="today-progress chapter"><i style="width:${Math.round((progress?.ratio || 0) * 100)}%"></i></div>`,
    });
  }

  // Bonus task check: weak words / lapses / low retrievability
  const now = Date.now();
  const activeCards = Object.values(appState.srs || {}).filter((c) => !c.suspended && c.reps > 0);
  const weakCards = activeCards.filter((c) => {
    const retrievability = SRS.getRetrievability(c, now);
    return c.lapses > 0 || c.difficulty >= 6.5 || (retrievability > 0 && retrievability < 0.85);
  });

  const startedLessons = Object.keys(appState.chapters || {}).filter((id) =>
    shouldChapterHaveVocabularyCards(appState, id)
  ).length;
  const crosswordUnlocked = startedLessons >= 3;

  let bonusTask = null;
  if (weakCards.length > 0) {
    bonusTask = {
      id: 'ai-story',
      title: 'Закрепить слабые слова в AI-истории',
      subtext: `У вас есть ${weakCards.length} сложных слов для тренировки`,
      action: 'ai-story',
    };
  } else if (crosswordUnlocked) {
    bonusTask = {
      id: 'crossword',
      title: 'Решить кроссворд',
      subtext: 'Закрепляйте изученные слова в игровой форме',
      action: 'crossword',
    };
  }

  if (bonusTask) {
    tasksToDisplay.push({
      id: bonusTask.id,
      isMandatory: false,
      isCompleted: false,
      title: bonusTask.title,
      subtext: bonusTask.subtext,
      action: bonusTask.action,
    });
  }

  // Distribute button styles for uncompleted tasks
  const uncompletedMandatory = tasksToDisplay.filter((t) => t.isMandatory && !t.isCompleted);
  tasksToDisplay.forEach((t) => {
    if (t.isCompleted) return;
    if (t.isMandatory) {
      if (t === uncompletedMandatory[0]) {
        t.btnStyle = 'primary';
      } else {
        t.btnStyle = 'secondary';
      }
    } else {
      t.btnStyle = 'neutral';
    }
  });

  // Check if all mandatory tasks are done
  const vocabTask = tasksToDisplay.find(
    (t) => t.id === 'vocab-batch' || t.id === 'old-vocab-batch'
  );
  const hasVocabTask = Boolean(vocabTask);
  const vocabCompleted = vocabTask ? vocabTask.isCompleted : true;

  const mandatoryTasks = [];
  if (hasFSRSTask) mandatoryTasks.push({ isCompleted: fsrsCompleted });
  if (hasVocabTask) mandatoryTasks.push({ isCompleted: vocabCompleted });
  if (hasChapterTask) mandatoryTasks.push({ isCompleted: chapterCompleted });
  const allMandatoryDone =
    mandatoryTasks.length === 0 || mandatoryTasks.every((t) => t.isCompleted);

  const headerTitle = allMandatoryDone
    ? 'План на сегодня выполнен ✓'
    : isRestDay
      ? 'День отдыха'
      : 'Конкретные шаги';

  const tasksHTML =
    tasksToDisplay.length === 0
      ? `
      <div class="today-completed-state">
        <span class="completed-icon">🎉</span>
        <p>Вы выполнили все обязательные задачи на сегодня. Отличная работа!</p>
      </div>`
      : tasksToDisplay
          .map((task) => {
            const icon =
              task.id === 'chapter'
                ? '章'
                : task.id === 'ai-story'
                  ? '✨'
                  : task.id === 'crossword'
                    ? '🧩'
                    : '↻';

            const kindLabel =
              task.id === 'fsrs'
                ? 'ОБЯЗАТЕЛЬНО · FSRS'
                : task.id === 'vocab-batch' || task.id === 'old-vocab-batch'
                  ? 'ОБЯЗАТЕЛЬНО · НОВЫЕ СЛОВА'
                  : task.id === 'chapter'
                    ? 'ОБЯЗАТЕЛЬНО · АКТИВНАЯ ГЛАВА'
                    : 'ДОПОЛНИТЕЛЬНО · БОНУС';

            const dateKeyAttr = task.batchDateKey ? ` data-date-key="${task.batchDateKey}"` : '';

            const ctaHTML = task.isCompleted
              ? `<span class="task-status-completed">✓ Выполнено</span>`
              : (() => {
                  const btnText =
                    task.id === 'fsrs'
                      ? 'Начать повторение'
                      : task.id === 'vocab-batch' || task.id === 'old-vocab-batch'
                        ? 'Учить слова'
                        : task.id === 'chapter'
                          ? 'Продолжить'
                          : 'Начать';

                  const btnClass = `today-action-button${
                    task.btnStyle === 'primary'
                      ? ' primary'
                      : task.btnStyle === 'secondary'
                        ? ' secondary'
                        : task.btnStyle === 'neutral'
                          ? ' neutral'
                          : ''
                  }`;

                  return `<button class="${btnClass}" data-action="${task.action}"${dateKeyAttr}>${btnText}</button>`;
                })();

            const clickableClass = !task.isCompleted ? 'clickable' : '';

            return `
        <div class="today-action ${task.isMandatory ? 'required' : ''} ${clickableClass}" data-action="${task.action}"${dateKeyAttr}>
          <div class="today-action-icon">${icon}</div>
          <div class="today-action-copy">
            <span class="today-action-kind">${kindLabel}</span>
            <strong>${task.title}</strong>
            <small>${task.subtext}</small>
            ${task.progressHTML || ''}
          </div>
          <div class="today-action-cta">
            ${ctaHTML}
          </div>
        </div>
      `;
          })
          .join('');

  return `
    <div class="today-card-header">
      <div>
        <span class="today-eyebrow">ПЛАН НА СЕГОДНЯ</span>
        <h2>${headerTitle}</h2>
      </div>
      <button class="text-button" data-action="open-plan">Весь план</button>
    </div>
    ${tasksHTML}
  `;
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

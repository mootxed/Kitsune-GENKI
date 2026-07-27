/* ui/home.js — Home screen */
import { state, save, chState, loadedChapters } from '../state/store.js';
import { refreshStreakDisplay, syncAvatars, updateSrsBadge } from './shared.js';
import { $, todayStr } from '../src/utils.js';
import { allCards, cardChapter } from '../src/srs-helpers.js';
import { StudyPlan } from '../studyplan.js';
import { loadContentIndex, loadChapterData } from '../src/content-loader.js';
import { normalizeWord } from '../src/normalize-word.js';
import { normalizeChapterContent } from '../src/chapter-content.js';
import {
  loadSupplementalPracticeData,
  SUPPLEMENTAL_PRACTICE_SCHEMA_VERSION,
} from '../src/supplemental-practice.js';
import { db, STORES } from '../src/db.js';
import { ExamplesDB } from '../src/examples-db.js';
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
  ensureTodayVocabularyBatch,
  startVocabularyBatchSession,
} from '../src/vocabulary-unlock-plan.js';
import { getNextStudyAction, getOrGenerateDailyPlan } from '../src/daily-plan.js';

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
  let workbookSchemaVersion = 0;
  try {
    const workbook = await loadSupplementalPracticeData();
    workbookSchemaVersion = workbook.schemaVersion;
  } catch (e) {
    console.warn('Не удалось загрузить Workbook metadata:', e);
  }

  const cachedVersion = await db.get(STORES.CONTENT_CACHE, 'lesson_version');
  const cachedSchemaVersion = (await db.get(STORES.CONTENT_CACHE, 'schema_version')) || 0;
  const cachedWorkbookSchemaVersion =
    (await db.get(STORES.CONTENT_CACHE, 'workbook_schema_version')) || 0;

  const contentVersionMatches = String(cachedVersion) === String(fileVersion);
  const schemaVersionMatches = cachedSchemaVersion === NORMALIZED_WORD_SCHEMA_VERSION;
  const workbookVersionMatches =
    workbookSchemaVersion === 0 ||
    (cachedWorkbookSchemaVersion === SUPPLEMENTAL_PRACTICE_SCHEMA_VERSION &&
      cachedWorkbookSchemaVersion === workbookSchemaVersion);

  const raw = await db.get(STORES.CONTENT_CACHE, 'lessons');
  let cachedLessons = [];
  if (raw) {
    try {
      cachedLessons = Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch {
      cachedLessons = [];
    }
  }

  if (
    cachedLessons.length > 0 &&
    (!contentVersionMatches || !schemaVersionMatches || !workbookVersionMatches)
  ) {
    // Migration: reconstruct safely from actual lesson JSON
    const migratedLessons = [];
    for (const oldLesson of cachedLessons) {
      try {
        const { lesson } = await loadChapterData(oldLesson.id);
        migratedLessons.push(normalizeLesson(lesson));
      } catch {
        // Fallback to old lesson if offline
        migratedLessons.push(oldLesson);
      }
    }
    LESSONS = migratedLessons;
    await db.set(STORES.CONTENT_CACHE, 'lessons', LESSONS);
    await db.set(STORES.CONTENT_CACHE, 'lesson_version', String(fileVersion));
    await db.set(STORES.CONTENT_CACHE, 'schema_version', NORMALIZED_WORD_SCHEMA_VERSION);
    if (workbookSchemaVersion > 0) {
      await db.set(STORES.CONTENT_CACHE, 'workbook_schema_version', workbookSchemaVersion);
    }
  } else {
    LESSONS = cachedLessons;
    // Ensure if we don't have cache but version matches, we set the schema version anyway
    if (cachedLessons.length === 0 && indexData) {
      await db.set(STORES.CONTENT_CACHE, 'lesson_version', String(fileVersion));
      await db.set(STORES.CONTENT_CACHE, 'schema_version', NORMALIZED_WORD_SCHEMA_VERSION);
      if (workbookSchemaVersion > 0) {
        await db.set(STORES.CONTENT_CACHE, 'workbook_schema_version', workbookSchemaVersion);
      }
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
function normalizeLesson(lesson) {
  return normalizeChapterContent(lesson, lesson.practice || [], {
    chapterNames: CH_NAMES,
    normalizeWord,
  });
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
let homeRuntimeDependencies = {};

export function renderHome(_appState = state, dependencies = null) {
  if (dependencies) homeRuntimeDependencies = dependencies;
  const today = todayStr();
  state.dailyCards = countCompletedReviewsForDate(state, today);
  state.history[today] = state.dailyCards;
  refreshStreakDisplay();
  if (state.studyPlan) state.studyPlan = StudyPlan.normalizePlan(state.studyPlan);

  const activeChapterId = ensureActiveChapterId(state, CONTENT_INDEX);
  const chapterCatalogEntry =
    CONTENT_INDEX.find((chapter) => chapter.id === activeChapterId) || null;
  const loadedActiveChapter = getLesson(activeChapterId);
  const activeChapter = loadedActiveChapter || chapterCatalogEntry;
  if (activeChapterId && !loadedActiveChapter) {
    ensureLesson(activeChapterId)
      .then(() => renderHome(state, homeRuntimeDependencies))
      .catch((error) => console.warn('[Home] Не удалось загрузить активную главу:', error));
  }
  let dailyPlan = loadedActiveChapter
    ? getOrGenerateDailyPlan(state, {
        dateKey: today,
        activeChapterId,
        chapterMeta: loadedActiveChapter,
      })
    : null;
  let batchCreated = false;
  const plannedVocabulary = dailyPlan?.tasks.find(
    (task) => task.type === 'vocabulary' && task.batchDateKey === today
  );
  if (
    activeChapterId &&
    activeChapter?.words &&
    plannedVocabulary &&
    !state.vocabularyUnlocks?.[activeChapterId]?.[today]
  ) {
    const batchRes = ensureTodayVocabularyBatch(state, activeChapterId, {
      plan: state.studyPlan,
      dateKey: today,
      words: activeChapter.words,
      limit: plannedVocabulary.count,
    });
    batchCreated = batchRes.created === true;
    if (batchCreated) save();
  }

  if (dailyPlan?._stateChanged) {
    save();
  }

  if (batchCreated) {
    dailyPlan = getOrGenerateDailyPlan(state, {
      dateKey: today,
      activeChapterId,
      chapterMeta: activeChapter,
      forceRefresh: true,
    });
    if (dailyPlan?._stateChanged) save();
  }
  const nextAction = getNextStudyAction(dailyPlan);

  const continueButton = $('#btn-continue-learning');
  const continueTitle = $('#continue-learning-title');
  const continueContext = $('#continue-learning-context');

  if (continueTitle) {
    continueTitle.textContent = nextAction?.title || 'Все задачи на сегодня выполнены';
  }
  if (continueContext) {
    continueContext.textContent =
      nextAction?.description || 'Можно перейти к дополнительной практике';
  }
  if (continueButton) {
    continueButton.onclick = () =>
      executeHomeDailyTask(nextAction, activeChapterId, homeRuntimeDependencies);
  }

  const todayContainer = $('#home-plan-today');
  if (todayContainer) {
    todayContainer.innerHTML = renderHomeTodayCard(state, dailyPlan);

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
        const task = dailyPlan?.tasks.find((entry) => entry.id === row.dataset.taskId);
        executeHomeDailyTask(task, activeChapterId, homeRuntimeDependencies);
      });
    });

    // Also bind explicit button clicks inside the rows
    todayContainer.querySelectorAll('.today-action-button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const task = dailyPlan?.tasks.find((entry) => entry.id === btn.dataset.taskId);
        executeHomeDailyTask(task, activeChapterId, homeRuntimeDependencies);
      });
    });
  }

  const courseButton = $('#home-course-link');
  if (courseButton) courseButton.onclick = () => window.nav('course');
  updateSrsBadge();
  syncAvatars();
}

function executeHomeDailyTask(task, activeChapterId, dependencies) {
  if (!task) return;
  if (task.type === 'start-chapter') {
    const chId = task.action?.chapterId || activeChapterId;
    startChapter(chId, window.toast);
    window.nav('chapter', chId);
    return;
  }
  if (task.type === 'review') {
    window.nav('srs');
    return;
  }
  if (task.type === 'vocabulary') {
    startVocabularyBatchSession({
      state,
      chapterId: task.action?.chapterId || activeChapterId,
      dateKey: task.batchDateKey || task.action?.batchDateKey,
      startSession: dependencies.startChapterFlashcards,
      toast: window.toast,
    });
    return;
  }
  if (['grammar', 'practice', 'assessment'].includes(task.type)) {
    window.nav('chapter', task.action?.chapterId || activeChapterId);
    return;
  }
  window.nav('srs');
}

export function renderHomeTodayCard(appState, dailyPlan) {
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

  if (!dailyPlan) {
    return '<div class="today-plan-empty"><p>Задачи дня загружаются…</p></div>';
  }

  const taskTypeLabel = {
    review: 'ОБЯЗАТЕЛЬНО · FSRS',
    vocabulary: 'ОБЯЗАТЕЛЬНО · НОВЫЕ СЛОВА',
    grammar: 'ГРАММАТИКА',
    practice: 'ПРАКТИКА',
    assessment: 'ПРОВЕРКА',
    bonus: 'ДОПОЛНИТЕЛЬНО',
  };
  const taskIcon = {
    review: '↻',
    vocabulary: '語',
    grammar: '文',
    practice: '練',
    assessment: '✓',
    bonus: '✨',
  };
  const tasksHtml =
    dailyPlan.tasks.length === 0
      ? '<div class="today-completed-state"><span class="completed-icon">🎉</span><p>Все обязательные задачи на сегодня выполнены.</p></div>'
      : dailyPlan.tasks
          .map((task) => {
            const completed = task.status === 'completed';
            const action =
              task.type === 'review'
                ? 'review'
                : task.type === 'vocabulary'
                  ? 'vocab-session'
                  : task.type === 'bonus'
                    ? 'bonus'
                    : 'chapter';
            const dateAttr = task.batchDateKey ? ` data-date-key="${task.batchDateKey}"` : '';
            return `
              <div class="today-action required ${completed ? '' : 'clickable'}"
                   data-task-id="${task.id}" data-action="${action}"${dateAttr}>
                <div class="today-action-icon">${taskIcon[task.type] || '•'}</div>
                <div class="today-action-copy">
                  <span class="today-action-kind">${taskTypeLabel[task.type] || task.type}</span>
                  <strong>${task.title}</strong>
                  <small>${task.description || ''} · ~${task.estimatedMinutes} мин</small>
                </div>
                <div class="today-action-cta">
                  ${
                    completed
                      ? '<span class="task-status-completed">✓ Выполнено</span>'
                      : `<button class="today-action-button" data-task-id="${task.id}" data-action="${action}"${dateAttr}>Продолжить</button>`
                  }
                </div>
              </div>`;
          })
          .join('');

  const warningHtml = dailyPlan.warnings?.length
    ? `<div class="warning-banner card-warning">${dailyPlan.warnings.join(' ')}</div>`
    : '';

  return `
    <div class="today-card-header">
      <div>
        <span class="today-eyebrow">ПЛАН НА СЕГОДНЯ</span>
        <h2>${dailyPlan.isRestDay ? 'День отдыха' : 'Конкретные шаги'}</h2>
        <small>${dailyPlan.estimatedMinutes} из ${dailyPlan.capacityMinutes} мин</small>
      </div>
      <button class="text-button" data-action="open-plan">Весь план</button>
    </div>
    ${warningHtml}
    ${tasksHtml}
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

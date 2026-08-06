/* ui/home.js — Home screen */
import { state, save, chState, loadedChapters } from '../state/store.js';
import { setSafeHTML } from '../src/security-helpers.js';
import { refreshStreakDisplay, syncAvatars, updateSrsBadge } from './shared.js';
import { $, todayStr } from '../src/utils.js';
import { allCards, cardChapter } from '../src/srs-helpers.js';
import { StudyPlan } from '../studyplan.js';
import { loadContentIndex, loadChapterData, loadCourseOrthography } from '../src/content-loader.js';
import { normalizeWord } from '../src/normalize-word.js';
import { configureCourseOrthography } from '../src/course-orthography.js';
import {
  canonicalLessonId,
  compareLessonIds,
  ensureActiveCourse,
  formatLessonLabel,
  getActiveCourse,
  lessonOrdinal,
  sameLessonId,
} from '../src/courses/course-context.js';
import { normalizeChapterContent } from '../src/chapter-content.js';
import {
  clearSupplementalPracticeCache,
  loadSupplementalPracticeData,
  SUPPLEMENTAL_PRACTICE_SCHEMA_VERSION,
} from '../src/supplemental-practice.js';
import { resolveStoryTokens } from '../src/ai/story-token-resolver.js';
import { clearGrammarQuizCache } from '../src/grammar-quiz-content.js';
import { switchActiveCourse, syncActiveCourseProgress } from '../src/courses/course-state.js';
import { DEFAULT_COURSE_ID } from '../src/courses/course-registry.js';
import { db, STORES } from '../src/db.js';
import { ExamplesDB } from '../src/examples-db.js';
import { dictionaryRelationsIndex } from '../src/dictionary/dictionary-relations-index.js';
import { storyOccurrenceIndex } from '../src/dictionary/story-occurrence-index.js';
import { dictionaryStore } from '../src/dictionary/dictionary-store.js';
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
import { calculateSevenDayForecast } from '../src/forecast-service.js';
import { evaluatePlanRiskAndAdaptation } from '../src/plan-risk-adaptation.js';

export function buildHomeViewModel({
  state: appState = state,
  plan = appState?.studyPlan,
  activeSession = null,
  storageStatus = { degraded: false },
  forecast = null,
  now = Date.now(),
} = {}) {
  const isFirstRun = !appState?.onboarding?.completed;
  const isPlanRequired = !plan;
  const isStorageRecovery = storageStatus.degraded === true;
  const hasActiveSession = Boolean(
    activeSession &&
    Array.isArray(activeSession.managerState?.queue) &&
    activeSession.managerState.queue.some((i) => !i.completed)
  );

  const forecastData = forecast || calculateSevenDayForecast({ state: appState, plan, now });
  const riskEval = evaluatePlanRiskAndAdaptation({ state: appState, forecast: forecastData, now });

  let stateName = 'TODAY_IN_PROGRESS';
  if (isStorageRecovery) stateName = 'STORAGE_RECOVERY_REQUIRED';
  else if (isFirstRun) stateName = 'FIRST_RUN';
  else if (isPlanRequired) stateName = 'PLAN_REQUIRED';
  else if (hasActiveSession) stateName = 'SESSION_INTERRUPTED';
  else if (riskEval.isRecoveryMode) stateName = 'PLAN_RECOVERY';
  else if (forecastData.days?.[0]?.dueReviews === 0 && !forecastData.days?.[0]?.expectedNewCards)
    stateName = 'NO_DUE_TASKS';

  return {
    stateName,
    isFirstRun,
    isPlanRequired,
    hasActiveSession,
    isStorageRecovery,
    forecast: forecastData,
    risk: riskEval.risk,
    decisionExplanation: riskEval.decisionExplanation,
    warningBanner: riskEval.warningBanner,
    activeSession,
  };
}

export function getPrimaryHomeAction(viewModel, dailyPlan = null) {
  if (viewModel.isStorageRecovery) {
    return { type: 'storage-recovery', title: 'Восстановить хранилище', targetScreen: 'recovery' };
  }
  if (viewModel.hasActiveSession) {
    return { type: 'resume-session', title: 'Продолжить сессию', targetScreen: 'srs' };
  }
  if (viewModel.isFirstRun) {
    return { type: 'start-onboarding', title: 'Начать обучение', targetScreen: 'onboarding' };
  }
  if (viewModel.isPlanRequired) {
    return { type: 'create-plan', title: 'Составить план', targetScreen: 'plan' };
  }

  const nextTask = getNextStudyAction(dailyPlan);
  if (nextTask) {
    return {
      type: nextTask.type,
      title: 'Продолжить обучение',
      task: nextTask,
    };
  }

  return { type: 'completed', title: 'Все задачи на сегодня выполнены', targetScreen: 'practice' };
}

// ---------- Constants ----------
export let CH_NAMES = {};

export const CHECK_ITEMS = REQUIRED_CHAPTER_SECTIONS.map(({ id, label }) => [id, label]);

// Полные уроки, загруженные лениво (по мере обращения к главам)
export let LESSONS = [];

// Лёгкий индекс глав (метаданные без полного контента)
export let CONTENT_INDEX = [];

const NORMALIZED_WORD_SCHEMA_VERSION = 5;

let courseSwitchGeneration = 0;

// ---------- Switch Course Runtime ----------
export async function switchCourseRuntime(nextCourseId, options = {}) {
  if (!nextCourseId) throw new Error('[CourseRuntime] nextCourseId is required');

  const { reload = false } = typeof options === 'boolean' ? { reload: options } : options;

  if (!reload && state?.activeCourseId === nextCourseId && getActiveCourse()?.id === nextCourseId) {
    return getActiveCourse();
  }

  const generation = ++courseSwitchGeneration;

  const course = await ensureActiveCourse(nextCourseId, options);

  if (generation !== courseSwitchGeneration) {
    return null;
  }

  if (state?.activeCourseId) {
    syncActiveCourseProgress(state);
  }

  if (generation !== courseSwitchGeneration) {
    return null;
  }

  loadedChapters.clear();
  LESSONS = [];
  CONTENT_INDEX = [];
  ExamplesDB.clearCourseScope();
  dictionaryRelationsIndex.invalidate();
  storyOccurrenceIndex.invalidate();
  clearGrammarQuizCache();
  clearSupplementalPracticeCache();
  course.clearCache();

  switchActiveCourse(state, course.id);

  await loadLessons({ course, generation });

  if (generation !== courseSwitchGeneration) {
    return null;
  }

  return course;
}

// ---------- Load Lessons ----------
// На старте грузим только лёгкий content-index; полные уроки подгружаются
// по требованию через ensureLesson()
export async function loadLessons(options = {}) {
  const generation = options.generation ?? courseSwitchGeneration;
  const activeCourse =
    options.course ??
    getActiveCourse() ??
    (await ensureActiveCourse(state?.activeCourseId || DEFAULT_COURSE_ID));

  const courseId = activeCourse.id;

  const isCurrentLoad = () =>
    generation === courseSwitchGeneration &&
    getActiveCourse()?.id === courseId &&
    (!state?.activeCourseId || state.activeCourseId === courseId);

  if (!isCurrentLoad()) return;

  const keyLessons = `course:${courseId}:lessons`;
  const keyIndex = `course:${courseId}:content-index`;
  const keyLessonVersion = `course:${courseId}:lesson-version`;
  const keySchemaVersion = `course:${courseId}:schema-version`;
  const keyWorkbookSchemaVersion = `course:${courseId}:workbook-schema-version`;

  // --- Phase 1: Prepare local data (reads only, no global side-effects) ---
  const pendingCacheWrites = [];

  let fileVersion = 0;
  let indexData = null;
  try {
    indexData = await loadContentIndex(courseId);
    fileVersion = indexData?.version || 0;
  } catch (e) {
    console.error('Не удалось загрузить content-index.json:', e);
  }

  let nextOrthography = null;
  try {
    nextOrthography = await loadCourseOrthography(courseId);
  } catch (e) {
    console.error('Не удалось загрузить таблицу доступности кандзи:', e);
  }

  let workbookSchemaVersion = 0;
  try {
    const workbook = await loadSupplementalPracticeData();
    workbookSchemaVersion = workbook?.schemaVersion || 0;
  } catch (e) {
    console.warn('Не удалось загрузить Workbook metadata:', e);
  }

  let cachedVersion = await db.get(STORES.CONTENT_CACHE, keyLessonVersion);
  if (!cachedVersion && courseId === DEFAULT_COURSE_ID) {
    cachedVersion = await db.get(STORES.CONTENT_CACHE, 'lesson_version');
    if (cachedVersion != null) {
      pendingCacheWrites.push([STORES.CONTENT_CACHE, keyLessonVersion, String(cachedVersion)]);
    }
  }

  let cachedSchemaVersion = await db.get(STORES.CONTENT_CACHE, keySchemaVersion);
  if (cachedSchemaVersion == null && courseId === DEFAULT_COURSE_ID) {
    cachedSchemaVersion = await db.get(STORES.CONTENT_CACHE, 'schema_version');
    if (cachedSchemaVersion != null) {
      pendingCacheWrites.push([
        STORES.CONTENT_CACHE,
        keySchemaVersion,
        Number(cachedSchemaVersion),
      ]);
    }
  }
  cachedSchemaVersion = cachedSchemaVersion || 0;

  let cachedWorkbookSchemaVersion = await db.get(STORES.CONTENT_CACHE, keyWorkbookSchemaVersion);
  if (cachedWorkbookSchemaVersion == null && courseId === DEFAULT_COURSE_ID) {
    cachedWorkbookSchemaVersion = await db.get(STORES.CONTENT_CACHE, 'workbook_schema_version');
    if (cachedWorkbookSchemaVersion != null) {
      pendingCacheWrites.push([
        STORES.CONTENT_CACHE,
        keyWorkbookSchemaVersion,
        Number(cachedWorkbookSchemaVersion),
      ]);
    }
  }
  cachedWorkbookSchemaVersion = cachedWorkbookSchemaVersion || 0;

  const contentVersionMatches = String(cachedVersion) === String(fileVersion);
  const schemaVersionMatches = cachedSchemaVersion === NORMALIZED_WORD_SCHEMA_VERSION;
  const workbookVersionMatches =
    workbookSchemaVersion === 0 ||
    (cachedWorkbookSchemaVersion === SUPPLEMENTAL_PRACTICE_SCHEMA_VERSION &&
      cachedWorkbookSchemaVersion === workbookSchemaVersion);

  let raw = await db.get(STORES.CONTENT_CACHE, keyLessons);
  if (!raw && courseId === DEFAULT_COURSE_ID) {
    const legacyRaw = await db.get(STORES.CONTENT_CACHE, 'lessons');
    if (legacyRaw) {
      raw = legacyRaw;
      try {
        const parsedLegacy = Array.isArray(legacyRaw) ? legacyRaw : JSON.parse(legacyRaw);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          pendingCacheWrites.push([STORES.CONTENT_CACHE, keyLessons, parsedLegacy]);
        }
      } catch {
        /* ignore legacy parse error */
      }
    }
  }

  let cachedLessons = [];
  if (raw) {
    try {
      cachedLessons = Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch {
      cachedLessons = [];
    }
  }

  let nextContentIndex;
  if (indexData) {
    nextContentIndex = indexData.chapters || [];
  } else {
    let cachedIndex = await db.get(STORES.CONTENT_CACHE, keyIndex);
    if (!cachedIndex && courseId === DEFAULT_COURSE_ID) {
      cachedIndex = await db.get(STORES.CONTENT_CACHE, 'content_index');
      if (cachedIndex) {
        pendingCacheWrites.push([STORES.CONTENT_CACHE, keyIndex, cachedIndex]);
      }
    }
    nextContentIndex = cachedIndex?.chapters || [];
  }

  const nextChapterNames = Object.fromEntries(
    nextContentIndex.map((chapter) => [chapter.id, [chapter.title, chapter.jp || '']])
  );

  let nextLessons;

  if (
    cachedLessons.length > 0 &&
    (!contentVersionMatches || !schemaVersionMatches || !workbookVersionMatches)
  ) {
    // Migration: reconstruct safely from actual lesson JSON
    const migratedLessons = [];
    for (const oldLesson of cachedLessons) {
      try {
        const { lesson } = await loadChapterData(oldLesson.id, courseId);
        migratedLessons.push(normalizeLesson(lesson, nextChapterNames));
      } catch {
        migratedLessons.push(oldLesson);
      }
    }
    nextLessons = migratedLessons;
    pendingCacheWrites.push([STORES.CONTENT_CACHE, keyLessons, nextLessons]);
    pendingCacheWrites.push([STORES.CONTENT_CACHE, keyLessonVersion, String(fileVersion)]);
    pendingCacheWrites.push([
      STORES.CONTENT_CACHE,
      keySchemaVersion,
      NORMALIZED_WORD_SCHEMA_VERSION,
    ]);
    if (workbookSchemaVersion > 0) {
      pendingCacheWrites.push([
        STORES.CONTENT_CACHE,
        keyWorkbookSchemaVersion,
        workbookSchemaVersion,
      ]);
    }

    if (courseId === DEFAULT_COURSE_ID) {
      pendingCacheWrites.push([STORES.CONTENT_CACHE, 'lessons', nextLessons]);
      pendingCacheWrites.push([STORES.CONTENT_CACHE, 'lesson_version', String(fileVersion)]);
      pendingCacheWrites.push([
        STORES.CONTENT_CACHE,
        'schema_version',
        NORMALIZED_WORD_SCHEMA_VERSION,
      ]);
      if (workbookSchemaVersion > 0) {
        pendingCacheWrites.push([
          STORES.CONTENT_CACHE,
          'workbook_schema_version',
          workbookSchemaVersion,
        ]);
      }
    }
  } else {
    nextLessons = cachedLessons;
    if (cachedLessons.length === 0) {
      try {
        const entryLessonId = indexData?.chapters?.[0]?.id || activeCourse.manifest.entryLessonId;
        const { lesson } = await loadChapterData(entryLessonId, courseId);
        if (lesson) {
          nextLessons = [normalizeLesson(lesson, nextChapterNames)];
          pendingCacheWrites.push([STORES.CONTENT_CACHE, keyLessons, nextLessons]);
        }
      } catch {
        /* ignore lesson pre-cache error */
      }
      if (indexData) {
        pendingCacheWrites.push([STORES.CONTENT_CACHE, keyLessonVersion, String(fileVersion)]);
        pendingCacheWrites.push([
          STORES.CONTENT_CACHE,
          keySchemaVersion,
          NORMALIZED_WORD_SCHEMA_VERSION,
        ]);
        if (workbookSchemaVersion > 0) {
          pendingCacheWrites.push([
            STORES.CONTENT_CACHE,
            keyWorkbookSchemaVersion,
            workbookSchemaVersion,
          ]);
        }
      }
    }
  }

  if (indexData) {
    pendingCacheWrites.push([STORES.CONTENT_CACHE, keyIndex, indexData]);
  } else {
    let cachedIndex = await db.get(STORES.CONTENT_CACHE, keyIndex);
    if (!cachedIndex && courseId === DEFAULT_COURSE_ID) {
      cachedIndex = await db.get(STORES.CONTENT_CACHE, 'content_index');
      if (cachedIndex) {
        pendingCacheWrites.push([STORES.CONTENT_CACHE, keyIndex, cachedIndex]);
      }
    }
  }

  // --- Phase 2: Atomic Commit ---
  if (!isCurrentLoad()) return;

  if (nextOrthography) {
    try {
      configureCourseOrthography(nextOrthography, activeCourse);
    } catch (e) {
      console.error('Не удалось применить конфигурацию кандзи:', e);
    }
  }

  LESSONS = nextLessons;
  CONTENT_INDEX = nextContentIndex;
  CH_NAMES = nextChapterNames;

  if (state?.courses?.[state?.activeCourseId]) {
    state.courses[state.activeCourseId].lessonIds = CONTENT_INDEX.map((chapter) => chapter.id);
  }

  if (LESSONS.length > 0) {
    reconcileLessonIds();
    LESSONS.forEach((l) => {
      loadedChapters.set(l.id, { lesson: l, story: undefined });
      ExamplesDB.registerLesson(l);
    });
    ExamplesDB.rebuildIndex();
    dictionaryRelationsIndex.buildExampleIndex(ExamplesDB, dictionaryStore);
  }

  for (const [store, key, val] of pendingCacheWrites) {
    if (!isCurrentLoad()) return;
    try {
      await db.set(store, key, val);
    } catch (e) {
      console.warn('[loadLessons] Cache write error:', e);
    }
  }

  if (!isCurrentLoad()) return;

  if (LESSONS.length > 0) {
    let reconciled = false;
    for (const lesson of LESSONS) {
      if (!shouldChapterHaveVocabularyCards(state, lesson.id)) continue;
      const res = ensureChapterVocabularyCardsImpl(state, lesson);
      if (res.changed) reconciled = true;
    }
    if (reconciled) {
      if (!isCurrentLoad()) return;
      await save(true);
    }
  }

  if (!isCurrentLoad()) return;

  // Runtime backfill reconciliation for prior knowledge chapters
  if (Array.isArray(state?.priorKnowledgeChapterIds) && state.priorKnowledgeChapterIds.length > 0) {
    try {
      const pkResult = await reconcilePriorKnowledgeVocabulary(state, ensureLesson);
      if (!isCurrentLoad()) return;
      if (pkResult.addedCards > 0) await save(true);
    } catch (e) {
      console.warn('[loadLessons] Prior knowledge backfill reconciliation error:', e);
    }
  }

  if (!isCurrentLoad() || !state) return;

  const previousActiveChapterId = state.activeChapterId;
  ensureActiveChapterId(state, CONTENT_INDEX);
  if (previousActiveChapterId !== state.activeChapterId) {
    if (!isCurrentLoad()) return;
    await save(true);
  }

  if (!isCurrentLoad()) return;

  try {
    const res = await fetch('data/particles-dictionary.json');
    if (!isCurrentLoad()) return;
    if (res.ok) {
      const data = await res.json();
      if (!isCurrentLoad()) return;
      ExamplesDB.registerParticlesDictionary(data);
      ExamplesDB.rebuildIndex();
      dictionaryRelationsIndex.buildExampleIndex(ExamplesDB, dictionaryStore);
    }
  } catch (e) {
    console.warn('Не удалось загрузить словарь частиц для ExamplesDB:', e);
  }

  if (!isCurrentLoad()) return;

  // Загрузка curated примеров слов
  try {
    const res = await fetch('data/curated-word-examples.json');
    if (!isCurrentLoad()) return;
    if (res.ok) {
      const data = await res.json();
      if (!isCurrentLoad()) return;
      ExamplesDB.registerCuratedWordExamples(data);
      ExamplesDB.rebuildIndex();
      dictionaryRelationsIndex.buildExampleIndex(ExamplesDB, dictionaryStore);
    }
  } catch (e) {
    console.warn('Не удалось загрузить curated примеры для ExamplesDB:', e);
  }

  if (!isCurrentLoad()) return;

  // Координатор дневных порций слов после загрузки уроков
  if (state && state.initialized && state.activeChapterId) {
    const batchRes = ensureTodayVocabularyBatch(state, state.activeChapterId, {
      plan: state.studyPlan,
    });
    if (!isCurrentLoad()) return;
    if (batchRes.created) await save(true);
  }

  if (!isCurrentLoad()) return;

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
        set.add(canonicalLessonId(l.id));
        if (Array.isArray(w.lessonIds)) {
          w.lessonIds.forEach((id) => set.add(canonicalLessonId(id)));
        }
      }
    }
  }
  // Теперь обновим lessonIds во всех словах
  for (const l of LESSONS) {
    for (const w of l.words || []) {
      if (w.lexemeId) {
        w.lessonIds = Array.from(lexemeToLessons.get(w.lexemeId)).sort(compareLessonIds);
      }
    }
  }
}

// Нормализация сырого урока, полученного через CourseLoader.
function normalizeLesson(lesson, chapterNames = CH_NAMES) {
  return normalizeChapterContent(lesson, lesson.practice || [], {
    chapterNames: chapterNames || CH_NAMES,
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
  id = canonicalLessonId(id);
  if (!id) throw new Error('[Home] lesson ID is required');
  let entry = loadedChapters.get(id);
  if (entry && entry.story !== undefined) return entry;

  const { lesson, story } = await loadChapterData(id);
  const normalized = entry ? entry.lesson : normalizeLesson(lesson);

  // Register in ExamplesDB
  ExamplesDB.registerLesson(normalized);
  if (story) {
    let storyToRegister = story;
    if (story.content && Array.isArray(story.content)) {
      try {
        const sourceCourseId = story.courseId || getActiveCourse()?.id || 'genki-1';
        const rawId = story.id || story.storyId || 'story';
        const isAi = story.source === 'ai' || String(rawId).startsWith('ai-story');
        const storyId =
          isAi || String(rawId).includes(':') ? String(rawId) : `${sourceCourseId}:story:${rawId}`;

        const res = await resolveStoryTokens({
          story: story.content,
          dictionaryStore,
          activeCourseId: sourceCourseId,
          storyId,
        });
        if (res && res.story) {
          storyToRegister = { ...story, content: res.story, courseId: sourceCourseId };
        }
      } catch (err) {
        console.warn(
          '[Home] Failed to resolve story tokens before registering in ExamplesDB:',
          err
        );
      }
    }
    ExamplesDB.registerStory(storyToRegister);
  }
  ExamplesDB.rebuildIndex();
  dictionaryRelationsIndex.buildExampleIndex(ExamplesDB, dictionaryStore);
  dictionaryRelationsIndex.invalidateLessons();

  if (!LESSONS.some((l) => l.id === id)) {
    LESSONS.push(normalized);
    LESSONS.sort((a, b) => compareLessonIds(a.id, b.id));
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
  const targetId = canonicalLessonId(id);
  return LESSONS.find((lesson) => canonicalLessonId(lesson.id) === targetId);
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
  id = canonicalLessonId(id);
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
  if (!state.activeChapterId) state.activeChapterId = id;
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
  const hour = new Date().getHours();
  const greeting =
    hour < 6
      ? 'Доброй ночи'
      : hour < 12
        ? 'Доброе утро'
        : hour < 18
          ? 'Добрый день'
          : 'Добрый вечер';
  const greetingTitle = document.getElementById('home-greeting-title');
  if (greetingTitle) greetingTitle.textContent = greeting;
  const today = todayStr();
  state.dailyCards = countCompletedReviewsForDate(state, today);
  state.history[today] = state.dailyCards;
  refreshStreakDisplay();
  if (state.studyPlan) state.studyPlan = StudyPlan.normalizePlan(state.studyPlan);

  const activeChapterId = ensureActiveChapterId(state, CONTENT_INDEX);
  const chapterCatalogEntry =
    CONTENT_INDEX.find((chapter) => sameLessonId(chapter.id, activeChapterId)) || null;
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
  const continueActionLabel = $('#continue-action-label');
  const actionCount = $('#home-action-count');
  const actionDuration = $('#home-action-duration');
  const actionSource = $('#home-action-source');
  const reasonCopy = $('#home-reason-copy');

  if (continueTitle) {
    continueTitle.textContent = nextAction?.title || 'Все задачи на сегодня выполнены';
  }
  if (continueContext) {
    continueContext.textContent =
      nextAction?.description || 'Можно перейти к дополнительной практике';
  }
  const actionLabels = {
    'start-chapter': 'Начать главу',
    review: 'Начать повторение',
    vocabulary: 'Учить слова',
    grammar: 'Открыть грамматику',
    practice: 'Начать практику',
    assessment: 'Начать проверку',
  };
  const sourceLabels = {
    review: 'FSRS · вовремя',
    vocabulary: 'План · новые слова',
    grammar: 'План · грамматика',
    practice: 'План · практика',
    'start-chapter': 'План · текущая глава',
  };
  if (continueActionLabel) {
    continueActionLabel.textContent = actionLabels[nextAction?.type] || 'Начать';
  }
  if (actionCount) {
    const count = Number(nextAction?.count || nextAction?.cardCount || 0);
    actionCount.textContent = count > 0 ? `${count} элементов` : 'Следующий шаг';
  }
  if (actionDuration) {
    actionDuration.textContent = `≈ ${Math.max(1, Number(nextAction?.estimatedMinutes) || 5)} минут`;
  }
  if (actionSource) {
    actionSource.textContent = sourceLabels[nextAction?.type] || 'План · сегодня';
  }
  if (reasonCopy) {
    reasonCopy.textContent = nextAction?.description
      ? `${nextAction.description} Задача уже учтена в сегодняшней нагрузке.`
      : 'Все обязательные задачи выполнены; можно выбрать короткую дополнительную практику.';
  }
  if (continueButton) {
    continueButton.onclick = () =>
      executeHomeDailyTask(nextAction, activeChapterId, homeRuntimeDependencies);
  }

  const todayContainer = $('#home-plan-today');
  if (todayContainer) {
    setSafeHTML(todayContainer, renderHomeTodayCard(state, dailyPlan));

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

  const chapterProgress = activeChapter
    ? getChapterProgress(state, activeChapterId, activeChapter)
    : { ratio: 0 };
  const chapterNumber = Math.max(1, lessonOrdinal(activeChapterId) + 1);
  const progressPercent = Math.round((chapterProgress.ratio || 0) * 100);
  const courseTitle = getActiveCourse()?.manifest?.title || 'GENKI I';
  const progressLabel = $('#home-course-progress-label');
  const progressPercentLabel = $('#home-course-progress-percent');
  const progressBar = $('#home-course-progress-bar');
  const planDeadline = $('#home-plan-deadline');
  const planReserve = $('#home-plan-reserve');
  const planPaceTitle = $('#home-plan-pace-title');
  if (progressLabel) progressLabel.textContent = `${courseTitle} · глава ${chapterNumber}`;
  if (progressPercentLabel) progressPercentLabel.textContent = `${progressPercent}%`;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;
  if (planPaceTitle) {
    planPaceTitle.textContent = state.studyPlan?.paused ? 'План на паузе' : 'Вы идёте в темпе';
  }
  if (planReserve) {
    planReserve.textContent = `${state.studyPlan?.completedChapters?.length || 0} из ${CONTENT_INDEX.length || 12} глав`;
  }
  if (planDeadline) {
    const deadline = state.studyPlan?.deadline;
    if (deadline) {
      const deadlineDate = parseDateKey(deadline);
      const formattedDeadline = deadlineDate
        ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(deadlineDate)
        : deadline;
      planDeadline.textContent = `При текущем темпе ожидаемая дата завершения — ${formattedDeadline}.`;
    } else {
      planDeadline.textContent = 'Создайте План, чтобы увидеть ожидаемую дату завершения.';
    }
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

export function renderHomeTodayCard(appState, dailyPlan, viewModel = null) {
  if (!appState.studyPlan) {
    return `
      <div class="today-plan-empty">
        <div>
          <span class="today-eyebrow">ПЛАН НА СЕГОДНЯ</span>
          <h2>Составить план обучения</h2>
          <p>Выберите учебные дни и темп — приложение рассчитает ежедневную нагрузку.</p>
        </div>
        <button class="btn-primary compact" data-action="create-plan">Составить план</button>
      </div>`;
  }

  if (!dailyPlan) {
    return '<div class="today-plan-empty"><p>Задачи дня загружаются…</p></div>';
  }

  const vm = viewModel || buildHomeViewModel({ state: appState, plan: appState.studyPlan });
  const forecast = vm.forecast;

  // Interrupted Session Banner
  let interruptedSessionHtml = '';
  if (vm.hasActiveSession && vm.activeSession) {
    const queue = vm.activeSession.managerState?.queue || [];
    const remaining = queue.filter((i) => !i.completed).length;
    const estMin = Math.max(1, Math.ceil(remaining * 0.5));
    interruptedSessionHtml = `
      <div class="interrupted-session-banner" style="
        background: linear-gradient(135deg, rgba(255, 122, 26, 0.15), rgba(255, 122, 26, 0.05));
        border: 1px solid var(--primary, #FF7A1A);
        border-radius: 16px;
        padding: 16px 20px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      ">
        <div>
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; color: var(--primary, #FF7A1A);">Прерванная сессия</span>
          <h3 style="font-size: 16px; font-weight: 700; margin: 4px 0;">Продолжить незавершённое обучение</h3>
          <p style="font-size: 13px; color: var(--ink-secondary, #A0A0B8); margin: 0;">Осталось: ${remaining} карточек (~${estMin} мин)</p>
        </div>
        <button class="btn-primary compact" data-action="resume-active-session">Продолжить</button>
      </div>`;
  }

  // 7-day forecast strip
  let forecastHtml = '';
  if (forecast && Array.isArray(forecast.days)) {
    const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const forecastCols = forecast.days
      .map((d) => {
        const dayName = dayLabels[d.dayOfWeek] || '';
        return `
        <div style="text-align: center; flex: 1; padding: 6px; background: rgba(255,255,255,0.03); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--ink-tertiary, #707088);">${dayName}</div>
          <div style="font-size: 13px; font-weight: 700; color: var(--primary, #FF7A1A); margin-top: 2px;">${d.expectedMinutes}м</div>
        </div>`;
      })
      .join('');

    forecastHtml = `
      <div class="forecast-7day-strip" style="margin: 16px 0; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 12px; font-weight: 600; color: var(--ink-secondary, #A0A0B8);">Прогноз нагрузки на 7 дней</span>
          <span style="font-size: 11px; color: var(--ink-tertiary, #707088);">Среднее: ~${forecast.averageMinutes} мин/день</span>
        </div>
        <div style="display: flex; gap: 6px;">
          ${forecastCols}
        </div>
      </div>`;
  }

  const taskTypeLabel = {
    'start-chapter': 'ТЕКУЩАЯ ГЛАВА',
    review: 'ОБЯЗАТЕЛЬНО · FSRS',
    vocabulary: 'ОБЯЗАТЕЛЬНО · НОВЫЕ СЛОВА',
    grammar: 'ПО ПЛАНУ · ГРАММАТИКА',
    practice: 'ПО ПЛАНУ · ПРАКТИКА',
    assessment: 'ПО ПЛАНУ · ПРОИЗВОДИТЕЛЬНОСТЬ',
    bonus: 'ДОПОЛНИТЕЛЬНО · ПРАКТИКА',
  };
  const taskIcon = {
    'start-chapter': '始',
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

  const warningHtml = vm.warningBanner
    ? `<div class="warning-banner card-warning" style="margin-bottom: 12px; padding: 12px; background: rgba(255, 122, 26, 0.12); border-left: 4px solid #FF7A1A; border-radius: 8px;">
        <strong>${vm.warningBanner.title}</strong>: ${vm.warningBanner.message}
       </div>`
    : dailyPlan.warnings?.length
      ? `<div class="warning-banner card-warning">${dailyPlan.warnings.join(' ')}</div>`
      : '';

  const completedTasks = dailyPlan.tasks.filter((task) => task.status === 'completed');
  const completedMinutes = completedTasks.reduce(
    (total, task) => total + (Number(task.estimatedMinutes) || 0),
    0
  );
  const displayMinutes = Math.max(0, Number(dailyPlan.estimatedMinutes) || completedMinutes);
  const capacityMinutes = Math.max(1, Number(dailyPlan.capacityMinutes) || 1);
  const progressPercent = Math.min(100, Math.round((displayMinutes / capacityMinutes) * 100));
  const progressCaption =
    completedTasks.length === 0
      ? 'Первый шаг уже выбран'
      : `Готово задач: ${completedTasks.length}`;

  return `
    ${interruptedSessionHtml}
    <div class="today-card-header">
      <div>
        <span class="today-eyebrow">СЕГОДНЯ</span>
        <h2>${dailyPlan.isRestDay ? 'День отдыха' : `${displayMinutes} из ${dailyPlan.capacityMinutes} минут`}</h2>
        <p>${progressCaption}</p>
      </div>
      <div class="today-progress-ring" style="--progress:${progressPercent}%"><span>${progressPercent}%</span></div>
    </div>
    ${warningHtml}
    ${tasksHtml}
    ${forecastHtml}
  `;
}

export function renderCourse() {
  const list = $('#course-list');
  if (!list) return;
  ensureActiveChapterId(state, CONTENT_INDEX);
  list.replaceChildren();
  CONTENT_INDEX.forEach((chapter) => {
    const displayNumber = lessonOrdinal(chapter.id) + 1;
    const chapterState = chState(chapter.id);
    const progress = getChapterProgress(state, chapter.id, chapter);
    const available = isChapterAvailable(state, CONTENT_INDEX, chapter.id);
    const completed = isChapterCompleted(chapterState, chapter);
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `chapter-card course-chapter ${completed ? 'completed' : ''} ${available ? '' : 'locked'}`;
    element.dataset.testid = `chapter-card-${displayNumber}`;
    setSafeHTML(
      element,
      `
      <span class="ch-badge">${completed ? '✓' : available ? displayNumber : '🔒'}</span>
      <span class="ch-main">
        <span class="ch-name">${formatLessonLabel(chapter.id)}</span>
        <span class="ch-sub">${completed ? 'Завершено' : `${progress.completedCount} из ${progress.totalCount} разделов`}</span>
        <span class="ch-prog"><i style="width:${Math.round(progress.ratio * 100)}%"></i></span>
      </span>
      <span class="ch-arrow">›</span>`
    );
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

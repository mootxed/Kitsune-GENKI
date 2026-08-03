/* studyplan.js — deterministic, local-time study plan for Kitsune Genki */

import { SRS } from './srs.js';
import { createVocabularySchedule } from './src/vocabulary-schedule.js';
import { calculateMastery } from './src/mastery.js';
import { parseCardIdentity } from './src/knowledge-model.js';
import {
  canonicalLessonId,
  compareLessonIds,
  lessonIdForKnowledgeItem,
  sameLessonId,
} from './src/courses/course-context.js';
import {
  addLocalDays,
  formatDateKey,
  getLocalWeekday,
  getTodayDateKey,
  parseDateKey,
} from './src/local-date.js';

const WEIGHT_VOCAB = 1;
const WEIGHT_GRAMMAR = 4;
const MIN_DAYS_PER_CHAPTER = 1;
const MIN_TOTAL_DAYS = 1;
const ALL_WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
const VALID_DATE_STATUSES = new Set([
  'planned',
  'today',
  'completed',
  'skipped',
  'overdue',
  'postponed',
  'rest-day',
]);
const LEGACY_STATUS_ALIASES = Object.freeze({
  done: 'completed',
  rescheduled: 'postponed',
});

function normalizedWeekdays(daysOfWeek) {
  return [...new Set((daysOfWeek || []).map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}

export function calculateChapterWeight(lesson) {
  if (Number(lesson?.requiredTotalMinutes) > 0) {
    const importance = Number(lesson?.importanceWeight ?? lesson?.importance_weight ?? 1);
    return Math.max(1, Number(lesson.requiredTotalMinutes)) * Math.max(0.1, importance);
  }

  const vocabCount = Number(
    lesson?.vocabCount ?? lesson?.words?.length ?? lesson?.vocabulary?.length ?? 0
  );
  const grammarCount = Number(
    lesson?.grammarCount ??
      (Array.isArray(lesson?.grammar)
        ? lesson.grammar.length
        : Array.isArray(lesson?.notes)
          ? lesson.notes.length
          : 0)
  );
  const estimatedItems = Number(lesson?.estimatedItems || lesson?.estimatedMinutes || 0);
  const measuredWeight = vocabCount * WEIGHT_VOCAB + grammarCount * WEIGHT_GRAMMAR;
  const baseWeight = measuredWeight > 0 ? measuredWeight : estimatedItems;
  const importance = Number(lesson?.importanceWeight ?? lesson?.importance_weight ?? 1);
  return Math.max(1, baseWeight || 1) * Math.max(0.1, importance || 1);
}

export function getStudyDaysInRange(startDate, endDate, daysOfWeek) {
  const weekdays = normalizedWeekdays(daysOfWeek);
  if (weekdays.length === 0 || endDate < startDate) return [];
  const result = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    if (weekdays.includes(getLocalWeekday(cursor))) result.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return result;
}

export function getStudyDateKeys(startDate, totalDays, daysOfWeek) {
  const count = Number(totalDays);
  const weekdays = normalizedWeekdays(daysOfWeek);
  if (!Number.isInteger(count) || count <= 0 || weekdays.length === 0) return [];
  const result = [];
  let cursor = startDate;
  while (result.length < count) {
    if (weekdays.includes(getLocalWeekday(cursor))) result.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return result;
}

export function distributeProportionally(items, weights, totalDays) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (totalDays < items.length * MIN_DAYS_PER_CHAPTER) {
    return items.map((_, index) => (index < totalDays ? 1 : 0));
  }

  const safeWeights = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 1));
  const base = items.map(() => MIN_DAYS_PER_CHAPTER);
  const remainingDays = totalDays - base.length * MIN_DAYS_PER_CHAPTER;
  const sumWeights = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const quotas = safeWeights.map((weight) => (remainingDays * weight) / sumWeights);
  const floors = quotas.map(Math.floor);
  const allocated = base.map((minimum, index) => minimum + floors[index]);
  let remainder = totalDays - allocated.reduce((sum, value) => sum + value, 0);
  const order = quotas
    .map((quota, index) => ({ index, fraction: quota - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; remainder > 0; index = (index + 1) % order.length) {
    allocated[order[index].index] += 1;
    remainder -= 1;
  }
  return allocated;
}

function buildSegments(lessons, studyDays, vocabularyRemainingByChapter = {}) {
  const weights = lessons.map(calculateChapterWeight);
  const allocatedDays = distributeProportionally(lessons, weights, studyDays.length);
  let cursor = 0;
  return lessons.map((lesson, index) => {
    const assignedDates = studyDays.slice(cursor, cursor + allocatedDays[index]);
    cursor += allocatedDays[index];
    const vocabulary = createVocabularySchedule(
      vocabularyRemainingByChapter[lesson.id] ?? lesson.vocabCount ?? lesson.words?.length ?? 0,
      assignedDates,
      { maxPerDay: 25 }
    );
    return {
      id: `chapter-${lesson.id}-${assignedDates[0] || 'unscheduled'}`,
      type: 'chapter',
      chapterId: lesson.id,
      days: assignedDates.length,
      assignedDates,
      startDate: assignedDates[0] || null,
      endDate: assignedDates.at(-1) || null,
      estimatedMinutes: Number(lesson.estimatedMinutes || 0) || null,
      status: 'planned',
      dateStatuses: {},
      vocabularySchedule: vocabulary.schedule,
      vocabularyScheduleReserveDays: vocabulary.reserveDays,
      vocabularyScheduleWarning: vocabulary.infeasible
        ? {
            code: 'vocabulary-deadline-infeasible',
            requiredDailyTarget: vocabulary.requiredDailyTarget,
            safeMaximum: 25,
            unscheduledWords: vocabulary.unscheduledWords,
          }
        : null,
    };
  });
}

function expiredDeadlineResult(currentPlan, lessons, completedChapters, today) {
  const remainingCount = lessons.filter(
    (lesson) => !completedChapters.some((id) => sameLessonId(id, lesson.id))
  ).length;
  const studyDaysOfWeek = normalizedWeekdays(currentPlan.studyDaysOfWeek);
  return {
    deadlineExpired: true,
    expiredDeadline: currentPlan.deadline,
    preserveHistory: true,
    options: [
      {
        type: 'extend_deadline',
        label: 'Сдвинуть дедлайн',
        params: {
          startDate: today,
          totalDays: Math.max(MIN_TOTAL_DAYS, remainingCount * 3),
          studyDaysOfWeek,
        },
      },
      {
        type: 'increase_load',
        label: 'Увеличить ежедневную нагрузку',
        params: {
          startDate: today,
          totalDays: Math.max(MIN_TOTAL_DAYS, remainingCount * 2),
          studyDaysOfWeek: ALL_WEEKDAYS,
        },
      },
      {
        type: 'keep_overdue',
        label: 'Оставить план просроченным',
        params: null,
      },
    ],
  };
}

export function generatePlan(params, lessons, completedChapters = []) {
  const startDate = params?.startDate;
  const studyDaysOfWeek = normalizedWeekdays(params?.studyDaysOfWeek);
  let { deadline, totalDays } = params || {};

  try {
    parseDateKey(startDate);
  } catch {
    return { error: 'Укажите корректную дату начала обучения', code: 'invalid-start-date' };
  }
  if (studyDaysOfWeek.length === 0) {
    return { error: 'Выберите хотя бы один учебный день', code: 'no-study-days' };
  }
  if (!deadline && !totalDays) {
    return { error: 'Необходимо указать deadline или totalDays' };
  }

  const canonicalCompleted = completedChapters.map((id) => canonicalLessonId(id)).filter(Boolean);
  const remainingLessons = (lessons || []).filter(
    (lesson) => !canonicalCompleted.some((id) => sameLessonId(id, lesson.id))
  );
  if (remainingLessons.length === 0) {
    return { error: 'Все главы уже изучены! 🎓', allCompleted: true };
  }

  let studyDays;
  if (deadline) {
    try {
      parseDateKey(deadline);
    } catch {
      return { error: 'Укажите корректный дедлайн', code: 'invalid-deadline' };
    }
    if (deadline < startDate) {
      return expiredDeadlineResult(
        { deadline, studyDaysOfWeek },
        remainingLessons,
        canonicalCompleted,
        startDate
      );
    }
    studyDays = getStudyDaysInRange(startDate, deadline, studyDaysOfWeek);
  } else {
    totalDays = Number(totalDays);
    if (!Number.isInteger(totalDays) || totalDays <= 0) {
      return { error: 'Количество учебных дней должно быть целым положительным числом' };
    }
    studyDays = getStudyDateKeys(startDate, totalDays, studyDaysOfWeek);
    deadline = studyDays.at(-1);
  }

  const minimumTotalDays = Math.max(MIN_TOTAL_DAYS, remainingLessons.length);
  if (studyDays.length < minimumTotalDays) {
    return {
      error: `Слишком сжатый срок. Доступно ${studyDays.length} учебных дней, минимум ${minimumTotalDays}`,
      minDays: minimumTotalDays,
      availableDays: studyDays.length,
    };
  }
  if (studyDays.length < remainingLessons.length) {
    return {
      error: 'Недостаточно учебных дат: каждой главе требуется хотя бы один день',
      availableDays: studyDays.length,
      requiredDays: remainingLessons.length,
    };
  }

  const capacityMinutes = Number(params?.capacityMinutes || params?.dailyGoalMinutes);
  if (capacityMinutes > 0) {
    const totalRequiredMinutes = remainingLessons.reduce(
      (sum, lesson) => sum + calculateRequiredChapterMinutes(lesson),
      0
    );
    const minRequiredDaysForWorkload = Math.max(
      remainingLessons.length,
      Math.ceil(totalRequiredMinutes / capacityMinutes)
    );

    if (studyDays.length < minRequiredDaysForWorkload) {
      return {
        error: `Слишком сжатый срок для выбранной дневной нагрузки (${capacityMinutes} мин/день). Доступно ${studyDays.length} учебных дней, требуется минимум ${minRequiredDaysForWorkload} дней`,
        code: 'infeasible-workload',
        availableDays: studyDays.length,
        requiredDays: minRequiredDaysForWorkload,
        capacityMinutes,
      };
    }
  }

  const segments = buildSegments(remainingLessons, studyDays);
  return {
    createdAt: Date.now(),
    startDate,
    deadline,
    totalDays: studyDays.length,
    studyDaysOfWeek,
    completedChapters: [...new Set(canonicalCompleted)].sort(compareLessonIds),
    segments,
    activeSegmentId: segments[0]?.id || null,
    history: [],
    paused: false,
  };
}

function segmentDates(segment, weekdays) {
  if (Array.isArray(segment.assignedDates)) return [...new Set(segment.assignedDates)].sort();
  if (!segment.startDate || !segment.endDate) return [];
  return getStudyDaysInRange(segment.startDate, segment.endDate, weekdays);
}

export function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  const weekdays = normalizedWeekdays(plan.studyDaysOfWeek);
  const segments = (plan.segments || []).map((segment, index) => {
    const assignedDates = segmentDates(segment, weekdays);
    const dateStatuses = Object.fromEntries(
      Object.entries(segment.dateStatuses || {}).map(([dateKey, status]) => [
        dateKey,
        LEGACY_STATUS_ALIASES[status] || status,
      ])
    );
    return {
      ...segment,
      id:
        segment.id ||
        `${segment.type || 'chapter'}-${segment.chapterId || index}-${assignedDates[0] || index}`,
      assignedDates,
      startDate: assignedDates[0] || segment.startDate || null,
      endDate: assignedDates.at(-1) || segment.endDate || null,
      days: assignedDates.length || Number(segment.days || 0),
      status:
        LEGACY_STATUS_ALIASES[segment.status] ||
        segment.status ||
        (segment.completedAt ? 'completed' : 'planned'),
      dateStatuses,
    };
  });
  return {
    ...plan,
    studyDaysOfWeek: weekdays,
    segments,
    history: Array.isArray(plan.history) ? plan.history : [],
    completedChapters: Array.isArray(plan.completedChapters)
      ? [
          ...new Set(plan.completedChapters.map((id) => canonicalLessonId(id)).filter(Boolean)),
        ].sort(compareLessonIds)
      : [],
    activeSegmentId:
      plan.activeSegmentId ||
      segments.find(
        (segment) =>
          segment.type === 'chapter' &&
          !plan.completedChapters?.some((id) => sameLessonId(id, segment.chapterId)) &&
          segment.status !== 'completed'
      )?.id ||
      null,
  };
}

export function recalculateFuturePlan(
  currentPlan,
  lessons,
  completedChapters = [],
  { today = getTodayDateKey(), vocabularyUnlocks = {}, reviewEvents = [], learningEvents = [] } = {}
) {
  if (!currentPlan) return { error: 'План не найден' };
  if (currentPlan.deadline && currentPlan.deadline < today) {
    return expiredDeadlineResult(currentPlan, lessons, completedChapters, today);
  }

  const weekdays = normalizedWeekdays(currentPlan.studyDaysOfWeek);
  const completed = [
    ...new Set(completedChapters.map((id) => canonicalLessonId(id)).filter(Boolean)),
  ].sort(compareLessonIds);
  const remainingLessons = (lessons || []).filter(
    (lesson) => !completed.some((id) => sameLessonId(id, lesson.id))
  );
  const preserved = [];
  const preserveToday = hasConfirmedPlanActivity(currentPlan, today, {
    vocabularyUnlocks,
    reviewEvents,
    learningEvents,
  });

  for (const original of currentPlan.segments || []) {
    const dates = segmentDates(original, weekdays);
    const historicalDates = dates.filter(
      (dateKey) => dateKey < today || (preserveToday && dateKey === today)
    );
    if (historicalDates.length === 0) continue;
    preserved.push({
      ...original,
      assignedDates: historicalDates,
      startDate: historicalDates[0],
      endDate: historicalDates.at(-1),
      days: historicalDates.length,
      dateStatuses: { ...(original.dateStatuses || {}) },
    });
  }

  const futureStart = preserveToday ? addLocalDays(today, 1) : today;
  const futureDates = currentPlan.deadline
    ? getStudyDaysInRange(futureStart, currentPlan.deadline, weekdays)
    : [];

  if (remainingLessons.length > 0 && futureDates.length < remainingLessons.length) {
    return {
      ...expiredDeadlineResult(currentPlan, lessons, completed, today),
      insufficientFutureDates: true,
      availableDays: futureDates.length,
      requiredDays: remainingLessons.length,
    };
  }

  const vocabularyRemainingByChapter = Object.fromEntries(
    remainingLessons.map((lesson) => {
      const unlocked = new Set(
        Object.values(vocabularyUnlocks?.[lesson.id] || {}).flatMap((entry) => entry?.itemIds || [])
      );
      return [
        lesson.id,
        Math.max(0, Number(lesson.vocabCount ?? lesson.words?.length ?? 0) - unlocked.size),
      ];
    })
  );
  const futureSegments =
    remainingLessons.length > 0
      ? buildSegments(remainingLessons, futureDates, vocabularyRemainingByChapter)
      : [];
  const merged = [...preserved];
  for (const segment of futureSegments) {
    const existing = merged.find(
      (entry) =>
        entry.type === 'chapter' &&
        sameLessonId(entry.chapterId, segment.chapterId) &&
        !completed.some((id) => sameLessonId(id, entry.chapterId))
    );
    if (existing) {
      existing.assignedDates = [...new Set([...existing.assignedDates, ...segment.assignedDates])];
      existing.startDate = existing.assignedDates[0];
      existing.endDate = existing.assignedDates.at(-1);
      existing.days = existing.assignedDates.length;
      existing.estimatedMinutes ||= segment.estimatedMinutes;
      existing.vocabularySchedule = {
        ...Object.fromEntries(
          Object.entries(existing.vocabularySchedule || {}).filter(([dateKey]) => dateKey <= today)
        ),
        ...(segment.vocabularySchedule || {}),
      };
      existing.vocabularyScheduleWarning = segment.vocabularyScheduleWarning;
    } else {
      merged.push(segment);
    }
  }

  const history = [...(currentPlan.history || [])];
  const eventId = `plan-recalculated:${today}:${completed.join(',')}`;
  if (!history.some((entry) => entry.eventId === eventId)) {
    history.push({
      eventId,
      eventType: 'plan-recalculated',
      occurredAt: Date.now(),
      dateKey: today,
      completedChapters: completed,
    });
  }

  const activeSegment =
    merged.find(
      (segment) =>
        segment.type === 'chapter' &&
        !completed.some((id) => sameLessonId(id, segment.chapterId)) &&
        segment.assignedDates.includes(today)
    ) ||
    merged.find(
      (segment) =>
        segment.type === 'chapter' && !completed.some((id) => sameLessonId(id, segment.chapterId))
    );

  return {
    ...currentPlan,
    completedChapters: completed,
    segments: merged,
    activeSegmentId: activeSegment?.id || null,
    history,
    recalculatedAt: Date.now(),
    recalculatedFrom: today,
    deadlineState: null,
  };
}

export function recalcPlan(currentPlan, lessons, completedChapters, options = {}) {
  return recalculateFuturePlan(currentPlan, lessons, completedChapters, options);
}

export function markDateStatus(plan, dateKey, status) {
  const normalizedStatus = LEGACY_STATUS_ALIASES[status] || status;
  if (!VALID_DATE_STATUSES.has(normalizedStatus)) {
    throw new Error(`[StudyPlan] Неверный статус даты: ${status}`);
  }
  const segment = plan?.segments?.find((entry) =>
    segmentDates(entry, plan.studyDaysOfWeek).includes(dateKey)
  );
  if (!segment) return false;
  segment.dateStatuses ||= {};
  segment.dateStatuses[dateKey] = normalizedStatus;
  return true;
}

export function getDateStatus(
  plan,
  dateKey,
  { today = getTodayDateKey(), learningEvents = [], reviewEvents = [] } = {}
) {
  const segment = plan?.segments?.find((entry) =>
    segmentDates(entry, plan.studyDaysOfWeek).includes(dateKey)
  );
  if (!segment) return 'rest-day';
  const stored =
    LEGACY_STATUS_ALIASES[segment.dateStatuses?.[dateKey]] || segment.dateStatuses?.[dateKey];
  if (stored && VALID_DATE_STATUSES.has(stored)) return stored;

  // День считается завершённым только при явном завершении главы или всего дневного плана,
  // но не при завершении отдельного раздела (section-completed = прогресс, не завершение дня).
  const hasLearningEvidence = learningEvents.some(
    (event) =>
      !event.undoneAt &&
      event.dateKey === dateKey &&
      sameLessonId(event.chapterId, segment.chapterId) &&
      ['chapter-completed', 'daily-plan-completed'].includes(event.eventType)
  );
  const hasReviewEvidence = reviewEvents.some(
    (event) =>
      !event.undoneAt && event.eventType === 'review' && formatDateKey(event.reviewedAt) === dateKey
  );
  if (hasLearningEvidence || (segment.type === 'review' && hasReviewEvidence)) return 'completed';
  if (plan.paused && dateKey >= today) return 'postponed';
  if (dateKey === today) return 'today';
  if (dateKey < today) return 'overdue';
  return 'planned';
}

function chapterMastery(planSegment, srsRecords, masteryArchive, reviewEvents, now) {
  if (!planSegment?.chapterId) return null;
  const belongsToLesson = (itemId, record = null) =>
    sameLessonId(
      record?.lessonId || record?.chapterId || lessonIdForKnowledgeItem(itemId),
      planSegment.chapterId
    );
  const itemIds = new Set([
    ...Object.entries(masteryArchive || {})
      .filter(([itemId, archive]) => belongsToLesson(itemId, archive))
      .map(([itemId]) => itemId),
    ...(reviewEvents || [])
      .filter((event) => event?.itemId && belongsToLesson(event.itemId, event))
      .map((event) => event.itemId),
    ...Object.values(srsRecords || {})
      .filter((card) => belongsToLesson(parseCardIdentity(card).itemId, card))
      .map((card) => parseCardIdentity(card).itemId),
  ]);
  if (itemIds.size === 0) return null;

  const results = [...itemIds]
    .map((itemId) => {
      const cards = Object.values(srsRecords || {}).filter(
        (card) => parseCardIdentity(card).itemId === itemId
      );
      const archive = masteryArchive?.[itemId] || null;
      const applicableSkills = [
        ...new Set([
          ...cards.map((card) => parseCardIdentity(card).skill),
          ...Object.keys(archive?.successfulSkills || {}),
        ]),
      ];
      try {
        return calculateMastery({
          itemId,
          cards,
          events: reviewEvents,
          archive,
          applicableSkills,
          now,
          getRetrievability: (card, at) => SRS.getRetrievability(card, at),
        });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (results.length === 0) return null;
  return {
    avgScore: results.reduce((sum, item) => sum + item.score, 0) / results.length,
    itemCount: results.length,
    masteredCount: results.filter((item) => item.score === 100).length,
    needsRefreshCount: results.filter((item) => item.needsRefresh).length,
  };
}

export function getDailyPlanContext(
  plan,
  srsRecords,
  masteryArchive,
  today = getTodayDateKey(),
  { reviewEvents = [], learningEvents = [], now = Date.now() } = {}
) {
  const startToday = parseDateKey(today).getTime();
  const due = Object.values(srsRecords || {}).filter(
    (card) => !card.suspended && Number.isFinite(Number(card.due)) && Number(card.due) <= now
  );
  const overdueCount = due.filter((card) => Number(card.due) < startToday).length;
  const reviewedTodayIds = new Set(
    reviewEvents
      .filter(
        (event) =>
          !event.undoneAt &&
          event.eventType === 'review' &&
          formatDateKey(event.reviewedAt) === today
      )
      .map((event) => event.cardId)
  );
  const activeSegment =
    plan?.segments?.find(
      (segment) => segment.type === 'chapter' && segment.assignedDates?.includes(today)
    ) ||
    plan?.segments?.find(
      (segment) =>
        segment.type === 'chapter' &&
        !plan.completedChapters?.some((id) => sameLessonId(id, segment.chapterId)) &&
        segment.status !== 'completed'
    ) ||
    null;
  const mastery = chapterMastery(activeSegment, srsRecords, masteryArchive, reviewEvents, now);
  const dueCount = due.length;
  const reviewedToday = reviewedTodayIds.size;
  const shouldSlowDown = mastery !== null && mastery.avgScore < 40;
  const recommendedMode =
    dueCount > 10 ? 'review_first' : shouldSlowDown ? 'consolidate' : 'normal';
  return {
    today,
    activeSegment,
    dueCount,
    overdueCount,
    reviewedToday,
    reviewTotalToday: reviewedToday + dueCount,
    reviewProgress: reviewedToday + dueCount > 0 ? reviewedToday / (reviewedToday + dueCount) : 1,
    chapterMastery: mastery,
    shouldSlowDown,
    recommendedMode,
    dateStatus: getDateStatus(plan, today, { today, learningEvents, reviewEvents }),
  };
}

export function getHeuristicAdvice(chapter, daysLeft) {
  const vocabCount = Number(chapter?.vocabCount ?? chapter?.words?.length ?? 0);
  const grammarCount = Number(chapter?.grammarCount ?? chapter?.grammar?.length ?? 0);
  const estimatedMinutes =
    Number(chapter?.estimatedMinutes || 0) || Math.max(20, vocabCount + grammarCount * 5);
  const perDay = daysLeft ? Math.ceil(estimatedMinutes / Math.max(1, daysLeft)) : estimatedMinutes;
  let words = 40;
  let grammar = 35;
  let reading = 15;
  let listening = 10;
  let detail = 'Глава сбалансирована.';
  if (vocabCount > 25) {
    const boost = Math.min(10, Math.floor((vocabCount - 25) / 3));
    words += boost;
    grammar -= Math.floor(boost * 0.6);
    reading -= Math.floor(boost * 0.4);
    detail = `В главе ${vocabCount} слов — уделите больше внимания словарному запасу.`;
  } else if (grammarCount > 5) {
    const boost = Math.min(10, (grammarCount - 5) * 2);
    grammar += boost;
    words -= Math.floor(boost * 0.6);
    reading -= Math.floor(boost * 0.4);
    detail = `В главе ${grammarCount} грамматических правил — сконцентрируйтесь на грамматике.`;
  }
  if (daysLeft && daysLeft < 7) {
    listening = Math.max(5, listening - 5);
    reading += 5;
    detail += ` Осталось мало времени: около ${perDay} минут в учебный день.`;
  }
  return {
    words,
    grammar,
    reading,
    listening,
    estimatedMinutes,
    minutesPerDay: perDay,
    tip: detail,
  };
}

export function calculateRequiredChapterMinutes(lesson) {
  const vocabCount = Number(
    lesson?.vocabCount ?? lesson?.words?.length ?? lesson?.vocabulary?.length ?? 0
  );
  const grammarCount = Number(
    lesson?.grammarCount ??
      (Array.isArray(lesson?.grammar)
        ? lesson.grammar.length
        : Array.isArray(lesson?.notes)
          ? lesson.notes.length
          : 0)
  );
  const practiceCount = Number(
    lesson?.practiceCount ?? (Array.isArray(lesson?.practice) ? lesson.practice.length : 0)
  );

  return vocabCount * 1.0 + grammarCount * 12.0 + practiceCount * 10.0;
}

export function getPlanDateAvailability(plan, chapterId, dateKey = getTodayDateKey()) {
  if (!plan) {
    return { isStudyDay: true, isRestDay: false, isPaused: false, reason: 'no-plan' };
  }

  if (plan.paused) {
    return { isStudyDay: false, isRestDay: false, isPaused: true, reason: 'plan-paused' };
  }

  const chId = canonicalLessonId(chapterId);
  if (!chId) {
    return { isStudyDay: false, isRestDay: false, isPaused: false, reason: 'invalid-lesson-id' };
  }
  const segments = Array.isArray(plan.segments) ? plan.segments : [];
  const activeSeg =
    segments.find(
      (s) =>
        s && s.type === 'chapter' && sameLessonId(s.chapterId, chId) && s.status !== 'completed'
    ) || segments.find((s) => s && s.type === 'chapter' && sameLessonId(s.chapterId, chId));

  if (!activeSeg) {
    return { isStudyDay: false, isRestDay: false, isPaused: false, reason: 'no-segment' };
  }

  const assigned = segmentDates(activeSeg, plan.studyDaysOfWeek);
  if (!assigned.includes(dateKey)) {
    return { isStudyDay: false, isRestDay: false, isPaused: false, reason: 'not-assigned-date' };
  }

  const status = activeSeg.dateStatuses?.[dateKey];
  if (status === 'rest-day' || status === 'skipped' || status === 'postponed') {
    return { isStudyDay: false, isRestDay: status === 'rest-day', isPaused: false, reason: status };
  }

  const weekdays = normalizedWeekdays(plan.studyDaysOfWeek);
  if (weekdays.length > 0 && !weekdays.includes(getLocalWeekday(dateKey))) {
    return { isStudyDay: false, isRestDay: false, isPaused: false, reason: 'non-study-weekday' };
  }

  return { isStudyDay: true, isRestDay: false, isPaused: false, reason: 'eligible' };
}

export function getAllPlanStudyDates(plan) {
  return [
    ...new Set(
      (plan?.segments || []).flatMap((segment) => segment?.assignedDates || []).filter(Boolean)
    ),
  ].sort();
}

function eventOccurredOnDate(event, dateKey) {
  if (!event || event.undoneAt) return false;
  if (event.dateKey === dateKey) return true;
  const timestamp = event.reviewedAt ?? event.occurredAt;
  return Number.isFinite(timestamp) && formatDateKey(timestamp) === dateKey;
}

function hasConfirmedPlanActivity(plan, dateKey, options = {}) {
  const hasSavedStatus =
    Object.hasOwn(plan?.dateStatuses || {}, dateKey) ||
    (plan?.segments || []).some((segment) => Object.hasOwn(segment?.dateStatuses || {}, dateKey));
  if (hasSavedStatus) return true;

  if ((options.reviewEvents || []).some((event) => eventOccurredOnDate(event, dateKey))) {
    return true;
  }
  if ((options.learningEvents || []).some((event) => eventOccurredOnDate(event, dateKey))) {
    return true;
  }

  return Object.values(options.vocabularyUnlocks || {}).some((chapterUnlocks) => {
    const unlock = chapterUnlocks?.[dateKey];
    return Array.isArray(unlock?.itemIds) && unlock.itemIds.length > 0;
  });
}

export function mergeUpdatedPlanWithHistory(existingPlan, generatedPlan, options = {}) {
  if (!existingPlan) return generatedPlan;
  if (!generatedPlan) return existingPlan;

  const today = options.today || getTodayDateKey();
  const preserveToday = hasConfirmedPlanActivity(existingPlan, today, options);
  const isHistoricalDate = (dateKey) => dateKey < today || (preserveToday && dateKey === today);
  const isFutureDate = (dateKey) => dateKey > today || (!preserveToday && dateKey === today);

  const historyMap = new Map();
  for (const item of existingPlan.history || []) {
    if (item && item.eventId) historyMap.set(item.eventId, item);
  }
  for (const item of generatedPlan.history || []) {
    if (item && item.eventId && !historyMap.has(item.eventId)) {
      historyMap.set(item.eventId, item);
    }
  }

  const completedChapters = [
    ...new Set([
      ...(existingPlan.completedChapters || []),
      ...(generatedPlan.completedChapters || []),
    ]),
  ]
    .map((id) => canonicalLessonId(id))
    .filter(Boolean)
    .sort(compareLessonIds);

  const mergedDateStatuses = { ...(generatedPlan.dateStatuses || {}) };
  if (existingPlan.dateStatuses) {
    for (const [dateKey, status] of Object.entries(existingPlan.dateStatuses)) {
      if (isHistoricalDate(dateKey)) {
        mergedDateStatuses[dateKey] = status;
      }
    }
  }

  const mergedVocabSchedule = { ...(generatedPlan.vocabularySchedule || {}) };
  if (existingPlan.vocabularySchedule) {
    for (const [dateKey, batch] of Object.entries(existingPlan.vocabularySchedule)) {
      if (isHistoricalDate(dateKey)) {
        mergedVocabSchedule[dateKey] = batch;
      }
    }
  }

  // Классифицируем существующие сегменты:
  // - fully-past COMPLETED: status === 'completed' → берём как есть, больше не пересчитываем
  // - overdue INCOMPLETE: все даты в прошлом, но не завершена → active (получит новые даты)
  // - active: хотя бы одна дата >= today → объединяем с новым сегментом по chapterId
  const fullyPastSegments = (existingPlan.segments || []).filter((seg) => {
    // Только явно завершённые — они не должны получать новые даты.
    // Незавершённые просроченные сегменты переходят в activeExistingSegments — там они
    // объединятся с новыми будущими датами, сохраняя прошлые.
    return seg.status === 'completed';
  });

  const activeExistingSegments = (existingPlan.segments || []).filter((seg) => {
    if (seg.status === 'completed') return false;
    const dates = seg.assignedDates || [];
    // Сегмент активен, если:
    // - у него есть будущие даты (normal active), ИЛИ
    // - все даты в прошлом (просрочен и не завершён) — overdue incomplete
    return dates.length > 0;
  });

  // fullyPastChapterIds — только завершённые главы, блокируем новую генерацию только для них
  const fullyPastChapterIds = new Set(
    fullyPastSegments.filter((s) => s.type === 'chapter').map((s) => s.chapterId)
  );

  // Строим карту активных существующих сегментов по chapterId
  const activeExistingByChapterId = new Map(
    activeExistingSegments.filter((s) => s.type === 'chapter').map((s) => [s.chapterId, s])
  );

  // Для каждого нового (сгенерированного) сегмента:
  // - если глава уже полностью в прошлом → пропускаем (будет взята из fullyPastSegments)
  // - если глава есть в activeExisting → объединяем: прошлые даты из existing + будущие из нового
  // - иначе → берём новый сегмент целиком
  const mergedActiveSegments = [];
  const mergedActiveChapterIds = new Set();

  for (const newSeg of generatedPlan.segments || []) {
    if (newSeg.type !== 'chapter') {
      // Не-chapter сегменты (review и т.п.) берём как есть, если не в прошлом
      const dates = newSeg.assignedDates || [];
      if (dates.length === 0 || dates.some(isFutureDate)) {
        mergedActiveSegments.push(newSeg);
      }
      continue;
    }

    if (fullyPastChapterIds.has(newSeg.chapterId)) {
      // Эта глава уже полностью в прошлом — пропускаем, возьмём из fullyPastSegments
      continue;
    }

    const existingSeg = activeExistingByChapterId.get(newSeg.chapterId);
    if (existingSeg) {
      // Объединяем: прошлые даты из existing сегмента + будущие из нового
      const pastDates = (existingSeg.assignedDates || []).filter(isHistoricalDate);
      const futureDates = (newSeg.assignedDates || []).filter(isFutureDate);
      const combinedDates = [...new Set([...pastDates, ...futureDates])].sort();

      // Сохраняем dateStatuses: все из existing (прошлое) + будущие из нового
      const mergedSegDateStatuses = {
        ...Object.fromEntries(
          Object.entries(existingSeg.dateStatuses || {}).filter(([dk]) => isHistoricalDate(dk))
        ),
        ...Object.fromEntries(
          Object.entries(newSeg.dateStatuses || {}).filter(([dk]) => isFutureDate(dk))
        ),
      };

      // Сохраняем vocabularySchedule: прошлые из existing + будущие из нового
      const mergedSegVocab = {
        ...Object.fromEntries(
          Object.entries(existingSeg.vocabularySchedule || {}).filter(([dk]) =>
            isHistoricalDate(dk)
          )
        ),
        ...Object.fromEntries(
          Object.entries(newSeg.vocabularySchedule || {}).filter(([dk]) => isFutureDate(dk))
        ),
      };

      mergedActiveSegments.push({
        ...existingSeg,
        assignedDates: combinedDates,
        startDate: combinedDates[0] || existingSeg.startDate,
        endDate: combinedDates.at(-1) || existingSeg.endDate,
        days: combinedDates.length,
        dateStatuses: mergedSegDateStatuses,
        vocabularySchedule: mergedSegVocab,
        vocabularyScheduleWarning: newSeg.vocabularyScheduleWarning,
        estimatedMinutes: existingSeg.estimatedMinutes || newSeg.estimatedMinutes,
      });
      mergedActiveChapterIds.add(newSeg.chapterId);
    } else {
      // Новая глава без истории → берём целиком
      mergedActiveSegments.push(newSeg);
      mergedActiveChapterIds.add(newSeg.chapterId);
    }
  }

  // Также добавляем active existing сегменты, которые НЕ попали в generated plan
  // (например, текущая глава осталась в плане без пересчёта)
  for (const existingSeg of activeExistingSegments) {
    if (existingSeg.type !== 'chapter') continue;
    if (!mergedActiveChapterIds.has(existingSeg.chapterId)) {
      // Сохраняем только прошлые даты из такого сегмента
      const pastDates = (existingSeg.assignedDates || []).filter(isHistoricalDate);
      if (pastDates.length > 0) {
        mergedActiveSegments.push({
          ...existingSeg,
          assignedDates: pastDates,
          startDate: pastDates[0],
          endDate: pastDates.at(-1),
          days: pastDates.length,
          dateStatuses: Object.fromEntries(
            Object.entries(existingSeg.dateStatuses || {}).filter(([dk]) => isHistoricalDate(dk))
          ),
        });
      }
    }
  }

  const mergedSegments = [...fullyPastSegments, ...mergedActiveSegments];

  return {
    ...generatedPlan,
    startDate: existingPlan.startDate || generatedPlan.startDate,
    segments: mergedSegments,
    dateStatuses: mergedDateStatuses,
    vocabularySchedule: mergedVocabSchedule,
    history: Array.from(historyMap.values()),
    completedChapters,
    completedAt: existingPlan.completedAt || generatedPlan.completedAt || null,
    dailyPlanHistory: existingPlan.dailyPlanHistory || generatedPlan.dailyPlanHistory || {},
    paused: Boolean(existingPlan.paused),
  };
}

export const StudyPlan = {
  calculateChapterWeight,
  calculateRequiredChapterMinutes,
  getStudyDaysInRange,
  getStudyDateKeys,
  distributeProportionally,
  generatePlan,
  normalizePlan,
  recalcPlan,
  recalculateFuturePlan,
  getHeuristicAdvice,
  markDateStatus,
  getDateStatus,
  getDailyPlanContext,
  getPlanDateAvailability,
  getAllPlanStudyDates,
  mergeUpdatedPlanWithHistory,
};

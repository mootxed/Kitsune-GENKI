/* studyplan.js — deterministic, local-time study plan for Kitsune Genki */

import { SRS } from './srs.js';
import { calculateMastery } from './src/mastery.js';
import { parseCardIdentity } from './src/knowledge-model.js';
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
const MIN_TOTAL_DAYS = 12;
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

const CHAPTER_IMPORTANCE = Object.freeze({
  1: 1.5,
  2: 1.5,
  3: 1.5,
  4: 1,
  5: 1.5,
  6: 1.5,
  7: 1,
  8: 1.5,
  9: 1,
  10: 1,
  11: 0.7,
  12: 1,
});

function normalizedWeekdays(daysOfWeek) {
  return [...new Set((daysOfWeek || []).map(Number))]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}

export function calculateChapterWeight(lesson) {
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
  const estimatedItems = Number(lesson?.estimatedItems || 0);
  const measuredWeight = vocabCount * WEIGHT_VOCAB + grammarCount * WEIGHT_GRAMMAR;
  const baseWeight = measuredWeight > 0 ? measuredWeight : estimatedItems;
  const importance = Number(
    lesson?.importanceWeight ?? lesson?.importance_weight ?? CHAPTER_IMPORTANCE[lesson?.id] ?? 1
  );
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

function buildSegments(lessons, studyDays) {
  const weights = lessons.map(calculateChapterWeight);
  const allocatedDays = distributeProportionally(lessons, weights, studyDays.length);
  let cursor = 0;
  return lessons.map((lesson, index) => {
    const assignedDates = studyDays.slice(cursor, cursor + allocatedDays[index]);
    cursor += allocatedDays[index];
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
    };
  });
}

function expiredDeadlineResult(currentPlan, lessons, completedChapters, today) {
  const remainingCount = lessons.filter((lesson) => !completedChapters.includes(lesson.id)).length;
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

  const remainingLessons = (lessons || []).filter(
    (lesson) => !completedChapters.includes(lesson.id)
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
        completedChapters,
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

  if (studyDays.length < MIN_TOTAL_DAYS) {
    return {
      error: `Слишком сжатый срок. Доступно ${studyDays.length} учебных дней, минимум ${MIN_TOTAL_DAYS}`,
      minDays: MIN_TOTAL_DAYS,
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

  const segments = buildSegments(remainingLessons, studyDays);
  return {
    createdAt: Date.now(),
    startDate,
    deadline,
    totalDays: studyDays.length,
    studyDaysOfWeek,
    completedChapters: [...new Set(completedChapters)].sort((a, b) => a - b),
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
    completedChapters: Array.isArray(plan.completedChapters) ? plan.completedChapters : [],
    activeSegmentId:
      plan.activeSegmentId ||
      segments.find(
        (segment) =>
          segment.type === 'chapter' &&
          !plan.completedChapters?.includes(segment.chapterId) &&
          segment.status !== 'completed'
      )?.id ||
      null,
  };
}

export function recalculateFuturePlan(
  currentPlan,
  lessons,
  completedChapters = [],
  { today = getTodayDateKey() } = {}
) {
  if (!currentPlan) return { error: 'План не найден' };
  if (currentPlan.deadline && currentPlan.deadline < today) {
    return expiredDeadlineResult(currentPlan, lessons, completedChapters, today);
  }

  const weekdays = normalizedWeekdays(currentPlan.studyDaysOfWeek);
  const completed = [...new Set(completedChapters)].sort((a, b) => a - b);
  const remainingLessons = (lessons || []).filter((lesson) => !completed.includes(lesson.id));
  const preserved = [];

  for (const original of currentPlan.segments || []) {
    const dates = segmentDates(original, weekdays);
    const historicalDates = dates.filter((dateKey) => dateKey <= today);
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

  const futureStart = addLocalDays(today, 1);
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

  const futureSegments =
    remainingLessons.length > 0 ? buildSegments(remainingLessons, futureDates) : [];
  const merged = [...preserved];
  for (const segment of futureSegments) {
    const existing = merged.find(
      (entry) =>
        entry.type === 'chapter' &&
        entry.chapterId === segment.chapterId &&
        !completed.includes(entry.chapterId)
    );
    if (existing) {
      existing.assignedDates = [...new Set([...existing.assignedDates, ...segment.assignedDates])];
      existing.startDate = existing.assignedDates[0];
      existing.endDate = existing.assignedDates.at(-1);
      existing.days = existing.assignedDates.length;
      existing.estimatedMinutes ||= segment.estimatedMinutes;
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
        !completed.includes(segment.chapterId) &&
        segment.assignedDates.includes(today)
    ) ||
    merged.find((segment) => segment.type === 'chapter' && !completed.includes(segment.chapterId));

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

  const hasLearningEvidence = learningEvents.some(
    (event) =>
      !event.undoneAt &&
      event.dateKey === dateKey &&
      event.chapterId === segment.chapterId &&
      ['section-completed', 'chapter-completed'].includes(event.eventType)
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
  const prefix = `L${planSegment.chapterId}_`;
  const itemIds = new Set([
    ...Object.keys(masteryArchive || {}).filter((itemId) => itemId.startsWith(prefix)),
    ...(reviewEvents || [])
      .map((event) => event?.itemId)
      .filter((itemId) => itemId?.startsWith(prefix)),
    ...Object.values(srsRecords || {})
      .map((card) => parseCardIdentity(card).itemId)
      .filter((itemId) => itemId.startsWith(prefix)),
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
        !plan.completedChapters?.includes(segment.chapterId) &&
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

export const StudyPlan = {
  calculateChapterWeight,
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
};

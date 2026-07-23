/* studyplan.js — Study plan generator for Kitsune Genki */

import { localDateKey, parseDateKey } from './src/local-date.js';

const WEIGHT_VOCAB = 1;
const WEIGHT_GRAMMAR = 0.5;
const MIN_DAYS_PER_CHAPTER = 1;
const REVIEW_INTERVAL = 3;
const MIN_TOTAL_DAYS = 12;

/**
 * Коэффициенты важности для глав 1-12
 * Главы с высоким коэффициентом получат больше времени на изучение
 * Синхронизировано с lesson.json (поле importance_weight)
 * 1.5 - критически важные (базовая грамматика)
 * 1.0 - стандартная важность
 * 0.7 - менее важные (специфическая лексика, культурные нюансы)
 */
const CHAPTER_IMPORTANCE = {
  1: 1.5, // Базовые структуры предложений
  2: 1.5, // Указательные местоимения
  3: 1.5, // Спряжение глаголов (критично)
  4: 1.0, // Выражение наличия/местоположения
  5: 1.5, // Прилагательные (базовая грамматика)
  6: 1.5, // て-форма (ключевая форма)
  7: 1.0, // Длительное состояние
  8: 1.5, // Краткие формы (критично)
  9: 1.0, // Прошедшее время кратких форм
  10: 1.0, // Сравнительные конструкции
  11: 0.7, // Выражение опыта
  12: 1.0, // Дополнительные конструкции
};

/**
 * Calculate weight of a chapter based on vocab count and grammar complexity
 * @param {Object} lesson - Chapter data
 * @returns {number} Weight value
 */
function calculateChapterWeight(lesson) {
  // Поддерживаем как полный урок (LESSONS), так и лёгкий индекс (CONTENT_INDEX).
  // CONTENT_INDEX содержит vocabCount/grammarCount/importanceWeight напрямую;
  // полный урок — lesson.words и lesson.grammar.
  const vocabCount = lesson.vocabCount ?? (lesson.words ? lesson.words.length : 0);

  let grammarComplexity;
  if (typeof lesson.grammarCount === 'number') {
    // Быстрый путь: CONTENT_INDEX уже содержит готовый счётчик
    grammarComplexity = lesson.grammarCount;
  } else {
    grammarComplexity = 0;
    if (lesson.grammar) {
      if (Array.isArray(lesson.grammar)) {
        grammarComplexity = lesson.grammar.length;
        lesson.grammar.forEach((item) => {
          if (typeof item === 'string') grammarComplexity += item.length / 100;
          else if (item.text) grammarComplexity += item.text.length / 100;
        });
      } else if (typeof lesson.grammar === 'string') {
        grammarComplexity = lesson.grammar.length / 100;
      }
    }
  }

  // Базовый вес главы
  const baseWeight = WEIGHT_VOCAB * vocabCount + WEIGHT_GRAMMAR * grammarComplexity;

  // importanceWeight берём из поля (CONTENT_INDEX), затем из таблицы, затем 1.0
  const importanceMultiplier = lesson.importanceWeight ?? CHAPTER_IMPORTANCE[lesson.id] ?? 1.0;

  // Защита от нулевого веса: каждая глава получает хотя бы базовую единицу
  return baseWeight * importanceMultiplier || 1.0;
}

/**
 * Get list of study days between two dates for specific days of week
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number[]} daysOfWeek - Array of day numbers (0=Sun, 1=Mon, ..., 6=Sat)
 * @returns {string[]} Array of date strings
 */
function getStudyDaysInRange(startDate, endDate, daysOfWeek) {
  const days = [];
  // parseDateKey вместо new Date(string): строка без времени парсится как UTC-полночь,
  // что в отрицательных UTC-offset зонах (LA, NY и др.) сдвигает день на -1.
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (daysOfWeek.includes(dayOfWeek)) {
      days.push(localDateKey(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/**
 * Distribute total days proportionally based on weights
 * @param {Array} items - Array of items with weights
 * @param {number[]} weights - Corresponding weights
 * @param {number} totalDays - Total days to distribute
 * @returns {number[]} Array of allocated days
 */
function distributeProportionally(items, weights, totalDays) {
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  if (sumWeights === 0) {
    const perItem = Math.floor(totalDays / items.length);
    return items.map(() => perItem);
  }

  const allocated = weights.map((w) => Math.round((totalDays * w) / sumWeights));

  allocated.forEach((val, i) => {
    if (val < MIN_DAYS_PER_CHAPTER) allocated[i] = MIN_DAYS_PER_CHAPTER;
  });

  let currentSum = allocated.reduce((a, b) => a + b, 0);
  let diff = totalDays - currentSum;

  while (diff !== 0) {
    for (let i = 0; i < allocated.length && diff !== 0; i++) {
      if (diff > 0) {
        allocated[i]++;
        diff--;
      } else if (diff < 0 && allocated[i] > MIN_DAYS_PER_CHAPTER) {
        allocated[i]--;
        diff++;
      }
    }
    const newSum = allocated.reduce((a, b) => a + b, 0);
    if (newSum === currentSum) break;
    currentSum = newSum;
  }

  return allocated;
}

/**
 * Insert review days after every N chapters
 * @param {Array} segments - Array of chapter segments
 * @param {number} availableDays - Total available days
 * @returns {Array} Segments with review days inserted
 */
function insertReviewDays(segments, availableDays) {
  const result = [];
  const reviewDaysNeeded = Math.floor(segments.length / REVIEW_INTERVAL);

  // Проверяем, достаточно ли дней для глав + дни повторения
  if (availableDays < segments.length * MIN_DAYS_PER_CHAPTER + reviewDaysNeeded) {
    return segments;
  }

  segments.forEach((seg, idx) => {
    result.push(seg);
    if ((idx + 1) % REVIEW_INTERVAL === 0 && idx < segments.length - 1) {
      result.push({ type: 'review', days: 1 });
    }
  });

  return result;
}

/**
 * Map segments to calendar dates
 * @param {Array} segments - Array of segments with days allocated
 * @param {string[]} studyDays - Array of available study dates
 * @returns {Array} Segments with startDate and endDate
 */
function mapSegmentsToCalendar(segments, studyDays) {
  let dayIndex = 0;
  const result = [];

  segments.forEach((seg) => {
    if (dayIndex >= studyDays.length) return;

    const endIndex = Math.min(dayIndex + seg.days - 1, studyDays.length - 1);
    // assignedDates — точный массив дат сегмента (устраняет проблему диапазонов).
    // startDate/endDate сохраняем для обратной совместимости с UI-кодом и тестами.
    const assignedDates = studyDays.slice(dayIndex, endIndex + 1);

    result.push({
      ...seg,
      assignedDates,
      startDate: assignedDates[0],
      endDate: assignedDates[assignedDates.length - 1],
    });

    dayIndex = endIndex + 1;
  });

  return result;
}

/**
 * Generate study plan based on parameters
 * @param {Object} params - Plan parameters
 * @param {Array} lessons - Array of lesson/chapter data
 * @param {number[]} completedChapters - Array of completed chapter IDs
 * @returns {Object} Generated plan or error object
 */
function generatePlan(params, lessons, completedChapters = []) {
  const { startDate, studyDaysOfWeek } = params;
  let { deadline, totalDays } = params;

  if (!deadline && !totalDays) {
    return { error: 'Необходимо указать deadline или totalDays' };
  }

  const start = new Date(startDate);

  // Если deadline указан но находится в прошлом, используем totalDays из оригинального периода
  // ЕСЛИ не установлен флаг _preserveDeadline (для обратной совместимости с тестами)
  if (deadline && new Date(deadline) < start && !params._preserveDeadline) {
    // Используем _originalStartDate если передан (из recalcPlan), иначе текущий startDate
    const originalStart = params._originalStartDate || startDate;
    const tempStudyDays = getStudyDaysInRange(originalStart, deadline, studyDaysOfWeek);
    totalDays = Math.max(MIN_TOTAL_DAYS, tempStudyDays.length);
    deadline = null; // Пересчитываем deadline
  }

  if (!deadline && totalDays) {
    const end = new Date(start);
    let daysAdded = 0;
    while (daysAdded < totalDays) {
      end.setDate(end.getDate() + 1);
      if (studyDaysOfWeek.includes(end.getDay())) {
        daysAdded++;
      }
    }
    deadline = localDateKey(end);
  }

  // Фильтруем главы: исключаем изученные
  const remainingLessons = lessons.filter((l) => !completedChapters.includes(l.id));

  if (remainingLessons.length === 0) {
    return { error: 'Все главы уже изучены! 🎓' };
  }

  const studyDays = getStudyDaysInRange(startDate, deadline, studyDaysOfWeek);

  if (studyDays.length < MIN_TOTAL_DAYS) {
    return {
      error: `Слишком сжатый срок. Доступно ${studyDays.length} учебных дней, минимум ${MIN_TOTAL_DAYS}`,
      minDays: MIN_TOTAL_DAYS,
      availableDays: studyDays.length,
    };
  }

  const weights = remainingLessons.map(calculateChapterWeight);
  const allocatedDays = distributeProportionally(remainingLessons, weights, studyDays.length);

  let segments = remainingLessons.map((lesson, idx) => ({
    type: 'chapter',
    chapterId: lesson.id,
    days: allocatedDays[idx],
  }));

  segments = insertReviewDays(segments, studyDays.length);

  // Проверяем, что общее количество дней не превышает доступные
  const finalDaysNeeded = segments.reduce((sum, seg) => sum + seg.days, 0);
  if (finalDaysNeeded > studyDays.length) {
    // Если превышает, уменьшаем дни на главы, сохраняя review-дни
    const diff = finalDaysNeeded - studyDays.length;
    const chapterSegments = segments.filter((s) => s.type === 'chapter');

    // Уменьшаем дни с конца, но не меньше MIN_DAYS_PER_CHAPTER
    let remaining = diff;
    for (let i = chapterSegments.length - 1; i >= 0 && remaining > 0; i--) {
      const seg = chapterSegments[i];
      const canReduce = seg.days - MIN_DAYS_PER_CHAPTER;
      if (canReduce > 0) {
        const reduction = Math.min(canReduce, remaining);
        seg.days -= reduction;
        remaining -= reduction;
      }
    }
  }

  segments = mapSegmentsToCalendar(segments, studyDays);

  return {
    createdAt: Date.now(),
    startDate,
    deadline,
    studyDaysOfWeek,
    segments,
  };
}

/**
 * Пересчёт плана с текущей даты.
 *
 * Если дедлайн уже истёк — НЕ сохраняем его принудительно.
 * Вместо этого возвращаем объект с `deadlineExpired: true` и двумя вариантами:
 *   - extend_deadline: сдвинуть дедлайн, сохранив привычную нагрузку
 *   - increase_load: уложиться в остаток оригинального периода, занимаясь каждый день
 *
 * UI должен показать диалог выбора и вызвать generatePlan с выбранными params.
 *
 * @param {Object}   currentPlan      - Существующий план
 * @param {Array}    lessons          - Данные уроков (CONTENT_INDEX или LESSONS)
 * @param {number[]} completedChapters - ID завершённых глав
 * @returns {Object} план или { deadlineExpired: true, options: [...] }
 */
function recalcPlan(currentPlan, lessons, completedChapters) {
  const today = localDateKey();

  // Дедлайн уже прошёл
  if (currentPlan.deadline && currentPlan.deadline < today) {
    const remaining = lessons.filter((l) => !completedChapters.includes(l.id));

    // Вариант 1: сдвиг дедлайна — сохраняем привычные дни недели
    const extendedParams = {
      startDate: today,
      totalDays: Math.max(MIN_TOTAL_DAYS, remaining.length * 3),
      studyDaysOfWeek: currentPlan.studyDaysOfWeek,
    };

    // Вариант 2: повышение нагрузки — занимаемся каждый день, но короткий период
    const originalDays = getStudyDaysInRange(
      currentPlan.startDate,
      currentPlan.deadline,
      currentPlan.studyDaysOfWeek
    );
    const intensiveParams = {
      startDate: today,
      totalDays: Math.max(MIN_TOTAL_DAYS, Math.ceil(originalDays.length * 0.3)),
      studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6], // каждый день
    };

    return {
      deadlineExpired: true,
      expiredDeadline: currentPlan.deadline,
      options: [
        {
          type: 'extend_deadline',
          label: 'Сдвинуть дедлайн',
          params: extendedParams,
        },
        {
          type: 'increase_load',
          label: 'Повысить нагрузку (занимаемся каждый день)',
          params: intensiveParams,
        },
      ],
    };
  }

  // Дедлайн актуален — обычный пересчёт
  return generatePlan(
    {
      startDate: today,
      deadline: currentPlan.deadline,
      studyDaysOfWeek: currentPlan.studyDaysOfWeek,
    },
    lessons,
    completedChapters
  );
}

/**
 * Get heuristic study time allocation for a chapter
 * @param {Object} chapter - Chapter data
 * @param {number} daysLeft - Days remaining in plan
 * @returns {Object} Time allocation percentages and tip
 */
function getHeuristicAdvice(chapter, daysLeft) {
  const vocabCount = chapter.words ? chapter.words.length : 0;
  const grammarCount = chapter.grammar
    ? Array.isArray(chapter.grammar)
      ? chapter.grammar.length
      : 1
    : 0;

  let words = 40;
  let grammar = 35;
  let reading = 15;
  let listening = 10;
  let tip = '';

  const avgVocab = 25;
  const avgGrammar = 5;

  if (vocabCount > avgVocab) {
    const boost = Math.min(10, Math.floor((vocabCount - avgVocab) / 3));
    words += boost;
    grammar -= Math.floor(boost * 0.6);
    reading -= Math.floor(boost * 0.4);
    tip = `Эта глава содержит ${vocabCount} слов — уделите больше внимания словарному запасу.`;
  } else if (grammarCount > avgGrammar) {
    const boost = Math.min(10, (grammarCount - avgGrammar) * 2);
    grammar += boost;
    words -= Math.floor(boost * 0.6);
    reading -= Math.floor(boost * 0.4);
    tip = `В главе ${grammarCount} грамматических правил — сконцентрируйтесь на грамматике.`;
  } else {
    tip = 'Глава сбалансирована. Придерживайтесь базового распределения времени.';
  }

  if (daysLeft !== undefined && daysLeft < 7) {
    listening = Math.max(5, listening - 5);
    reading += 5;
    tip += ' У вас мало времени — сосредоточьтесь на основах.';
  }

  return { words, grammar, reading, listening, tip };
}

/**
 * Устанавливает статус конкретной даты в сегменте плана.
 * Статус сохраняется в `seg.dateStatuses[dateKey]` и переживает перезагрузку.
 *
 * @param {Object} plan    - объект studyPlan
 * @param {string} dateKey - дата в формате YYYY-MM-DD
 * @param {'done'|'skipped'|'overdue'|'rescheduled'} status
 * @returns {boolean} true если сегмент найден и статус записан
 */
function markDateStatus(plan, dateKey, status) {
  const VALID = new Set(['done', 'skipped', 'overdue', 'rescheduled']);
  if (!VALID.has(status)) throw new Error(`[StudyPlan] Неверный статус даты: ${status}`);

  const seg = plan.segments.find((s) => {
    // Поддерживаем оба формата: новый assignedDates и устаревший диапазон
    if (s.assignedDates) return s.assignedDates.includes(dateKey);
    return dateKey >= s.startDate && dateKey <= s.endDate;
  });

  if (!seg) return false;
  if (!seg.dateStatuses) seg.dateStatuses = {};
  seg.dateStatuses[dateKey] = status;
  return true;
}

/**
 * Формирует контекст ежедневного плана с учётом FSRS-приоритетов и mastery.
 *
 * Приоритеты:
 *   1. due-повторения (много карточек просрочено → режим review_first)
 *   2. mastery текущей главы (< 40% → режим consolidate, замедлить новый материал)
 *   3. нет особых условий → normal
 *
 * @param {Object} plan       - текущий studyPlan
 * @param {Object} srsRecords - state.srs (все карточки)
 * @param {Object} masteryMap - { [itemId]: { score: number } } (state.masteryArchive)
 * @param {string} today      - YYYY-MM-DD (по умолчанию localDateKey())
 * @returns {Object} dailyContext
 */
function getDailyPlanContext(plan, srsRecords, masteryMap, today = localDateKey()) {
  const now = Date.now();

  // 1. FSRS: карточки, которые уже due
  const allDue = Object.values(srsRecords || {}).filter(
    (c) => !c.suspended && Number.isFinite(c.due) && c.due <= now
  );

  // 2. Активный сегмент плана на сегодня
  const activeSegment = plan.segments.find((s) => {
    if (s.assignedDates) return s.assignedDates.includes(today);
    return today >= s.startDate && today <= s.endDate;
  });

  // 3. Mastery текущей главы (из masteryArchive)
  let chapterMastery = null;
  if (activeSegment?.chapterId) {
    const prefix = `L${activeSegment.chapterId}_`;
    const chapterItems = Object.entries(masteryMap || {}).filter(([id]) => id.startsWith(prefix));
    if (chapterItems.length > 0) {
      const avgScore =
        chapterItems.reduce((s, [, m]) => s + (m?.score ?? 0), 0) / chapterItems.length;
      chapterMastery = { avgScore, itemCount: chapterItems.length };
    }
  }

  const dueCount = allDue.length;
  const shouldSlowDown = chapterMastery !== null && chapterMastery.avgScore < 40;

  // 4. Определяем рекомендуемый режим сессии
  let recommendedMode;
  if (dueCount > 10) {
    recommendedMode = 'review_first'; // сначала повторение накопившихся карточек
  } else if (shouldSlowDown) {
    recommendedMode = 'consolidate'; // закрепление без спешки с новым материалом
  } else {
    recommendedMode = 'normal';
  }

  return {
    today,
    activeSegment,
    dueCount,
    chapterMastery,
    shouldSlowDown,
    recommendedMode,
  };
}

export const StudyPlan = {
  generatePlan,
  recalcPlan,
  getHeuristicAdvice,
  markDateStatus,
  getDailyPlanContext,
};

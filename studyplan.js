/* studyplan.js — Study plan generator for Kitsune Genki */

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
    1: 1.5,  // Базовые структуры предложений
    2: 1.5,  // Указательные местоимения
    3: 1.5,  // Спряжение глаголов (критично)
    4: 1.0,  // Выражение наличия/местоположения
    5: 1.5,  // Прилагательные (базовая грамматика)
    6: 1.5,  // て-форма (ключевая форма)
    7: 1.0,  // Длительное состояние
    8: 1.5,  // Краткие формы (критично)
    9: 1.0,  // Прошедшее время кратких форм
    10: 1.0, // Сравнительные конструкции
    11: 0.7, // Выражение опыта
    12: 1.0  // Дополнительные конструкции
  };

  /**
   * Calculate weight of a chapter based on vocab count and grammar complexity
   * @param {Object} lesson - Chapter data
   * @returns {number} Weight value
   */
  function calculateChapterWeight(lesson) {
    const vocabCount = lesson.words ? lesson.words.length : 0;
    let grammarComplexity = 0;
    if (lesson.grammar) {
      if (Array.isArray(lesson.grammar)) {
        grammarComplexity = lesson.grammar.length;
        lesson.grammar.forEach(item => {
          if (typeof item === "string") grammarComplexity += item.length / 100;
          else if (item.text) grammarComplexity += item.text.length / 100;
        });
      } else if (typeof lesson.grammar === "string") {
        grammarComplexity = lesson.grammar.length / 100;
      }
    }
    
    // Базовый вес главы
    const baseWeight = WEIGHT_VOCAB * vocabCount + WEIGHT_GRAMMAR * grammarComplexity;
    
    // Применяем коэффициент важности главы
    const importanceMultiplier = CHAPTER_IMPORTANCE[lesson.id] || 1.0;
    
    return baseWeight * importanceMultiplier;
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);
    
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (daysOfWeek.includes(dayOfWeek)) {
        days.push(current.toISOString().slice(0, 10));
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

    const allocated = weights.map(w => Math.round(totalDays * w / sumWeights));
    
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
    const daysForChapters = availableDays - reviewDaysNeeded;
    
    if (daysForChapters < segments.length * MIN_DAYS_PER_CHAPTER) {
      return segments;
    }

    segments.forEach((seg, idx) => {
      result.push(seg);
      if ((idx + 1) % REVIEW_INTERVAL === 0 && idx < segments.length - 1) {
        result.push({ type: "review", days: 1 });
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

    segments.forEach(seg => {
      if (dayIndex >= studyDays.length) return;
      
      const startDate = studyDays[dayIndex];
      const endIndex = Math.min(dayIndex + seg.days - 1, studyDays.length - 1);
      const endDate = studyDays[endIndex];
      
      result.push({
        ...seg,
        startDate,
        endDate,
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
      return { error: "Необходимо указать deadline или totalDays" };
    }

    const start = new Date(startDate);
    if (!deadline && totalDays) {
      const end = new Date(start);
      let daysAdded = 0;
      while (daysAdded < totalDays) {
        end.setDate(end.getDate() + 1);
        if (studyDaysOfWeek.includes(end.getDay())) {
          daysAdded++;
        }
      }
      deadline = end.toISOString().slice(0, 10);
    }

    // Фильтруем главы: исключаем изученные
    const remainingLessons = lessons.filter(l => !completedChapters.includes(l.id));
    
    if (remainingLessons.length === 0) {
      return { error: "Все главы уже изучены! 🎓" };
    }

    const studyDays = getStudyDaysInRange(startDate, deadline, studyDaysOfWeek);
    
    if (studyDays.length < MIN_TOTAL_DAYS) {
      return { 
        error: `Слишком сжатый срок. Доступно ${studyDays.length} учебных дней, минимум ${MIN_TOTAL_DAYS}`,
        minDays: MIN_TOTAL_DAYS,
        availableDays: studyDays.length
      };
    }

    const weights = remainingLessons.map(calculateChapterWeight);
    const allocatedDays = distributeProportionally(remainingLessons, weights, studyDays.length);

    let segments = remainingLessons.map((lesson, idx) => ({
      type: "chapter",
      chapterId: lesson.id,
      days: allocatedDays[idx],
    }));

    segments = insertReviewDays(segments, studyDays.length);
    
    const finalDaysNeeded = segments.reduce((sum, seg) => sum + seg.days, 0);
    if (finalDaysNeeded > studyDays.length) {
      const diff = finalDaysNeeded - studyDays.length;
      for (let i = segments.length - 1; i >= 0 && diff > 0; i--) {
        if (segments[i].type === "review") {
          segments.splice(i, 1);
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
   * Recalculate plan from current date
   * @param {Object} currentPlan - Existing plan
   * @param {Array} lessons - Array of lesson data
   * @param {number[]} completedChapters - Updated completed chapters
   * @returns {Object} Recalculated plan
   */
  function recalcPlan(currentPlan, lessons, completedChapters) {
    const today = new Date().toISOString().slice(0, 10);
    
    const newParams = {
      startDate: today,
      deadline: currentPlan.deadline,
      studyDaysOfWeek: currentPlan.studyDaysOfWeek,
    };

    return generatePlan(newParams, lessons, completedChapters);
  }

  /**
   * Get heuristic study time allocation for a chapter
   * @param {Object} chapter - Chapter data
   * @param {number} daysLeft - Days remaining in plan
   * @returns {Object} Time allocation percentages and tip
   */
  function getHeuristicAdvice(chapter, daysLeft) {
    const vocabCount = chapter.words ? chapter.words.length : 0;
    const grammarCount = chapter.grammar ? 
      (Array.isArray(chapter.grammar) ? chapter.grammar.length : 1) : 0;

    let words = 40;
    let grammar = 35;
    let reading = 15;
    let listening = 10;
    let tip = "";

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
      tip = "Глава сбалансирована. Придерживайтесь базового распределения времени.";
    }

    if (daysLeft !== undefined && daysLeft < 7) {
      listening = Math.max(5, listening - 5);
      reading += 5;
      tip += " У вас мало времени — сосредоточьтесь на основах.";
    }

    return { words, grammar, reading, listening, tip };
  }

export const StudyPlan = {
  generatePlan,
  recalcPlan,
  getHeuristicAdvice,
};

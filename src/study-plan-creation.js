/* src/study-plan-creation.js — Unified Study Plan Content Catalog, Preview, and Commit Service */

import { addLocalDays, formatDateKey, getTodayDateKey, parseDateKey } from './local-date.js';
import { getStudyDateKeys, mergeUpdatedPlanWithHistory, StudyPlan } from '../studyplan.js';
import { completeOnboarding } from './onboarding-state.js';
import { ensureActiveChapterId } from './chapter-progress.js';
import { getBuiltInPracticeTasks } from './practice-tasks.js';

function dedupeById(tasks) {
  const map = new Map();
  for (const t of tasks) {
    if (t && t.id) {
      if (!map.has(t.id)) map.set(t.id, t);
    }
  }
  return Array.from(map.values());
}

export function buildStudyPlanContentCatalog(
  contentIndex = [],
  workbookData = null,
  settings = {}
) {
  const chaptersList = Array.isArray(contentIndex)
    ? contentIndex
    : Array.isArray(contentIndex?.chapters)
      ? contentIndex.chapters
      : [];

  const workbookMap =
    workbookData instanceof Map
      ? workbookData
      : Array.isArray(workbookData?.chapters)
        ? new Map(workbookData.chapters.map((ch) => [Number(ch.chapterId), ch.practice || []]))
        : new Map();

  const enabled = settings.enabled !== false;
  const includeCG = settings.includeConversationGrammar !== false;
  const includeRW = settings.includeReadingWriting !== false;

  const catalogChapters = chaptersList.map((chapter) => {
    const id = Number(chapter.id || chapter.lesson_id);
    const words = chapter.words || chapter.vocabulary || [];
    const notes = chapter.notes || chapter.grammar || [];

    const vocabCount = words.length || Number(chapter.vocabCount || 0);
    const grammarCount = notes.length || Number(chapter.grammarCount || 0);

    const vocabularyMinutes = vocabCount * 1;
    const grammarMinutes = grammarCount * 10;

    const builtInTasks = getBuiltInPracticeTasks(id);
    const builtInPracticeCount = builtInTasks.length;
    const builtInPracticeMinutes = builtInTasks.reduce(
      (sum, t) => sum + Number(t.estimatedMinutes || 10),
      0
    );

    const wbTasksFromMap = workbookMap.get(id) || [];
    const chPractice = chapter.practiceTasks || chapter.practice || [];
    const allWbCandidates = dedupeById([...wbTasksFromMap, ...chPractice]).filter(
      (t) => t && t.id !== 'dialog' && t.id !== 'listening' && t.id !== 'reading'
    );

    let workbookPracticeCount = 0;
    let workbookPracticeMinutes = 0;
    let recommendedPracticeCount = 0;
    let recommendedPracticeMinutes = 0;

    if (enabled && Array.isArray(allWbCandidates)) {
      for (const task of allWbCandidates) {
        const isRW = task.section === 'reading-writing';
        const isCG = task.section === 'conversation-grammar' || !task.section;

        const isTaskIncluded = (isCG && includeCG) || (isRW && includeRW);
        const isRequired = task.required !== false && task.requiredForChapterCompletion !== false;
        const estMin = Number(task.estimatedMinutes || 10);

        if (isTaskIncluded) {
          if (isRequired) {
            workbookPracticeCount += 1;
            workbookPracticeMinutes += estMin;
          } else {
            recommendedPracticeCount += 1;
            recommendedPracticeMinutes += estMin;
          }
        }
      }
    }

    const requiredPracticeCount = builtInPracticeCount + workbookPracticeCount;
    const requiredPracticeMinutes = builtInPracticeMinutes + workbookPracticeMinutes;

    const requiredTotalMinutes = vocabularyMinutes + grammarMinutes + requiredPracticeMinutes;
    const fullTotalMinutes = requiredTotalMinutes + recommendedPracticeMinutes;

    return {
      id,
      title: chapter.title || `Глава ${id}`,
      jp: chapter.jp || '',
      vocabCount,
      grammarCount,
      requiredPracticeCount,
      recommendedPracticeCount,
      vocabularyMinutes,
      grammarMinutes,
      requiredPracticeMinutes,
      builtInPracticeMinutes,
      workbookPracticeMinutes,
      recommendedPracticeMinutes,
      requiredTotalMinutes: Math.max(1, requiredTotalMinutes),
      fullTotalMinutes: Math.max(1, fullTotalMinutes),
      importanceWeight: Number(chapter.importanceWeight || chapter.importance_weight || 1),
    };
  });

  return { chapters: catalogChapters };
}

export function previewStudyPlanFromPreferences(preferences, catalog) {
  const errors = [];
  const warnings = [];
  const recommendations = [];

  const startDate = preferences?.startDate || getTodayDateKey();
  const today = getTodayDateKey();

  if (startDate < today && !preferences.allowPastDate) {
    errors.push('start-date-in-past');
  }

  const studyDays = (preferences?.studyDays || []).map(Number).filter((d) => d >= 0 && d <= 6);
  if (studyDays.length === 0) {
    errors.push('no-study-days-selected');
  }

  const dailyCapacityMinutes = Number(preferences?.dailyCapacityMinutes || 30);
  if (dailyCapacityMinutes <= 0) {
    errors.push('invalid-daily-capacity');
  }

  const priorKnowledgeIds = new Set(
    (preferences?.priorKnowledgeChapterIds || []).map(Number).filter((id) => id > 0)
  );

  const catalogChapters = Array.isArray(catalog?.chapters) ? catalog.chapters : [];
  const targetChapters = catalogChapters.filter((ch) => !priorKnowledgeIds.has(ch.id));

  if (targetChapters.length === 0) {
    errors.push('all-chapters-marked-as-known');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      feasible: false,
      errors,
      warnings,
      recommendations,
      previewPlan: null,
      estimatedCompletionDate: startDate,
      requiredStudyDays: 0,
      totalRequiredMinutes: 0,
      isTight: false,
      recommendedTargetDate: startDate,
    };
  }

  const totalRequiredMinutes = targetChapters.reduce((sum, ch) => sum + ch.requiredTotalMinutes, 0);

  // Резерв времени на повторения (FSRS): ~25% от дневного бюджета
  const reviewReserveMinutes = Math.min(15, Math.round(dailyCapacityMinutes * 0.25));
  const contentCapacityMinutes = Math.max(5, dailyCapacityMinutes - reviewReserveMinutes);

  const requiredStudyDays = Math.max(
    targetChapters.length,
    Math.ceil(totalRequiredMinutes / contentCapacityMinutes)
  );

  let targetStudyDaysCount = requiredStudyDays;
  let targetEndDate = null;

  if (preferences.targetType === 'deadline' && preferences.targetValue) {
    const endDateKey = preferences.targetValue;
    const availableStudyDates = getStudyDateKeys(startDate, 365, studyDays).filter(
      (d) => d <= endDateKey
    );
    targetStudyDaysCount = availableStudyDates.length;
    targetEndDate = endDateKey;
  } else if (preferences.targetType === 'days' && Number(preferences.targetValue) > 0) {
    targetStudyDaysCount = Number(preferences.targetValue);
  }

  const isTight = targetStudyDaysCount < requiredStudyDays;

  // Рассчитываем рекомендуемую дату дедлайна
  const recommendedStudyDates = getStudyDateKeys(startDate, requiredStudyDays, studyDays);
  const recommendedTargetDate = recommendedStudyDates.at(-1) || startDate;

  if (isTight) {
    warnings.push(
      `Указанный срок (${targetStudyDaysCount} учебных дней) меньше минимально необходимого (${requiredStudyDays} дней).`
    );

    recommendations.push({
      type: 'extend-deadline',
      label: `Продлить дедлайн до ${recommendedTargetDate}`,
      recommendedDate: recommendedTargetDate,
    });
    if (studyDays.length < 7) {
      recommendations.push({
        type: 'add-study-day',
        label: 'Добавить учебный день недели',
        studyDays: [1, 2, 3, 4, 5, 6, 0],
      });
    }
    if (dailyCapacityMinutes < 60) {
      recommendations.push({
        type: 'increase-time',
        label: 'Увеличить дневное время до 45 мин',
        dailyCapacityMinutes: 45,
      });
    }
    if (preferences.workbookSettings?.includeReadingWriting !== false) {
      recommendations.push({
        type: 'disable-rw',
        label: 'Отключить Workbook Чтение и Письмо',
        workbookSettings: {
          ...(preferences.workbookSettings || {}),
          includeReadingWriting: false,
        },
      });
    }
    if (preferences.workbookSettings?.enabled !== false) {
      recommendations.push({
        type: 'disable-workbook',
        label: 'Полностью отключить Workbook',
        workbookSettings: {
          ...(preferences.workbookSettings || {}),
          enabled: false,
        },
      });
    }
  }

  const actualDaysToSchedule = Math.max(requiredStudyDays, targetStudyDaysCount);
  const scheduledDates = getStudyDateKeys(startDate, actualDaysToSchedule, studyDays);

  const previewPlan = StudyPlan.generatePlan(
    {
      startDate,
      deadline: scheduledDates.at(-1) || startDate,
      studyDaysOfWeek: studyDays,
    },
    targetChapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      vocabCount: ch.vocabCount,
      grammarCount: ch.grammarCount,
      requiredTotalMinutes: ch.requiredTotalMinutes,
      estimatedMinutes: ch.requiredTotalMinutes,
      importanceWeight: ch.importanceWeight,
    })),
    [...priorKnowledgeIds]
  );

  const isFeasible = !isTight || Boolean(preferences.acceptRecommendedDeadline);

  return {
    valid: true,
    feasible: isFeasible,
    errors: [],
    warnings,
    recommendations,
    previewPlan,
    estimatedCompletionDate: scheduledDates.at(-1) || startDate,
    requiredStudyDays,
    totalRequiredMinutes,
    contentCapacityMinutes,
    catalogChapters,
    recommendedTargetDate,
    isTight,
  };
}

export function createStudyPlanFromPreferences(state, preferences, previewResult) {
  return commitStudyPlanFromPreferences(state, preferences, previewResult, { mode: 'create' });
}

export function updateStudyPlanFromPreferences(state, preferences, previewResult, options = {}) {
  return commitStudyPlanFromPreferences(state, preferences, previewResult, {
    mode: 'update',
    ...options,
  });
}

export function commitStudyPlanFromPreferences(state, preferences, previewResult, options = {}) {
  if (!state || !previewResult || !previewResult.valid || !previewResult.previewPlan) {
    return { success: false, error: 'invalid-preview-result' };
  }

  if (previewResult.isTight && !previewResult.feasible && !preferences.acceptRecommendedDeadline) {
    return { success: false, error: 'target-deadline-too-tight' };
  }

  const isUpdate = options.mode === 'update' || options.source === 'plan-settings';

  const priorKnowledgeChapterIds = [
    ...new Set(
      (preferences?.priorKnowledgeChapterIds || [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ].sort((a, b) => a - b);

  state.priorKnowledgeChapterIds = priorKnowledgeChapterIds;
  state.dailyCapacityMinutes = Number(preferences?.dailyCapacityMinutes || 30);
  state.workbookSettings = {
    enabled: preferences?.workbookSettings?.enabled !== false,
    includeConversationGrammar: preferences?.workbookSettings?.includeConversationGrammar !== false,
    includeReadingWriting: preferences?.workbookSettings?.includeReadingWriting !== false,
  };

  if (isUpdate && state.studyPlan) {
    state.studyPlan = mergeUpdatedPlanWithHistory(state.studyPlan, previewResult.previewPlan, {
      today: getTodayDateKey(),
    });
  } else {
    state.studyPlan = previewResult.previewPlan;
  }

  state.dailyPlan = null;

  const catalogChapters = previewResult.catalogChapters || [];
  ensureActiveChapterId(state, catalogChapters);

  if (!isUpdate) {
    completeOnboarding(state);
  }

  return {
    success: true,
    activeChapterId: state.activeChapterId,
    studyPlan: state.studyPlan,
  };
}

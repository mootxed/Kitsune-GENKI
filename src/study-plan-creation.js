/* src/study-plan-creation.js — Unified Study Plan Content Catalog, Preview, and Commit Service */

import { addLocalDays, formatDateKey, getTodayDateKey, parseDateKey } from './local-date.js';
import { getStudyDateKeys } from '../studyplan.js';
import { StudyPlan } from '../studyplan.js';
import { completeOnboarding } from './onboarding-state.js';
import { ensureActiveChapterId } from './chapter-progress.js';

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

    const workbookTasks = workbookMap.get(id) || chapter.practiceTasks || chapter.practice || [];

    let requiredPracticeCount = 0;
    let recommendedPracticeCount = 0;
    let requiredPracticeMinutes = 0;
    let recommendedPracticeMinutes = 0;

    if (enabled && Array.isArray(workbookTasks)) {
      for (const task of workbookTasks) {
        const isRW = task.section === 'reading-writing';
        const isCG = task.section === 'conversation-grammar' || !task.section;

        const isTaskIncluded = (isCG && includeCG) || (isRW && includeRW);

        const isRequired = task.required !== false && task.requiredForChapterCompletion !== false;
        const estMin = Number(task.estimatedMinutes || 10);

        if (isTaskIncluded) {
          if (isRequired) {
            requiredPracticeCount += 1;
            requiredPracticeMinutes += estMin;
          } else {
            recommendedPracticeCount += 1;
            recommendedPracticeMinutes += estMin;
          }
        }
      }
    }

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
      errors,
      warnings,
      recommendations,
      previewPlan: null,
      estimatedCompletionDate: null,
      requiredStudyDays: 0,
      totalRequiredMinutes: 0,
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
      id: 'extend-deadline',
      type: 'extend-deadline',
      label: `Продлить срок до ${recommendedTargetDate}`,
      recommendedDate: recommendedTargetDate,
    });

    if (!studyDays.includes(6)) {
      const extraDays = [...new Set([...studyDays, 6])].sort();
      const withSatDates = getStudyDateKeys(startDate, requiredStudyDays, extraDays);
      recommendations.push({
        id: 'add-saturday',
        type: 'add-saturday',
        label: `Заниматься дополнительно по субботам (финиш ~${withSatDates.at(-1)})`,
        studyDays: extraDays,
      });
    }

    if (dailyCapacityMinutes < 60) {
      const nextCap = dailyCapacityMinutes + 15;
      const nextContentCap = Math.max(5, nextCap - Math.min(15, Math.round(nextCap * 0.25)));
      const nextReqDays = Math.max(
        targetChapters.length,
        Math.ceil(totalRequiredMinutes / nextContentCap)
      );
      const nextDates = getStudyDateKeys(startDate, nextReqDays, studyDays);
      recommendations.push({
        id: 'increase-time',
        type: 'increase-time',
        label: `Увеличить дневную нагрузку до ${nextCap} минут (финиш ~${nextDates.at(-1)})`,
        dailyCapacityMinutes: nextCap,
      });
    }

    if (preferences.workbookSettings?.includeReadingWriting !== false) {
      recommendations.push({
        id: 'disable-rw',
        type: 'disable-rw',
        label: 'Отключить необязательный раздел чтения и письма в Workbook',
        workbookSettings: {
          ...(preferences.workbookSettings || {}),
          includeReadingWriting: false,
        },
      });
    }
  }

  // Генерируем план через канонический StudyPlan.generatePlan
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
      estimatedMinutes: ch.requiredTotalMinutes,
      importanceWeight: ch.importanceWeight,
    })),
    [...priorKnowledgeIds]
  );

  return {
    valid: true,
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
  };
}

export function commitStudyPlanFromPreferences(state, preferences, previewResult) {
  if (!state || !previewResult || !previewResult.valid || !previewResult.previewPlan) {
    return { success: false, error: 'invalid-preview-result' };
  }

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

  state.studyPlan = previewResult.previewPlan;
  state.dailyPlan = null;

  const catalogChapters = previewResult.catalogChapters || [];
  ensureActiveChapterId(state, catalogChapters);

  completeOnboarding(state);

  return {
    success: true,
    activeChapterId: state.activeChapterId,
    studyPlan: state.studyPlan,
  };
}

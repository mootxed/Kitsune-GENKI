const EMPTY_OBJECT_FIELDS = [
  'lessonProgress',
  'vocabularyUnlocks',
  'grammarUnlocks',
  'grammarProgress',
  'practiceUnlocks',
];

export function createEmptyCourseProgress(courseId, courseVersion = null) {
  return {
    courseId,
    courseVersion,
    lessonIds: [],
    currentLessonId: null,
    lessonProgress: {},
    priorKnowledgeLessonIds: [],
    learningEvents: [],
    vocabularyUnlocks: {},
    grammarUnlocks: {},
    grammarProgress: {},
    practiceUnlocks: {},
    dailyPlan: null,
    dailyPlanHistory: [],
    studyPlan: null,
    exerciseSettings: {
      enabled: true,
      includeConversationGrammar: true,
      includeReadingWriting: true,
    },
  };
}

function normalizeCourseProgress(progress, courseId, courseVersion = null) {
  const normalized = {
    ...createEmptyCourseProgress(courseId, courseVersion),
    ...(progress || {}),
    courseId,
    courseVersion: progress?.courseVersion || courseVersion || null,
  };
  for (const field of EMPTY_OBJECT_FIELDS) {
    normalized[field] =
      normalized[field] && typeof normalized[field] === 'object' ? normalized[field] : {};
  }
  normalized.priorKnowledgeLessonIds = Array.isArray(normalized.priorKnowledgeLessonIds)
    ? normalized.priorKnowledgeLessonIds
    : [];
  normalized.lessonIds = Array.isArray(normalized.lessonIds) ? normalized.lessonIds : [];
  normalized.learningEvents = Array.isArray(normalized.learningEvents)
    ? normalized.learningEvents
    : [];
  normalized.dailyPlanHistory = Array.isArray(normalized.dailyPlanHistory)
    ? normalized.dailyPlanHistory
    : [];
  normalized.exerciseSettings = {
    ...createEmptyCourseProgress(courseId).exerciseSettings,
    ...(normalized.exerciseSettings || {}),
  };
  return normalized;
}

export function syncActiveCourseProgress(appState) {
  const courseId = appState?.activeCourseId;
  if (!appState || !courseId) return null;
  appState.courses =
    appState.courses && typeof appState.courses === 'object' ? appState.courses : {};
  const progress = normalizeCourseProgress(appState.courses[courseId], courseId);

  progress.currentLessonId = appState.activeChapterId ?? progress.currentLessonId ?? null;
  progress.lessonProgress = appState.chapters || progress.lessonProgress;
  progress.priorKnowledgeLessonIds =
    appState.priorKnowledgeChapterIds || progress.priorKnowledgeLessonIds;
  progress.learningEvents = appState.learningEvents || progress.learningEvents;
  progress.vocabularyUnlocks = appState.vocabularyUnlocks || progress.vocabularyUnlocks;
  progress.grammarUnlocks = appState.grammarUnlocks || progress.grammarUnlocks;
  progress.grammarProgress = appState.grammarProgress || progress.grammarProgress;
  progress.practiceUnlocks = appState.practiceUnlocks || progress.practiceUnlocks;
  progress.dailyPlan = appState.dailyPlan ?? progress.dailyPlan;
  progress.dailyPlanHistory = appState.dailyPlanHistory || progress.dailyPlanHistory;
  progress.studyPlan = appState.studyPlan ?? progress.studyPlan;
  progress.exerciseSettings = appState.workbookSettings || progress.exerciseSettings;
  appState.courses[courseId] = progress;
  return progress;
}

export function bindActiveCourseProgress(appState, courseId, courseVersion = null) {
  if (!appState || !courseId) throw new Error('[CourseState] appState and courseId are required');
  if (appState.activeCourseId && appState.activeCourseId !== courseId) {
    syncActiveCourseProgress(appState);
  }
  appState.courses =
    appState.courses && typeof appState.courses === 'object' ? appState.courses : {};
  const progress = normalizeCourseProgress(appState.courses[courseId], courseId, courseVersion);
  appState.courses[courseId] = progress;
  appState.activeCourseId = courseId;

  // Existing domain modules consume these fields as the active-course projection.
  // They are rebound to the canonical course progress after every load/switch.
  appState.activeChapterId = progress.currentLessonId;
  appState.chapters = progress.lessonProgress;
  appState.priorKnowledgeChapterIds = progress.priorKnowledgeLessonIds;
  appState.learningEvents = progress.learningEvents;
  appState.vocabularyUnlocks = progress.vocabularyUnlocks;
  appState.grammarUnlocks = progress.grammarUnlocks;
  appState.grammarProgress = progress.grammarProgress;
  appState.practiceUnlocks = progress.practiceUnlocks;
  appState.dailyPlan = progress.dailyPlan;
  appState.dailyPlanHistory = progress.dailyPlanHistory;
  appState.studyPlan = progress.studyPlan;
  appState.workbookSettings = progress.exerciseSettings;
  return progress;
}

export function switchActiveCourse(appState, courseId, courseVersion = null) {
  if (appState?.activeCourseId === courseId) {
    syncActiveCourseProgress(appState);
  }
  return bindActiveCourseProgress(appState, courseId, courseVersion);
}

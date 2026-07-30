/* src/practice-tasks.js — Pure rules and builders for practice tasks */
import { contentId } from './courses/course-contract.js';
import { getActiveCourse } from './courses/course-context.js';

export function normalizePracticeTask(task, chapterId, idx = 0) {
  const chId = chapterId;
  return {
    id: String(task.id || `${chId}:exercise-${idx + 1}`),
    localId: task.localId || task.id || `exercise-${idx + 1}`,
    courseId: task.courseId || getActiveCourse()?.id || null,
    chapterId: chId,
    lessonId: chId,
    type: task.type || 'workbook',
    section: task.section || null,
    source: task.source || (task.type === 'workbook' ? 'Рабочая тетрадь курса' : 'Материалы курса'),
    page: typeof task.page === 'number' ? task.page : null,
    exercise: task.exercise || null,
    title: task.title || task.exercise || `Задание ${idx + 1}`,
    description: task.description || '',
    relatedGrammarIds: Array.isArray(task.relatedGrammarIds) ? task.relatedGrammarIds : [],
    estimatedMinutes: Number(task.estimatedMinutes) || 10,
    required: task.required !== false,
    requiredForChapterCompletion:
      task.requiredForChapterCompletion ??
      (task.required !== false && task.section !== 'reading-writing'),
    recommended:
      task.recommended ?? (task.required === false || task.section === 'reading-writing'),
    completionMode: task.completionMode || 'manual',
  };
}

export function getBuiltInPracticeTasks(chapterId) {
  const chId = chapterId;
  const course = getActiveCourse();
  const summary = course?.getLessonSummary(chId);
  const lessonLocalId = summary?.localId ?? (summary ? summary.order + 1 : String(chId));
  const makeId = (kind) =>
    course ? contentId(course.id, 'exercise', `${lessonLocalId}:${kind}`) : kind;
  return [
    {
      id: makeId('dialog'),
      localId: 'dialog',
      type: 'dialog',
      source: 'Материалы курса',
      title: 'Диалог',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
      requiredForChapterCompletion: true,
      completionMode: 'interactive',
      chapterId: chId,
    },
    {
      id: makeId('listening'),
      localId: 'listening',
      type: 'listening',
      source: 'Аудио курса',
      title: 'Аудирование',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
      requiredForChapterCompletion: true,
      completionMode: 'interactive',
      chapterId: chId,
    },
    {
      id: makeId('reading'),
      localId: 'reading',
      type: 'reading',
      source: 'Материалы курса',
      title: 'Чтение',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
      requiredForChapterCompletion: true,
      completionMode: 'interactive',
      chapterId: chId,
    },
  ];
}

export function getNormalizedChapterPracticeTasks(chapterMeta) {
  const chapterId = chapterMeta?.lesson_id || chapterMeta?.id || null;
  const workbookTasks = Array.isArray(chapterMeta?.practice)
    ? chapterMeta.practice.map((item, idx) => normalizePracticeTask(item, chapterId, idx))
    : [];
  const builtInTasks = getBuiltInPracticeTasks(chapterId);
  const seen = new Set(workbookTasks.map((task) => task.id));
  return [...workbookTasks, ...builtInTasks.filter((task) => !seen.has(task.id))];
}

export function isPracticeTaskEnabled(task, workbookSettings = {}) {
  if (!task) return false;
  if (task.type !== 'workbook') {
    return true; // Built-in practice tasks are always available regardless of Workbook settings
  }
  const enabled = workbookSettings?.enabled !== false;
  if (!enabled) return false;

  const includeCG = workbookSettings?.includeConversationGrammar !== false;
  const includeRW = workbookSettings?.includeReadingWriting !== false;

  if (task.section === 'conversation-grammar') return includeCG;
  if (task.section === 'reading-writing') return includeRW;
  return includeCG;
}

export function isPracticeTaskRequired(task, workbookSettings = {}) {
  if (!isPracticeTaskEnabled(task, workbookSettings)) return false;
  if (task.type !== 'workbook') return true;
  return task.required !== false && task.requiredForChapterCompletion !== false;
}

export function getEnabledChapterPracticeTasks(chapterMeta, workbookSettings = {}) {
  const allTasks = getNormalizedChapterPracticeTasks(chapterMeta);
  return allTasks.filter((task) => isPracticeTaskEnabled(task, workbookSettings));
}

export function getRequiredChapterPracticeTasks(chapterMeta, workbookSettings = {}) {
  const allTasks = getNormalizedChapterPracticeTasks(chapterMeta);
  return allTasks.filter((task) => isPracticeTaskRequired(task, workbookSettings));
}

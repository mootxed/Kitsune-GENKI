export function normalizePracticeTask(task, chapterId, idx = 0) {
  const chId = Number(chapterId);
  return {
    id: String(task.id || `L${chId}_p${idx + 1}`),
    type: task.type || 'workbook',
    section: task.section || null,
    source: task.source || (task.type === 'workbook' ? 'GENKI Workbook' : 'GENKI Textbook'),
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

export function getNormalizedChapterPracticeTasks(chapterMeta) {
  const chapterId = Number(chapterMeta?.lesson_id || chapterMeta?.id || 0);
  const workbookTasks = Array.isArray(chapterMeta?.practice)
    ? chapterMeta.practice.map((item, idx) => normalizePracticeTask(item, chapterId, idx))
    : [];
  const builtInTasks = [
    {
      id: 'dialog',
      type: 'dialog',
      source: 'GENKI Textbook',
      title: 'Диалог',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
      requiredForChapterCompletion: true,
      completionMode: 'interactive',
    },
    {
      id: 'listening',
      type: 'listening',
      source: 'GENKI Audio',
      title: 'Аудирование',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
      requiredForChapterCompletion: true,
      completionMode: 'interactive',
    },
    {
      id: 'reading',
      type: 'reading',
      source: 'GENKI Textbook',
      title: 'Чтение',
      page: null,
      exercise: null,
      relatedGrammarIds: [],
      estimatedMinutes: 10,
      required: true,
      requiredForChapterCompletion: true,
      completionMode: 'interactive',
    },
  ];
  const seen = new Set(workbookTasks.map((task) => task.id));
  return [...workbookTasks, ...builtInTasks.filter((task) => !seen.has(task.id))];
}

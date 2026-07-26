import { normalizePracticeTask } from './practice-tasks.js';

const asArray = (value) =>
  Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];

export function normalizeChapterContent(rawLesson, workbookMetadata = [], options = {}) {
  const id = Number(rawLesson?.id || rawLesson?.lesson_id);
  const configuredName = options.chapterNames?.[id];
  const title = configuredName?.[0] || rawLesson?.title || `Глава ${id}`;
  const normalizeWord = options.normalizeWord || ((word) => word);
  const grammarTopics = asArray(rawLesson?.notes || rawLesson?.grammar).map((note, index) => {
    const noteId = note.note_id ?? index + 1;
    return {
      id: String(note.id || `L${id}_g${noteId}`),
      note_id: noteId,
      title: note.title || `Тема ${index + 1}`,
      content: note.content || '',
      order: Number(note.order) || index + 1,
      estimatedMinutes: Number(note.estimatedMinutes) || 10,
    };
  });
  const practiceTasks = asArray(workbookMetadata).map((task, index) =>
    normalizePracticeTask(task, id, index)
  );

  return {
    id,
    lesson_id: id,
    title,
    jp: configuredName?.[1] || rawLesson?.jp || '',
    particles: asArray(rawLesson?.particles),
    words: asArray(rawLesson?.vocabulary || rawLesson?.words).map((word) =>
      normalizeWord(word, id)
    ),
    grammarTopics,
    grammar: grammarTopics,
    notes: grammarTopics,
    practiceTasks,
    practice: practiceTasks,
    cultural: asArray(rawLesson?.cultural_notes || rawLesson?.cultural),
    estimatedMinutes: Number(rawLesson?.estimatedMinutes) || null,
  };
}

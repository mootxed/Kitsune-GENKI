/* src/chapter-content-model.js — Low-level pure models for chapter grammar & practice tasks */

import { getNormalizedChapterPracticeTasks } from './practice-tasks.js';
import { canonicalLessonId } from './courses/course-context.js';

export function normalizedChapterId(value) {
  return value == null || value === '' ? null : canonicalLessonId(value);
}

export function getChapterGrammarTopics(chapterMeta) {
  if (!chapterMeta) return [];
  const rawNotes = Array.isArray(chapterMeta.notes)
    ? chapterMeta.notes
    : Array.isArray(chapterMeta.grammar)
      ? chapterMeta.grammar
      : [];
  const chapterId = normalizedChapterId(chapterMeta.lesson_id || chapterMeta.id);

  return rawNotes.map((note, index) => {
    const noteId = note.noteId ?? note.note_id ?? index + 1;
    const id =
      note.id ||
      note.key ||
      (noteId ? `${chapterId}:grammar-${noteId}` : `${chapterId}:grammar-${index + 1}`);
    return {
      id: String(id),
      localId: note.localId || note.id || `grammar-${noteId}`,
      courseId: note.courseId || chapterMeta.courseId || null,
      introducedIn: note.introducedIn || chapterId,
      noteId: Number(noteId) || noteId,
      title: note.title || `Тема ${index + 1}`,
      content: note.content || '',
      order: index + 1,
      chapterId,
      estimatedMinutes: Number(note.estimatedMinutes) || 10,

      subtitle: note.subtitle || '',
      summary: note.summary || '',
      formula: note.formula || '',
      explanation: note.explanation || null,
      examples: Array.isArray(note.examples) ? note.examples : [],
      requiredVocabularyIds: Array.isArray(note.requiredVocabularyIds)
        ? note.requiredVocabularyIds
        : [],
      prerequisiteGrammarIds: Array.isArray(note.prerequisiteGrammarIds)
        ? note.prerequisiteGrammarIds
        : [],
      quiz: Array.isArray(note.quiz) ? note.quiz : null,
      kind:
        note.kind ||
        (Array.isArray(note.quiz) && note.quiz.length > 0 ? 'core-grammar' : 'usage-note'),
      workbookReference: note.workbookReference || null,
    };
  });
}

export function getChapterPracticeTasks(chapterMeta) {
  return getNormalizedChapterPracticeTasks(chapterMeta);
}

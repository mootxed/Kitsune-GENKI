/* src/chapter-content-model.js — Low-level pure models for chapter grammar & practice tasks */

import { getNormalizedChapterPracticeTasks } from './practice-tasks.js';

export function normalizedChapterId(value) {
  const chapterId = Number(value);
  return Number.isInteger(chapterId) && chapterId > 0 ? chapterId : null;
}

export function getChapterGrammarTopics(chapterMeta) {
  if (!chapterMeta) return [];
  const rawNotes = Array.isArray(chapterMeta.notes)
    ? chapterMeta.notes
    : Array.isArray(chapterMeta.grammar)
      ? chapterMeta.grammar
      : [];
  const chapterId = Number(chapterMeta.lesson_id || chapterMeta.id || 0);

  return rawNotes.map((note, index) => {
    const noteId = note.noteId ?? note.note_id ?? index + 1;
    const id =
      note.id || note.key || (noteId ? `L${chapterId}_g${noteId}` : `L${chapterId}_g${index + 1}`);
    return {
      id: String(id),
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
      workbookReference: note.workbookReference || null,
    };
  });
}

export function getChapterPracticeTasks(chapterMeta) {
  return getNormalizedChapterPracticeTasks(chapterMeta);
}

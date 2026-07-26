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
    const id =
      note.id ||
      note.key ||
      (note.note_id ? `L${chapterId}_g${note.note_id}` : `L${chapterId}_g${index + 1}`);
    return {
      id: String(id),
      title: note.title || `Тема ${index + 1}`,
      content: note.content || '',
      order: index + 1,
      chapterId,
      estimatedMinutes: Number(note.estimatedMinutes) || 10,
    };
  });
}

export function getChapterPracticeTasks(chapterMeta) {
  return getNormalizedChapterPracticeTasks(chapterMeta);
}

/* src/srs-helpers.js — pure queries over SRS records */
import { SRS } from '../srs.js';

export function cardChapter(cardId) {
  const m = /^L(\d+)_/.exec(cardId);
  return m ? parseInt(m[1], 10) : null;
}

export function wordById(wordId, lessons) {
  for (const l of lessons) {
    const w = l.words.find((x) => x.id === wordId);
    if (w) return w;
  }
  return null;
}

export function isWordUnlocked(wordId, chapters) {
  const chapterId = cardChapter(wordId);
  if (!chapterId) return true;
  const chapter = chapters[chapterId];
  if (!chapter) return false;

  const completedLessons = Object.values(chapter.checklist || {}).filter(
    (val) => val === true
  ).length;
  return completedLessons >= 3;
}

export function dueCards(srsRecords, chapterId, now = Date.now()) {
  const seen = new Set();
  return Object.values(srsRecords).filter((c) => {
    if (chapterId && cardChapter(c.id) !== chapterId) return false;
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return SRS.isDue(c, now);
  });
}

export function allCards(srsRecords, chapterId) {
  return Object.values(srsRecords).filter((c) => !chapterId || cardChapter(c.id) === chapterId);
}

export function getUnlockedParticles(chapters, lessons) {
  const particles = new Set();

  lessons.forEach((lesson, idx) => {
    const chapterId = idx + 1;
    const chapter = chapters[chapterId];

    // Проверяем, что урок разблокирован (>=3 выполненных заданий)
    if (chapter) {
      const completedLessons = Object.values(chapter.checklist || {}).filter(
        (val) => val === true
      ).length;

      if (completedLessons >= 3 && lesson.particles) {
        lesson.particles.forEach((p) => particles.add(p));
      }
    }
  });

  return Array.from(particles);
}

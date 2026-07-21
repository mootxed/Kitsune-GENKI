/* src/srs-helpers.js — pure queries over SRS records */
import { SRS } from '../srs.js';

export function cardChapter(cardId) {
  const m = /^L(\d+)_/.exec(cardId);
  return m ? parseInt(m[1], 10) : null;
}

export function wordById(wordId, lessons) {
  if (!lessons || lessons.length === 0) {
    console.warn(`[wordById] lessons array is empty or null for wordId: ${wordId}`);
    return null;
  }

  for (const l of lessons) {
    // Поддерживаем оба формата: words и vocabulary
    const wordList = l.words || l.vocabulary || [];
    const w = wordList.find((x) => x.id === wordId);
    if (w) return w;
  }

  console.warn(`[wordById] Word not found: ${wordId}. Lessons count: ${lessons.length}`);
  return null;
}

export function isWordUnlocked(wordId, chapters) {
  const chapterId = cardChapter(wordId);
  if (!chapterId) return true;
  const chapter = chapters[chapterId];
  if (!chapter) return false;

  // Слова разблокированы, если глава начата
  return chapter.started === true;
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

    // Частицы разблокированы, если глава начата
    if (chapter && chapter.started) {
      // Поддерживаем оба формата: particles в корне урока или в lesson
      const particleList = lesson.particles || (lesson.lesson && lesson.lesson.particles) || [];
      if (particleList.length > 0) {
        particleList.forEach((p) => particles.add(p));
      }
    }
  });

  return Array.from(particles);
}

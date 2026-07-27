/* src/content-loader.js — Ленивая загрузка контента глав (уроки + истории + грамматика) */

// In-memory кэши: не дёргаем сеть повторно за уже загруженными чанками
import {
  clearSupplementalPracticeCache,
  getSupplementalPracticeForChapter,
} from './supplemental-practice.js';
import { clearGrammarQuizCache, getGrammarQuizForChapter } from './grammar-quiz-content.js';

let indexPromise = null;
const chapterPromises = new Map(); // chapterId -> Promise<{ lesson, story }>

const pad = (n) => String(n).padStart(2, '0');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Лёгкий индекс: список глав и метаданные историй без полного контента
export function loadContentIndex() {
  if (!indexPromise) {
    indexPromise = fetchJson('data/content-index.json').catch((err) => {
      indexPromise = null; // даём шанс повторить при следующем вызове
      throw err;
    });
  }
  return indexPromise;
}

// Динамическая загрузка контента конкретной главы по требованию
export function loadChapterData(chapterId) {
  const id = Number(chapterId);
  if (!chapterPromises.has(id)) {
    const promise = (async () => {
      const [lessonRes, storyRes, workbookRes, quizRes] = await Promise.allSettled([
        fetchJson(`data/lessons/lesson-${pad(id)}.json`),
        fetchJson(`data/stories/story-${pad(id)}.json`),
        getSupplementalPracticeForChapter(id),
        getGrammarQuizForChapter(id),
      ]);
      if (lessonRes.status === 'rejected') {
        chapterPromises.delete(id);
        throw lessonRes.reason;
      }
      // История может отсутствовать для главы — это нормально
      const story = storyRes.status === 'fulfilled' ? storyRes.value : null;
      if (workbookRes.status === 'rejected') {
        console.warn(
          '[Content] Workbook metadata недоступны, используется fallback:',
          workbookRes.reason
        );
      }
      if (quizRes.status === 'rejected') {
        console.warn('[Content] Grammar Quiz data недоступны:', quizRes.reason);
      }

      const quizData = quizRes.status === 'fulfilled' ? quizRes.value : null;
      const rawLesson = lessonRes.value.lesson;
      const rawNotes = rawLesson.notes || rawLesson.grammar || [];

      const mergedNotes = rawNotes.map((note, idx) => {
        const noteId = note.noteId ?? note.note_id ?? idx + 1;
        const topicId = String(note.id || `L${id}_g${noteId}`);
        const quizTopic = quizData?.topics?.find(
          (qt) => String(qt.id) === topicId || Number(qt.noteId) === Number(noteId)
        );
        if (quizTopic) {
          return {
            ...note,
            ...quizTopic,
          };
        }
        return note;
      });

      return {
        lesson: {
          ...rawLesson,
          notes: mergedNotes,
          grammar: mergedNotes,
          practice: workbookRes.status === 'fulfilled' ? workbookRes.value : [],
        },
        version: lessonRes.value.version,
        story,
      };
    })();
    chapterPromises.set(id, promise);
  }
  return chapterPromises.get(id);
}

// Сброс кэшей (для тестов и принудительного обновления)
export function clearContentCache() {
  indexPromise = null;
  chapterPromises.clear();
  clearSupplementalPracticeCache();
  clearGrammarQuizCache();
}

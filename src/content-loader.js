/* src/content-loader.js — Ленивая загрузка контента глав (уроки + истории) */

// In-memory кэши: не дёргаем сеть повторно за уже загруженными чанками
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
      const [lessonRes, storyRes] = await Promise.allSettled([
        fetchJson(`data/lessons/lesson-${pad(id)}.json`),
        fetchJson(`data/stories/story-${pad(id)}.json`),
      ]);
      if (lessonRes.status === 'rejected') {
        chapterPromises.delete(id);
        throw lessonRes.reason;
      }
      // История может отсутствовать для главы — это нормально
      const story = storyRes.status === 'fulfilled' ? storyRes.value : null;
      return { lesson: lessonRes.value.lesson, version: lessonRes.value.version, story };
    })();
    chapterPromises.set(id, promise);
  }
  return chapterPromises.get(id);
}

// Сброс кэшей (для тестов и принудительного обновления)
export function clearContentCache() {
  indexPromise = null;
  chapterPromises.clear();
}

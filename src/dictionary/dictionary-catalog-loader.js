/* src/dictionary/dictionary-catalog-loader.js — Optimized Dictionary Catalog Loader */
import { dictionaryStore } from './dictionary-store.js';

const catalogCache = new Map();

function normalizeCatalogWord(w, defaultLessonId = null) {
  if (!w) return null;
  const writtenForm = w.writtenForm || w.kanji || w.writing || w.dictionaryForm || '';
  const reading = w.reading || w.writing || writtenForm;
  const writing = w.writing || reading;
  const translation =
    w.translation ||
    w.meaning ||
    w.courseMeaning ||
    (Array.isArray(w.meanings) ? w.meanings[0] : '') ||
    '';
  const lessonId =
    w.lessonId ??
    w.introducedIn ??
    w.chapterId ??
    (Array.isArray(w.lessonIds) ? w.lessonIds[0] : defaultLessonId);
  const lessonIds =
    Array.isArray(w.lessonIds) && w.lessonIds.length > 0
      ? w.lessonIds
      : lessonId != null
        ? [lessonId]
        : [];
  const lexemeId = w.lexemeId || w.dictionaryId || w.id || '';
  const topic = w.topic || null;
  const partOfSpeech = w.partOfSpeech || '';
  const adjectiveClass = w.adjectiveClass || '';

  return {
    ...w,
    id: w.id || lexemeId,
    writing,
    writtenForm,
    kanji: w.kanji || writtenForm,
    reading,
    translation,
    meaning: translation,
    lessonId,
    lessonIds,
    lexemeId,
    topic,
    partOfSpeech,
    adjectiveClass,
  };
}

/**
 * Ensures dictionary catalog data is loaded efficiently for the dictionary view
 * without triggering story downloads, token resolution, or heavy index rebuilds.
 *
 * @param {Object} options
 * @param {AbortSignal} [options.signal]
 * @param {string} [options.courseId]
 * @param {Array} [options.contentIndex]
 * @param {Array} [options.loadedLessons]
 * @param {string} [options.contentVersion]
 * @param {string} [options.dictionaryVersion]
 * @param {string|number} [options.userDictionaryRevision]
 * @returns {Promise<{ catalog: Array, lessons: Array, cached: boolean }>}
 */
export async function ensureDictionaryCatalog(options = {}) {
  const {
    signal,
    courseId = 'genki-1',
    contentIndex = [],
    loadedLessons = [],
    contentVersion = String(contentIndex.length || '1.0'),
    dictionaryVersion = '1.0',
    userDictionaryRevision = String(
      options.userDictionaryRevision ??
        dictionaryStore?.userRevision ??
        dictionaryStore?.userEntries?.size ??
        '0'
    ),
  } = options;

  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Calculate stable revision hash/key including detailed word properties
  const wordSig = (w) =>
    `${w.id || ''}:${w.writing || w.writtenForm || w.kanji || ''}:${w.reading || ''}:${
      w.translation || w.meaning || ''
    }:${w.topic || ''}:${w.partOfSpeech || ''}:${w.adjectiveClass || ''}`;
  const lessonHash = loadedLessons
    .map((l) => `${l.id}:${(l.words || l.vocabulary || []).map(wordSig).join('-')}`)
    .join(';');

  const cacheKey = [
    courseId,
    contentVersion,
    dictionaryVersion,
    userDictionaryRevision,
    lessonHash,
  ].join(':');

  if (catalogCache.has(cacheKey)) {
    const cachedObj = catalogCache.get(cacheKey);
    return { ...cachedObj, cached: true };
  }

  const lessonsMap = new Map();

  // 1. Initialize from contentIndex if provided
  if (Array.isArray(contentIndex) && contentIndex.length > 0) {
    for (const item of contentIndex) {
      lessonsMap.set(item.id, {
        id: item.id,
        title: item.title || `Урок ${item.id}`,
        words: [],
      });
    }
  }

  // 2. Add or update from loadedLessons
  if (Array.isArray(loadedLessons)) {
    for (const lesson of loadedLessons) {
      const existing = lessonsMap.get(lesson.id) || {
        id: lesson.id,
        title: lesson.title || `Урок ${lesson.id}`,
        words: [],
      };
      if (lesson.title) existing.title = lesson.title;
      const wordList = lesson.words || lesson.vocabulary || [];
      const wordMap = new Map(existing.words.map((w) => [w.id, w]));
      for (const w of wordList) {
        if (w && w.id && !wordMap.has(w.id)) {
          const norm = normalizeCatalogWord(w, lesson.id);
          wordMap.set(w.id, norm);
        }
      }
      existing.words = Array.from(wordMap.values());
      lessonsMap.set(lesson.id, existing);
    }
  }

  // 3. Process all catalog words (from loaded lessons + dictionaryStore)
  const words = [];
  const processedIds = new Set();

  for (const lesson of loadedLessons) {
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    const wordList = lesson.words || lesson.vocabulary || [];
    for (const w of wordList) {
      if (w && w.id && !processedIds.has(w.id)) {
        processedIds.add(w.id);
        const norm = normalizeCatalogWord(w, lesson.id);
        words.push(norm);
      }
    }
  }

  if (dictionaryStore) {
    const entries = dictionaryStore.getAllDictionaryEntries();
    for (const entry of entries) {
      if (entry && entry.id && !processedIds.has(entry.id)) {
        processedIds.add(entry.id);
        const norm = normalizeCatalogWord(entry);
        words.push(norm);
      }
    }
  }

  // 4. Distribute catalog words into lessonsMap
  for (const word of words) {
    const targetLessonIds =
      word.lessonIds && word.lessonIds.length > 0
        ? word.lessonIds
        : word.lessonId != null
          ? [word.lessonId]
          : [];

    for (const lid of targetLessonIds) {
      let lessonObj = lessonsMap.get(lid);
      if (!lessonObj) {
        lessonObj = {
          id: lid,
          title: `Урок ${lid}`,
          words: [],
        };
        lessonsMap.set(lid, lessonObj);
      }
      const isAlreadyInLesson = lessonObj.words.some(
        (w) => w.id === word.id || (w.lexemeId && word.lexemeId && w.lexemeId === word.lexemeId)
      );
      if (!isAlreadyInLesson) {
        lessonObj.words.push(word);
      }
    }
  }

  const lessonsResult = Array.from(lessonsMap.values()).sort((a, b) => {
    const idA = typeof a.id === 'number' ? a.id : parseInt(a.id, 10) || 999;
    const idB = typeof b.id === 'number' ? b.id : parseInt(b.id, 10) || 999;
    return idA - idB;
  });

  const resultObj = { catalog: words, lessons: lessonsResult, cached: false };
  catalogCache.set(cacheKey, resultObj);
  return resultObj;
}

export function clearDictionaryCatalogCache() {
  catalogCache.clear();
}

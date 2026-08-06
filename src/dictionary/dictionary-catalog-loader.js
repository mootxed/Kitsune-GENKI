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
    activeCourse = null,
    vocabularyIndex = null,
    contentIndex = [],
    loadedLessons = [],
    contentVersion = activeCourse?.manifest?.contentVersion || options.contentVersion || '1.0.0',
    dictionaryVersion = dictionaryStore?.manifest?.contentVersion ||
      options.dictionaryVersion ||
      '1.0.0',
    userDictionaryRevision = String(
      options.userDictionaryRevision ??
        dictionaryStore?.userRevision ??
        dictionaryStore?.userEntries?.size ??
        '0'
    ),
  } = options;

  if (signal?.aborted) {
    const err = new Error('AbortError');
    err.name = 'AbortError';
    throw err;
  }

  const wordSig = (w) =>
    `${w.id || w.lexemeId || ''}:${w.writing || w.writtenForm || w.kanji || ''}:${w.reading || ''}:${
      w.translation || w.meaning || ''
    }:${w.topic || ''}:${w.partOfSpeech || ''}:${w.adjectiveClass || ''}`;

  const runtimeSignature = (loadedLessons || [])
    .map((l) => `${l.id || l.lessonId}:${(l.words || l.vocabulary || []).map(wordSig).join(',')}`)
    .join(';');

  const cacheKey = [
    courseId,
    contentVersion,
    dictionaryVersion,
    userDictionaryRevision,
    runtimeSignature,
  ].join(':');

  if (catalogCache.has(cacheKey)) {
    const cachedObj = catalogCache.get(cacheKey);
    return { ...cachedObj, cached: true };
  }

  const lessonsMap = new Map();

  // 1. Initialize lessonsMap from contentIndex if provided
  if (Array.isArray(contentIndex) && contentIndex.length > 0) {
    for (let i = 0; i < contentIndex.length; i++) {
      const item = contentIndex[i];
      const id = item.id ?? item.lessonId ?? i + 1;
      lessonsMap.set(id, {
        id,
        title: item.title || `Урок ${id}`,
        order: item.order ?? i,
        words: [],
      });
    }
  }

  // 2. Obtain vocabulary index from activeCourse, options, or dictionaryStore course references
  let courseVocabLessons = null;

  if (activeCourse && typeof activeCourse.getVocabularyIndex === 'function') {
    const idx = activeCourse.getVocabularyIndex();
    if (idx && Array.isArray(idx.lessons)) {
      courseVocabLessons = idx.lessons;
    }
  } else if (vocabularyIndex && Array.isArray(vocabularyIndex.lessons)) {
    courseVocabLessons = vocabularyIndex.lessons;
  }

  if (courseVocabLessons) {
    for (const vLesson of courseVocabLessons) {
      const lid = vLesson.id || vLesson.lessonId;
      let lessonObj = lessonsMap.get(lid);
      if (!lessonObj) {
        lessonObj = {
          id: lid,
          title: vLesson.title || `Урок ${lid}`,
          order: vLesson.order ?? 999,
          words: [],
        };
        lessonsMap.set(lid, lessonObj);
      }
      const rawWords = vLesson.words || [];
      for (const w of rawWords) {
        if (!w) continue;
        let resolved = w;
        if (w.dictionaryId && dictionaryStore) {
          try {
            resolved = dictionaryStore.resolveCourseVocabularyReference(w);
          } catch {
            resolved = w;
          }
        }
        const norm = normalizeCatalogWord(resolved, lid);
        if (norm && norm.id) {
          const exists = lessonObj.words.some(
            (existing) =>
              existing.id === norm.id ||
              (existing.lexemeId && norm.lexemeId && existing.lexemeId === norm.lexemeId)
          );
          if (!exists) {
            lessonObj.words.push(norm);
          }
        }
      }
    }
  } else if (dictionaryStore) {
    // Fallback: populate from course references registered in dictionaryStore for courseId
    const refs = [...(dictionaryStore.courseReferences?.values() || [])].filter(
      (r) => r.courseId === courseId
    );
    for (const ref of refs) {
      const lid = ref.introducedIn || ref.lessonId || ref.chapterId;
      if (!lid) continue;
      let lessonObj = lessonsMap.get(lid);
      if (!lessonObj) {
        lessonObj = {
          id: lid,
          title: `Урок ${lid}`,
          order: 999,
          words: [],
        };
        lessonsMap.set(lid, lessonObj);
      }
      try {
        const resolved = dictionaryStore.resolveCourseVocabularyReference(ref);
        const norm = normalizeCatalogWord(resolved, lid);
        if (norm && norm.id) {
          const exists = lessonObj.words.some(
            (existing) =>
              existing.id === norm.id ||
              (existing.lexemeId && norm.lexemeId && existing.lexemeId === norm.lexemeId)
          );
          if (!exists) {
            lessonObj.words.push(norm);
          }
        }
      } catch {
        // ignore broken refs
      }
    }
  }

  // 3. Override / augment with loaded runtime lessons
  if (Array.isArray(loadedLessons)) {
    for (const lesson of loadedLessons) {
      if (signal?.aborted) {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        throw err;
      }
      let lessonObj = lessonsMap.get(lesson.id);
      if (!lessonObj) {
        lessonObj = {
          id: lesson.id,
          title: lesson.title || `Урок ${lesson.id}`,
          order: lesson.order ?? 999,
          words: [],
        };
        lessonsMap.set(lesson.id, lessonObj);
      }
      if (lesson.title) lessonObj.title = lesson.title;

      const wordList = lesson.words || lesson.vocabulary || [];
      for (const w of wordList) {
        if (!w) continue;
        const norm = normalizeCatalogWord(w, lesson.id);
        if (!norm || !norm.id) continue;

        // Check if word already exists in this lesson (replace runtime override or append)
        const existingIdx = lessonObj.words.findIndex(
          (existing) =>
            existing.id === norm.id ||
            (existing.lexemeId && norm.lexemeId && existing.lexemeId === norm.lexemeId)
        );

        if (existingIdx >= 0) {
          lessonObj.words[existingIdx] = norm;
        } else {
          lessonObj.words.push(norm);
        }
      }
    }
  }

  // Collect all catalog words across lessons
  const allCatalogWords = [];
  const catalogWordIds = new Set();
  for (const lessonObj of lessonsMap.values()) {
    for (const word of lessonObj.words) {
      if (!catalogWordIds.has(word.id)) {
        catalogWordIds.add(word.id);
        allCatalogWords.push(word);
      }
    }
  }

  const sortedLessons = Array.from(lessonsMap.values()).sort((a, b) => {
    const idA =
      typeof a.id === 'number' ? a.id : parseInt(String(a.id).replace(/\D/g, ''), 10) || 999;
    const idB =
      typeof b.id === 'number' ? b.id : parseInt(String(b.id).replace(/\D/g, ''), 10) || 999;
    return idA - idB;
  });

  const resultObj = {
    courseId,
    contentVersion,
    lessons: sortedLessons,
    catalog: allCatalogWords,
    cached: false,
  };

  catalogCache.set(cacheKey, resultObj);
  return resultObj;
}

export function clearDictionaryCatalogCache() {
  catalogCache.clear();
}

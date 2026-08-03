/* src/dictionary/dictionary-catalog-loader.js — Optimized Dictionary Catalog Loader */
import { dictionaryStore } from './dictionary-store.js';

const catalogCache = new Map();

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
 * @returns {Promise<{ catalog: Array, cached: boolean }>}
 */
export async function ensureDictionaryCatalog(options = {}) {
  const {
    signal,
    courseId = 'genki-1',
    contentIndex = [],
    loadedLessons = [],
    contentVersion = String(contentIndex.length || '1.0'),
    dictionaryVersion = '1.0',
    userDictionaryRevision = String(dictionaryStore?.userEntries?.size || '0'),
  } = options;

  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Calculate stable revision hash/key beyond simple array lengths
  const lessonHash = loadedLessons
    .map(
      (l) =>
        `${l.id}:${(l.words || l.vocabulary || []).map((w) => w.id || w.writing || '').join('-')}`
    )
    .join(';');
  const cacheKey = [
    courseId,
    contentVersion,
    dictionaryVersion,
    userDictionaryRevision,
    lessonHash,
  ].join(':');

  if (catalogCache.has(cacheKey)) {
    return { catalog: catalogCache.get(cacheKey), cached: true };
  }

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
      if (w.id && !processedIds.has(w.id)) {
        processedIds.add(w.id);
        words.push(w);
      }
    }
  }

  if (dictionaryStore) {
    const entries = dictionaryStore.getAllDictionaryEntries();
    for (const entry of entries) {
      if (entry.id && !processedIds.has(entry.id)) {
        processedIds.add(entry.id);
        words.push(entry);
      }
    }
  }

  catalogCache.set(cacheKey, words);
  return { catalog: words, cached: false };
}

export function clearDictionaryCatalogCache() {
  catalogCache.clear();
}

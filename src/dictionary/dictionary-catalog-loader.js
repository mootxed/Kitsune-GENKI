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
 * @returns {Promise<{ catalog: Array, cached: boolean }>}
 */
export async function ensureDictionaryCatalog(options = {}) {
  const { signal, courseId = 'genki-1', contentIndex = [], loadedLessons = [] } = options;

  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }

  const cacheKey = `${courseId}:${contentIndex.length}:${loadedLessons.length}`;
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

  if (dictionaryStore && typeof dictionaryStore.getAllEntries === 'function') {
    const entries = dictionaryStore.getAllEntries();
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

/**
 * src/dictionary/story-occurrence-index.js
 *
 * Maintains an in-memory index: dictionaryId → StoryOccurrence[]
 *
 * Sources:
 *   - Builtin course stories (already tokenized via resolveStoryTokens)
 *   - Saved AI stories in state.savedNotes (that have `story` array)
 *
 * One-time (unsaved) AI stories are NOT indexed.
 *
 * StoryOccurrence IDs are deterministic:
 *   `story-occurrence:{storyId}:{sentenceId}:{tokenIndex}`
 *
 * Invalidation is explicit — call invalidate() or rebuild() when:
 *   - A course loads
 *   - A story is saved or deleted
 *   - Dictionary aliases change
 */

import { resolveDictionaryAlias } from './dictionary-store.js';

/**
 * @typedef {Object} StoryOccurrence
 * @property {string} id
 * @property {string} dictionaryId  — canonical dictionaryId
 * @property {string} storyId
 * @property {string} storyTitle
 * @property {string|number} sentenceId
 * @property {string} tokenId
 * @property {string} surface
 * @property {string} reading
 * @property {string} sentence      — full sentence text
 * @property {string} translation
 * @property {'curated'|'ai'} source
 */

export class StoryOccurrenceIndex {
  constructor() {
    /** @type {Map<string, StoryOccurrence[]>} */
    this._index = new Map();
    this._built = false;
  }

  /**
   * Build the index from a list of story descriptors.
   * Each descriptor: { storyId, storyTitle, source, content: sentence[] }
   * Sentences: { sentence_id, tokens[], translation }
   * Tokens: canonical TokenOccurrence (must have dictionaryId set if resolved)
   *
   * Also accepts saved notes from state.savedNotes that have a `story` property.
   *
   * @param {Array<{storyId: string, storyTitle: string, source: string, content: object[]}>} stories
   * @param {object|import('./dictionary-store.js').DictionaryStore} [options] — options object or dictionaryStore instance
   */
  build(stories, options = {}) {
    this._index.clear();
    const dictStore =
      options?.dictionaryStore ||
      (options && typeof options.resolveAlias === 'function' ? options : null);
    this._dictStore = dictStore;

    for (const story of stories || []) {
      const { storyId, storyTitle, source, content } = story;
      if (!storyId || !Array.isArray(content)) continue;

      for (const sentence of content) {
        const sentenceId = sentence.sentence_id ?? sentence.sentenceId;
        const tokens = sentence.tokens || [];

        for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
          const token = tokens[tokenIndex];
          if (!token) continue;

          const rawDictionaryId = token.dictionaryId || token.lexemeId || null;
          if (!rawDictionaryId) continue;

          const resolution = token.resolution;
          if (resolution && resolution.status !== 'resolved') continue;

          const canonicalId =
            (dictStore
              ? dictStore.resolveAlias(rawDictionaryId)
              : resolveDictionaryAlias(rawDictionaryId)) || rawDictionaryId;
          const surface = token.surface || token.kanji || '';
          if (!surface) continue;

          const occurrenceId = `story-occurrence:${storyId}:${sentenceId}:${tokenIndex}`;
          const sentenceText = tokens.map((t) => t.surface || t.kanji || t.writing || '').join('');

          /** @type {StoryOccurrence} */
          const occurrence = {
            id: occurrenceId,
            dictionaryId: canonicalId,
            storyId: String(storyId),
            storyTitle: String(storyTitle || storyId),
            sentenceId: sentenceId,
            tokenId: token.id || occurrenceId,
            surface: surface,
            reading: token.reading || surface,
            sentence: sentenceText,
            translation: sentence.translation || '',
            source: source === 'ai' ? 'ai' : 'curated',
          };

          if (!this._index.has(canonicalId)) {
            this._index.set(canonicalId, []);
          }
          this._index.get(canonicalId).push(occurrence);
        }
      }
    }

    this._built = true;
  }

  /**
   * Ensure index is built; builds if not already built or if forced.
   * @param {Array} stories
   * @param {object} [options]
   */
  ensureBuilt(stories, options = {}) {
    if (!this._built || options?.force) {
      this.build(stories, options);
    }
  }

  /**
   * Get all occurrences for a given dictionaryId (after alias resolution).
   * @param {string} dictionaryId
   * @param {import('./dictionary-store.js').DictionaryStore} [dictionaryStore]
   * @returns {StoryOccurrence[]}
   */
  getOccurrences(dictionaryId, dictionaryStore = null) {
    if (!dictionaryId) return [];
    const store = dictionaryStore || this._dictStore;
    const canonical =
      (store ? store.resolveAlias(dictionaryId) : resolveDictionaryAlias(dictionaryId)) ||
      dictionaryId;
    return this._index.get(canonical) || [];
  }

  /**
   * Invalidate the index (marks as stale; will need rebuild).
   */
  invalidate() {
    this._built = false;
    this._index.clear();
  }

  get isBuilt() {
    return this._built;
  }
}

/**
 * Build story descriptor list from saved notes.
 * Only notes that have a `story` array (saved AI stories) are included.
 * @param {Array} savedNotes
 * @returns {Array}
 */
export function savedNotesToStoryDescriptors(savedNotes) {
  if (!Array.isArray(savedNotes)) return [];
  return savedNotes
    .filter((n) => n && n.story && Array.isArray(n.story))
    .map((n) => ({
      storyId: n.sourceStoryId || n.id,
      storyTitle: n.title || n.id,
      source: 'ai',
      content: n.story,
    }));
}

/**
 * Build story descriptor from a builtin course story object.
 * @param {object} story  — must have storyId/id, title, content[]
 * @param {string} courseId
 * @returns {object}
 */
export function builtinStoryToDescriptor(story, courseId) {
  const rawId = story.storyId || story.id || 'story';
  const storyId = String(rawId).includes(':') ? String(rawId) : `${courseId}:story:${rawId}`;
  return {
    storyId,
    storyTitle: story.title || storyId,
    source: 'curated',
    content: story.content || [],
  };
}

/** Singleton index used at runtime. */
export const storyOccurrenceIndex = new StoryOccurrenceIndex();

/**
 * src/dictionary/dictionary-relations-index.js
 *
 * Lightweight, lazy-built Maps connecting dictionaryId to:
 *   - LessonReference[] (from DictionaryStore.findCourseReferencesForDictionary)
 *   - GrammarReference[] (type-based rules + explicit links)
 *   - ExampleReference[] (from ExamplesDB)
 *
 * Invalidated on: course load, dictionary update, alias change.
 *
 * StoryOccurrence relations are maintained separately in story-occurrence-index.js.
 * FSRS relations are maintained separately in dictionary-fsrs-service.js.
 */

/**
 * @typedef {Object} LessonReference
 * @property {string} courseId
 * @property {string} lessonId
 * @property {string} introducedIn
 * @property {string} courseMeaning
 * @property {boolean} introduced  — true if this is the first lesson for this word in the course
 */

/**
 * @typedef {Object} GrammarReference
 * @property {string} grammarId     — e.g. 'polite-present'
 * @property {string} chapterId     — lesson where this grammar is introduced
 * @property {string} title         — human-readable title
 * @property {string} linkType      — 'type-based' | 'explicit'
 * @property {string} reason        — human-readable explanation (e.g. "Available for all verbs")
 */

/**
 * @typedef {Object} ExampleReference
 * @property {string} id
 * @property {string} dictionaryId
 * @property {string} sentence
 * @property {string} translation
 * @property {string} source
 * @property {string|null} storyId
 */

// ---------------------------------------------------------------------------
// Example source normalization
// ---------------------------------------------------------------------------

/**
 * Normalize example source.
 * @param {string} source
 * @returns {'curated'|'ai'|'unknown'}
 */
export function normalizeExampleSource(source) {
  if (
    ['curated', 'curated-word', 'global', 'story', 'contextProduction', 'note', 'course'].includes(
      source
    )
  ) {
    return 'curated';
  }

  if (['ai', 'ai-story', 'generated'].includes(source)) {
    return 'ai';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Type-based grammar rules
// ---------------------------------------------------------------------------

/**
 * Returns grammar topic IDs applicable to the given entry by its word class.
 * These are GENKI I grammar patterns that apply to all words of this type.
 * We don't enumerate them into every DictionaryEntry — instead we compute them.
 *
 * @param {import('./dictionary-contract.js').DictionaryEntry} entry
 * @returns {Array<{grammarId: string, reason: string, linkType: string}>}
 */
export function getTypeBasedGrammarLinks(entry) {
  if (!entry) return [];

  const links = [];

  if (entry.partOfSpeech === 'verb') {
    const verbLinks = [
      {
        grammarId: 'polite-present',
        title: 'ます (Вежливое настоящее)',
        reason: 'Доступно для всех глаголов',
      },
      {
        grammarId: 'polite-negative',
        title: 'ません (Вежливое отрицательное)',
        reason: 'Доступно для всех глаголов',
      },
      {
        grammarId: 'polite-past',
        title: 'ました (Вежливое прошедшее)',
        reason: 'Доступно для всех глаголов',
      },
      {
        grammarId: 'te-form',
        title: 'て-форма',
        reason: 'Доступно для всех глаголов',
      },
      {
        grammarId: 'tai-form',
        title: 'たいです (Хотеть)',
        reason: 'Доступно для всех глаголов',
      },
    ];
    for (const link of verbLinks) {
      links.push({ ...link, linkType: 'type-based' });
    }
  } else if (entry.partOfSpeech === 'adjective') {
    if (entry.adjectiveClass === 'i') {
      links.push({
        grammarId: 'i-adjective',
        title: 'い-прилагательные',
        reason: 'Доступно для い-прилагательных',
        linkType: 'type-based',
      });
    } else if (entry.adjectiveClass === 'na') {
      links.push({
        grammarId: 'na-adjective',
        title: 'な-прилагательные',
        reason: 'Доступно для な-прилагательных',
        linkType: 'type-based',
      });
    }
  }

  return links;
}

// ---------------------------------------------------------------------------
// Relations index class
// ---------------------------------------------------------------------------

export class DictionaryRelationsIndex {
  constructor() {
    /**
     * @type {Map<string, LessonReference[]>}
     * Built from DictionaryStore.findCourseReferencesForDictionary()
     */
    this._lessonIndex = new Map();

    /**
     * @type {Map<string, GrammarReference[]>}
     */
    this._grammarIndex = new Map();

    /**
     * @type {Map<string, ExampleReference[]>}
     */
    this._exampleIndex = new Map();

    this._builtLessons = false;
    this._builtExamples = false;
  }

  // -------------------------------------------------------------------------
  // Lesson references
  // -------------------------------------------------------------------------

  /**
   * Build lesson references from DictionaryStore.
   * Should be called once after course data is loaded.
   *
   * @param {import('./dictionary-store.js').DictionaryStore} dictionaryStore
   */
  buildLessonIndex(dictionaryStore) {
    this._lessonIndex.clear();

    for (const [refId, ref] of dictionaryStore.courseReferences || new Map()) {
      if (!ref) continue;
      const dictionaryId = dictionaryStore.resolveAlias(ref.dictionaryId) || ref.dictionaryId;
      if (!dictionaryId) continue;

      if (!this._lessonIndex.has(dictionaryId)) {
        this._lessonIndex.set(dictionaryId, []);
      }

      const lessonId = ref.lessonId || ref.chapterId || ref.introducedIn;
      this._lessonIndex.get(dictionaryId).push({
        courseId: ref.courseId,
        lessonId: lessonId,
        introducedIn: ref.introducedIn,
        courseMeaning: ref.courseMeaning || '',
        introduced: true, // first occurrence in the course
      });
    }

    this._builtLessons = true;
  }

  /**
   * Get lesson references for a dictionaryId.
   * @param {string} dictionaryId
   * @param {import('./dictionary-store.js').DictionaryStore} [dictionaryStore]
   * @returns {LessonReference[]}
   */
  getLessonReferences(dictionaryId, dictionaryStore = null) {
    if (!dictionaryId) return [];
    const canonical = dictionaryStore?.resolveAlias(dictionaryId) || dictionaryId;

    // Try index first
    if (this._builtLessons && this._lessonIndex.has(canonical)) {
      return this._lessonIndex.get(canonical);
    }

    // Fallback: query store directly
    if (
      dictionaryStore &&
      typeof dictionaryStore.findCourseReferencesForDictionary === 'function'
    ) {
      const refs = dictionaryStore.findCourseReferencesForDictionary(canonical);
      return refs.map((ref) => ({
        courseId: ref.courseId,
        lessonId: ref.lessonId || ref.chapterId || ref.introducedIn,
        introducedIn: ref.introducedIn,
        courseMeaning: ref.courseMeaning || '',
        introduced: true,
      }));
    }

    return [];
  }

  // -------------------------------------------------------------------------
  // Grammar references
  // -------------------------------------------------------------------------

  /**
   * Get grammar topics linked to a dictionaryId.
   * Combines type-based rules with any explicitly stored links.
   *
   * @param {string} dictionaryId
   * @param {import('./dictionary-contract.js').DictionaryEntry} entry
   * @returns {GrammarReference[]}
   */
  getGrammarReferences(dictionaryId, entry) {
    if (!entry) return [];
    const typeLinks = getTypeBasedGrammarLinks(entry);
    const explicitLinks = this._grammarIndex.get(dictionaryId) || [];
    return [...typeLinks, ...explicitLinks];
  }

  /**
   * Register an explicit grammar link for a word.
   * @param {string} dictionaryId
   * @param {GrammarReference} ref
   */
  addExplicitGrammarLink(dictionaryId, ref) {
    if (!this._grammarIndex.has(dictionaryId)) {
      this._grammarIndex.set(dictionaryId, []);
    }
    this._grammarIndex.get(dictionaryId).push({ ...ref, linkType: 'explicit' });
  }

  // -------------------------------------------------------------------------
  // Example references
  // -------------------------------------------------------------------------

  /**
   * Build example index from ExamplesDB.
   * @param {import('../examples-db.js').ExamplesDBClass} examplesDB
   * @param {import('./dictionary-store.js').DictionaryStore} [dictionaryStore]
   */
  buildExampleIndex(examplesDB, dictionaryStore = null) {
    this._exampleIndex.clear();

    if (!examplesDB || !examplesDB.dictionaryIndex) {
      this._builtExamples = true;
      return;
    }

    for (const [rawDictionaryId, examples] of examplesDB.dictionaryIndex) {
      const canonical = dictionaryStore?.resolveAlias(rawDictionaryId) || rawDictionaryId;

      if (!this._exampleIndex.has(canonical)) {
        this._exampleIndex.set(canonical, []);
      }

      for (const ex of examples || []) {
        this._exampleIndex.get(canonical).push({
          id: ex.id || `example:${canonical}:${ex.japanese}`,
          dictionaryId: canonical,
          sentence: ex.japanese || '',
          reading: ex.reading || '',
          translation: ex.translation || '',
          source: ex.source || 'curated',
          storyId: ex.storyId || null,
          lessonRequired: ex.lessonRequired || 1,
        });
      }
    }

    this._builtExamples = true;
  }

  /**
   * Get example references for a dictionaryId.
   * @param {string} dictionaryId
   * @param {import('./dictionary-store.js').DictionaryStore} [dictionaryStore]
   * @returns {ExampleReference[]}
   */
  getExampleReferences(dictionaryId, dictionaryStore = null) {
    if (!dictionaryId) return [];
    const canonical = dictionaryStore?.resolveAlias(dictionaryId) || dictionaryId;
    return this._exampleIndex.get(canonical) || [];
  }

  // -------------------------------------------------------------------------
  // Invalidation
  // -------------------------------------------------------------------------

  invalidate() {
    this._lessonIndex.clear();
    this._grammarIndex.clear();
    this._exampleIndex.clear();
    this._builtLessons = false;
    this._builtExamples = false;
  }

  invalidateLessons() {
    this._lessonIndex.clear();
    this._builtLessons = false;
  }

  invalidateExamples() {
    this._exampleIndex.clear();
    this._builtExamples = false;
  }

  get isLessonsBuilt() {
    return this._builtLessons;
  }

  get isExamplesBuilt() {
    return this._builtExamples;
  }
}

/** Singleton used at runtime. */
export const dictionaryRelationsIndex = new DictionaryRelationsIndex();

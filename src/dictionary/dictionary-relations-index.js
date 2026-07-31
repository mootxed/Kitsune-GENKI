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

import { ExamplesDB } from '../examples-db.js';
import { compareLessonIds } from '../courses/course-context.js';
import { resolveLessonStatus } from '../chapter-progress.js';

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

export const GRAMMAR_REGISTRY = [
  {
    grammarId: 'polite-present',
    courseId: 'genki-1',
    lessonId: 'genki-1:lesson-3',
    topicId: 'L3_g1',
  },
  {
    grammarId: 'polite-negative',
    courseId: 'genki-1',
    lessonId: 'genki-1:lesson-3',
    topicId: 'L3_g1',
  },
  { grammarId: 'polite-past', courseId: 'genki-1', lessonId: 'genki-1:lesson-4', topicId: 'L4_g6' },
  { grammarId: 'te-form', courseId: 'genki-1', lessonId: 'genki-1:lesson-6', topicId: 'L6_g1' },
  { grammarId: 'tai-form', courseId: 'genki-1', lessonId: 'genki-1:lesson-11', topicId: 'L11_g4' },
  { grammarId: 'i-adjective', courseId: 'genki-1', lessonId: 'genki-1:lesson-5', topicId: 'L5_g1' },
  {
    grammarId: 'na-adjective',
    courseId: 'genki-1',
    lessonId: 'genki-1:lesson-5',
    topicId: 'L5_g1',
  },
];

export function resolveGrammarTopicId(grammarId) {
  if (!grammarId) return null;
  const match = GRAMMAR_REGISTRY.find((r) => r.grammarId === grammarId || r.topicId === grammarId);
  if (match) {
    return `${match.courseId}:grammar:${match.topicId}`;
  }
  if (String(grammarId).startsWith('genki-1:grammar:')) {
    return grammarId;
  }
  if (/^L\d+_g\d+$/i.test(String(grammarId))) {
    return `genki-1:grammar:${grammarId}`;
  }
  return grammarId;
}

/**
 * Get type-based grammar links for an entry (verbs/adjectives).
 * @param {import('./dictionary-contract.js').DictionaryEntry} entry
 * @returns {Array<{grammarId: string, topicId?: string, lessonId?: string, courseId?: string, reason: string, linkType: string}>}
 */
export function getTypeBasedGrammarLinks(entry) {
  if (!entry) return [];

  const links = [];

  if (entry.partOfSpeech === 'verb') {
    const verbLinks = [
      {
        grammarId: 'polite-present',
        topicId: 'L3_g1',
        chapterId: '3',
        lessonId: 'genki-1:lesson-3',
        courseId: 'genki-1',
        title: 'ます (Вежливое настоящее)',
        reason: 'Доступно для всех глаголов',
      },
      {
        grammarId: 'polite-negative',
        topicId: 'L3_g1',
        chapterId: '3',
        lessonId: 'genki-1:lesson-3',
        courseId: 'genki-1',
        title: 'ません (Вежливое отрицательное)',
        reason: 'Доступно для всех глаголов',
      },
      {
        grammarId: 'polite-past',
        topicId: 'L4_g6',
        chapterId: '4',
        lessonId: 'genki-1:lesson-4',
        courseId: 'genki-1',
        title: 'ました (Вежливое прошедшее)',
        reason: 'Доступно для всех глаголов',
      },
      {
        grammarId: 'te-form',
        topicId: 'L6_g1',
        chapterId: '6',
        lessonId: 'genki-1:lesson-6',
        courseId: 'genki-1',
        title: 'て-форма',
        reason: 'Доступно для всех глаголов',
      },
      {
        grammarId: 'tai-form',
        topicId: 'L11_g4',
        chapterId: '11',
        lessonId: 'genki-1:lesson-11',
        courseId: 'genki-1',
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
        topicId: 'L5_g1',
        chapterId: '5',
        lessonId: 'genki-1:lesson-5',
        courseId: 'genki-1',
        title: 'い-прилагательные',
        reason: 'Доступно для い-прилагательных',
        linkType: 'type-based',
      });
    } else if (entry.adjectiveClass === 'na') {
      links.push({
        grammarId: 'na-adjective',
        topicId: 'L5_g1',
        chapterId: '5',
        lessonId: 'genki-1:lesson-5',
        courseId: 'genki-1',
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
   * Build lesson references from DictionaryStore and ExamplesDB.
   * Calculates primary introduction and reuse occurrences.
   *
   * @param {import('./dictionary-store.js').DictionaryStore} dictionaryStore
   * @param {import('../examples-db.js').ExamplesDBClass} [examplesDB]
   */
  buildLessonIndex(dictionaryStore, examplesDB = null, state = null) {
    this._lessonIndex.clear();
    const db = examplesDB || ExamplesDB;

    if (!dictionaryStore) {
      this._builtLessons = true;
      return;
    }

    const courseRefs = dictionaryStore.courseReferences || new Map();

    const getStatus = (lessonId) => {
      if (typeof window !== 'undefined' && typeof window.chState === 'function') {
        const cs = window.chState(lessonId);
        if (cs?.completed) return 'completed';
        if (cs?.started) return 'in_progress';
      }
      if (state?.chapters?.[lessonId]) {
        const st = state.chapters[lessonId];
        if (st.completed) return 'completed';
        if (st.started) return 'in_progress';
      }
      return 'available';
    };

    for (const [, ref] of courseRefs) {
      if (!ref) continue;
      const dictionaryId = dictionaryStore.resolveAlias(ref.dictionaryId) || ref.dictionaryId;
      if (!dictionaryId) continue;

      if (!this._lessonIndex.has(dictionaryId)) {
        this._lessonIndex.set(dictionaryId, []);
      }

      const lessonId = ref.lessonId || ref.chapterId || ref.introducedIn;
      this._lessonIndex.get(dictionaryId).push({
        courseId: ref.courseId || 'genki-1',
        lessonId: lessonId,
        introducedIn: ref.introducedIn || lessonId,
        courseMeaning: ref.courseMeaning || '',
        introduced: false, // will be resolved per courseId below
        occurrenceCount: 1,
        sources: ['vocabulary'],
        status: getStatus(lessonId),
      });
    }

    // Check ExamplesDB for additional lesson occurrences
    if (db && db.dictionaryIndex) {
      for (const [rawDictId, examples] of db.dictionaryIndex) {
        const canonical = dictionaryStore.resolveAlias(rawDictId) || rawDictId;
        if (!canonical) continue;

        let lessonList = this._lessonIndex.get(canonical);
        if (!lessonList) {
          lessonList = [];
          this._lessonIndex.set(canonical, lessonList);
        }

        const primaryRef = lessonList[0];
        const primaryLessonId = primaryRef ? primaryRef.lessonId || primaryRef.introducedIn : null;

        for (const ex of examples || []) {
          const exLessonId =
            ex.sourceLessonId || (ex.lessonRequired ? String(ex.lessonRequired) : null);
          if (!exLessonId) continue;

          let targetRef = lessonList.find((r) => String(r.lessonId) === String(exLessonId));
          if (targetRef) {
            targetRef.occurrenceCount = (targetRef.occurrenceCount || 1) + 1;
            if (!targetRef.sources.includes(ex.source || 'example')) {
              targetRef.sources.push(ex.source || 'example');
            }
          } else {
            lessonList.push({
              courseId: primaryRef ? primaryRef.courseId : 'genki-1',
              lessonId: exLessonId,
              introducedIn: primaryLessonId || exLessonId,
              courseMeaning: primaryRef ? primaryRef.courseMeaning : '',
              introduced: false,
              occurrenceCount: 1,
              sources: [ex.source || 'example'],
              status: getStatus(exLessonId),
            });
          }
        }
      }
    }

    // Resolve single "introduced: true" per courseId (the reference with minimum lessonId)
    for (const [, list] of this._lessonIndex) {
      const byCourse = new Map();
      for (const ref of list) {
        const cId = ref.courseId || 'genki-1';
        if (!byCourse.has(cId)) byCourse.set(cId, []);
        byCourse.get(cId).push(ref);
      }

      for (const [, courseList] of byCourse) {
        courseList.sort((a, b) => compareLessonIds(a.lessonId, b.lessonId));
        courseList[0].introduced = true;
        for (let i = 1; i < courseList.length; i++) {
          courseList[i].introduced = false;
        }
      }
    }

    this._builtLessons = true;
  }

  /**
   * Get lesson references for a dictionaryId.
   * @param {string} dictionaryId
   * @param {import('./dictionary-store.js').DictionaryStore} [dictionaryStore]
   * @returns {LessonReference[]}
   */
  getLessonReferences(dictionaryId, dictionaryStore = null, state = null) {
    if (!dictionaryId) return [];
    const canonical = dictionaryStore?.resolveAlias(dictionaryId) || dictionaryId;

    let refs = [];
    if (this._builtLessons && this._lessonIndex.has(canonical)) {
      refs = this._lessonIndex.get(canonical);
    } else if (dictionaryStore) {
      if (!this._builtLessons) {
        this.buildLessonIndex(dictionaryStore, null, state);
        if (this._lessonIndex.has(canonical)) {
          refs = this._lessonIndex.get(canonical);
        }
      }

      if (
        refs.length === 0 &&
        typeof dictionaryStore.findCourseReferencesForDictionary === 'function'
      ) {
        const rawRefs = dictionaryStore.findCourseReferencesForDictionary(canonical);
        refs = rawRefs.map((ref) => ({
          courseId: ref.courseId,
          lessonId: ref.lessonId || ref.chapterId || ref.introducedIn,
          introducedIn: ref.introducedIn,
          courseMeaning: ref.courseMeaning || '',
          introduced: true,
          occurrenceCount: 1,
          sources: ['vocabulary'],
        }));
      }
    }

    return refs.map((ref) => ({
      ...ref,
      status: resolveLessonStatus({
        state,
        courseId: ref.courseId,
        lessonId: ref.lessonId || ref.introducedIn,
      }),
    }));
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
          sentenceId: ex.sentenceId ?? null,
          tokenId: ex.tokenId || null,
          sourceLessonId: ex.sourceLessonId || null,
          courseId: ex.courseId || null,
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
    if (!this._builtExamples && ExamplesDB) {
      this.buildExampleIndex(ExamplesDB, dictionaryStore);
    }
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

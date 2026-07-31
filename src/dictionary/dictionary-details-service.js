/**
 * src/dictionary/dictionary-details-service.js
 *
 * Read-only aggregation service for the full dictionary entry view.
 *
 * Gathers related data from multiple sources through one canonical dictionaryId:
 *   - DictionaryEntry (from DictionaryStore)
 *   - TokenOccurrence context (if opened from a story)
 *   - Examples (from DictionaryRelationsIndex / ExamplesDB)
 *   - Conjugations (from verb-conjugator.js — deterministic, no AI)
 *   - Grammar topics (type-based + explicit links)
 *   - Lesson references (from DictionaryStore course references)
 *   - Story occurrences (from StoryOccurrenceIndex)
 *   - FSRS summary (from DictionaryFSRSService — read-only)
 *
 * This service NEVER mutates application state.
 *
 * @module dictionary-details-service
 */

import { resolveDictionaryAlias } from './dictionary-store.js';
import { conjugateVerb, conjugateAdjective, FORMS_METADATA } from '../verb-conjugator.js';
import { getDictionaryFSRS } from './dictionary-fsrs-service.js';
import { getTypeBasedGrammarLinks, normalizeExampleSource } from './dictionary-relations-index.js';

// ---------------------------------------------------------------------------
// Token form labels (localized to Russian)
// ---------------------------------------------------------------------------

const TENSE_LABELS = {
  present: 'Настоящее',
  nonpast: 'Настоящее/будущее',
  past: 'Прошедшее',
  progressive: 'Прогрессивное',
  other: 'Другое',
};

const POLITENESS_LABELS = {
  plain: 'Разговорная форма',
  polite: 'Вежливая форма',
  honorific: 'Вежливая (кейго)',
  humble: 'Скромная (кейго)',
  other: 'Другое',
};

const POLARITY_LABELS = {
  affirmative: 'Утвердительная',
  negative: 'Отрицательная',
  other: 'Другое',
};

/**
 * Localize a token form object.
 * @param {object|null} form
 * @returns {{ tense: string|null, politeness: string|null, polarity: string|null, conjugation: string|null }}
 */
export function localizeTokenForm(form) {
  if (!form) return { tense: null, politeness: null, polarity: null, conjugation: null };
  return {
    tense: form.tense ? TENSE_LABELS[form.tense] || form.tense : null,
    politeness: form.politeness ? POLITENESS_LABELS[form.politeness] || form.politeness : null,
    polarity: form.polarity ? POLARITY_LABELS[form.polarity] || form.polarity : null,
    conjugation: form.conjugation || null,
  };
}

// ---------------------------------------------------------------------------
// Conjugation with lesson visibility
// ---------------------------------------------------------------------------

/**
 * Get conjugation forms with availability status.
 *
 * @param {import('./dictionary-contract.js').DictionaryEntry} entry
 * @param {number|null} currentLesson — user's current lesson number (null = unknown)
 * @returns {Array<{formId, label, kana, kanji, availability: 'learned'|'available'|'future'|'unknown'}>}
 */
export function getConjugationsWithStatus(entry, currentLesson = null) {
  if (!entry) return [];

  let rawForms = [];
  if (entry.partOfSpeech === 'verb') {
    if (!entry.verbClass) return [];
    const wordForConjugator = {
      writing: entry.reading || entry.dictionaryForm,
      kanji: entry.dictionaryForm,
      partOfSpeech: 'verb',
      verbClass: entry.verbClass,
    };
    try {
      rawForms = conjugateVerb(wordForConjugator);
    } catch {
      return [];
    }
  } else if (entry.partOfSpeech === 'adjective') {
    const wordForConjugator = {
      writing: entry.reading || entry.dictionaryForm,
      kanji: entry.dictionaryForm,
      partOfSpeech: 'adjective',
      adjectiveClass: entry.adjectiveClass || (entry.dictionaryForm.endsWith('い') ? 'i' : 'na'),
    };
    try {
      rawForms = conjugateAdjective(wordForConjugator);
    } catch {
      return [];
    }
  } else {
    return [];
  }

  return rawForms.filter(Boolean).map((form) => {
    const meta = FORMS_METADATA[form.formId] || { lessonUnlocked: form.lessonUnlocked || 99 };
    const lessonUnlocked = form.lessonUnlocked ?? meta.lessonUnlocked;
    let availability = 'unknown';
    if (currentLesson == null) {
      availability = 'unknown';
    } else if (lessonUnlocked === 0 || currentLesson >= lessonUnlocked) {
      availability = 'learned';
    } else if (lessonUnlocked <= (currentLesson || 0) + 2) {
      availability = 'available';
    } else {
      availability = 'future';
    }
    return {
      formId: form.formId,
      label: form.label,
      kana: form.kana,
      kanji: form.kanji,
      lessonUnlocked,
      availability,
    };
  });
}

// ---------------------------------------------------------------------------
// Main aggregation function
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} DictionaryDetails
 * @property {string} dictionaryId
 * @property {'found'|'not-found'|'ambiguous'} status
 * @property {import('./dictionary-contract.js').DictionaryEntry|null} entry
 * @property {object|null} context     — localized TokenOccurrence context
 * @property {Array} examples
 * @property {Array} conjugations
 * @property {Array} grammarTopics
 * @property {Array} lessons
 * @property {Array} storyOccurrences
 * @property {object|null} fsrs
 * @property {string} source           — 'curated'|'ai'|'unknown'
 */

/**
 * Gather all related data for a dictionaryId.
 *
 * @param {object} params
 * @param {string} params.dictionaryId
 * @param {object|null} [params.tokenOccurrence]      — canonical TokenOccurrence from click
 * @param {string|null} [params.activeCourseId]
 * @param {object} params.state                       — app state (read-only)
 * @param {import('./dictionary-store.js').DictionaryStore} params.dictionaryStore
 * @param {import('./dictionary-relations-index.js').DictionaryRelationsIndex} [params.relationsIndex]
 * @param {import('./story-occurrence-index.js').StoryOccurrenceIndex} [params.storyIndex]
 * @param {object|null} [params.srs]                  — SRS instance for FSRS summary
 * @param {number} [params.now]                       — timestamp override
 * @returns {DictionaryDetails}
 */
export function getDictionaryDetails({
  dictionaryId,
  tokenOccurrence = null,
  activeCourseId = null,
  state,
  dictionaryStore,
  relationsIndex = null,
  storyIndex = null,
  srs = null,
  now = Date.now(),
}) {
  const notFound = {
    dictionaryId: dictionaryId || '',
    status: 'not-found',
    entry: null,
    context: null,
    examples: [],
    conjugations: [],
    grammarTopics: [],
    lessons: [],
    storyOccurrences: [],
    fsrs: null,
    source: 'unknown',
  };

  if (!dictionaryId) return notFound;

  // 1. Resolve alias
  const canonical = dictionaryStore
    ? dictionaryStore.resolveAlias(dictionaryId)
    : resolveDictionaryAlias(dictionaryId) || dictionaryId;

  // 2. Get DictionaryEntry
  const entry = dictionaryStore ? dictionaryStore.getDictionaryEntry(canonical) : null;
  if (!entry) {
    return { ...notFound, dictionaryId: canonical, status: 'not-found' };
  }

  // 3. Build context from TokenOccurrence (if provided)
  let context = null;
  if (tokenOccurrence && tokenOccurrence.surface) {
    const form = localizeTokenForm(tokenOccurrence.form);
    context = {
      surface: tokenOccurrence.surface,
      reading: tokenOccurrence.reading || tokenOccurrence.surface,
      contextMeaning: tokenOccurrence.contextMeaning || null,
      storyId: tokenOccurrence.storyId || null,
      sentenceId: tokenOccurrence.sentenceId || null,
      tokenId: tokenOccurrence.id || null,
      form,
      resolutionStatus: tokenOccurrence.resolution?.status || 'resolved',
    };
  }

  // 4. Examples (from relationsIndex or empty)
  const examples = relationsIndex
    ? relationsIndex.getExampleReferences(canonical, dictionaryStore)
    : [];

  // 5. Conjugations (deterministic, uses existing engine)
  const currentLesson = _getCurrentLesson(state, activeCourseId);
  const conjugations = getConjugationsWithStatus(entry, currentLesson);

  // 6. Grammar topics
  const grammarTopics = getTypeBasedGrammarLinks(entry);
  if (relationsIndex) {
    const explicitLinks = relationsIndex._grammarIndex.get(canonical) || [];
    grammarTopics.push(...explicitLinks);
  }

  // 7. Lessons (from DictionaryRelationsIndex / DictionaryStore course references)
  let lessons = [];
  const refs = relationsIndex
    ? relationsIndex.getLessonReferences(canonical, dictionaryStore)
    : dictionaryStore
      ? dictionaryStore.findCourseReferencesForDictionary(canonical)
      : [];

  lessons = refs.map((ref) => ({
    courseId: ref.courseId,
    lessonId: ref.lessonId || ref.chapterId || ref.introducedIn,
    introducedIn: ref.introducedIn,
    courseMeaning: ref.courseMeaning || '',
    introduced: ref.introduced !== undefined ? Boolean(ref.introduced) : true,
    occurrenceCount: ref.occurrenceCount || 1,
    sources: ref.sources || ['vocabulary'],
    status: ref.status || 'available',
    isActiveCourse: ref.courseId === activeCourseId,
  }));

  // Active course first
  lessons.sort((a, b) => {
    if (a.isActiveCourse && !b.isActiveCourse) return -1;
    if (!a.isActiveCourse && b.isActiveCourse) return 1;
    return 0;
  });

  // 8. Story occurrences (from storyIndex)
  const storyOccurrences = storyIndex ? storyIndex.getOccurrences(canonical, dictionaryStore) : [];

  // 9. FSRS summary (read-only, no mutations)
  let fsrs = null;
  if (srs && state) {
    try {
      fsrs = getDictionaryFSRS({ dictionaryId: canonical, state, srs, now });
    } catch {
      fsrs = null;
    }
  }

  return {
    dictionaryId: canonical,
    status: 'found',
    entry,
    context,
    examples,
    conjugations,
    grammarTopics,
    lessons,
    storyOccurrences,
    fsrs,
    source: entry.source || 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Helper: determine user's current lesson number
// ---------------------------------------------------------------------------

/**
 * Extract the current lesson number from state for the active course.
 * Used to determine conjugation visibility.
 * @param {object|null} state
 * @param {string|null} activeCourseId
 * @returns {number|null}
 */
function _getCurrentLesson(state, activeCourseId) {
  if (!state) return null;

  // Try to find the highest completed/started lesson number
  const chapters = state.chapters || {};
  let maxLesson = 0;
  let found = false;

  for (const [lessonId, chapterState] of Object.entries(chapters)) {
    if (!chapterState?.started) continue;

    // Extract lesson number from lessonId (e.g. 'lesson-3' → 3)
    const match = String(lessonId).match(/(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxLesson) {
        maxLesson = n;
        found = true;
      }
    }
  }

  return found ? maxLesson : null;
}

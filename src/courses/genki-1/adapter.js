import {
  GENKI_RETIRED_VOCABULARY_IDS,
  GENKI_VOCABULARY_ID_ALIASES,
} from './migrations/vocabulary-id-map.js';

const retiredVocabularyIds = new Set(GENKI_RETIRED_VOCABULARY_IDS);

export const genki1Adapter = Object.freeze({
  courseId: 'genki-1',

  canonicalizeVocabularyLocalId(localId) {
    let current = String(localId || '');
    const visited = new Set();
    while (GENKI_VOCABULARY_ID_ALIASES[current] && !visited.has(current)) {
      visited.add(current);
      current = GENKI_VOCABULARY_ID_ALIASES[current];
    }
    return current;
  },

  isRetiredVocabularyLocalId(localId) {
    return retiredVocabularyIds.has(String(localId || ''));
  },

  lessonLocalIdFromVocabularyLocalId(localId) {
    const match = /^L(\d+)_V\d+$/u.exec(String(localId || ''));
    return match ? Number(match[1]) : null;
  },

  lessonLocalIdFromGrammarLocalId(localId) {
    const match = /^L(\d+)_g\d+/u.exec(String(localId || ''));
    return match ? Number(match[1]) : null;
  },
});

import {
  DictionaryEntrySchema,
  normalizeCourseVocabularyReference,
} from './dictionary-contract.js';

export function resolveCourseVocabulary(referenceInput, dictionaryEntryInput) {
  const reference = normalizeCourseVocabularyReference(referenceInput);
  const entry = DictionaryEntrySchema.parse(dictionaryEntryInput);
  if (reference.dictionaryId !== entry.id) {
    throw new Error(
      `[Dictionary] Course reference ${reference.id} points to ${reference.dictionaryId}, received ${entry.id}`
    );
  }
  const courseMeaning = reference.courseMeaning || entry.meanings[0];
  const category = reference.tags[0] || '';
  const grammaticalCategories = new Set([
    'nouns',
    'noun',
    'verbs_u',
    'verbs_ru',
    'verbs_irr',
    'u-verbs',
    'ru-verbs',
    'irregular-verbs',
    'i-adjectives',
    'na-adjectives',
    'adjectives',
    'adverbs',
    'particles',
    'expressions',
  ]);
  const topic =
    reference.tags[1] || (grammaticalCategories.has(category) ? null : category || null);
  return Object.freeze({
    id: reference.id,
    localId: reference.localId,
    referenceId: reference.id,
    dictionaryId: entry.id,
    knowledgeItemId: entry.id,
    courseId: reference.courseId,
    introducedIn: reference.introducedIn,
    lessonId: reference.lessonId || reference.introducedIn,
    chapterId: reference.chapterId || reference.introducedIn,
    courseMeaning,
    tags: [...reference.tags],
    note: reference.note,
    contextProduction: reference.contextProduction,
    acceptedAnswers: reference.acceptedAnswers,
    particlePatterns: reference.particlePatterns,
    examples: reference.examples,
    dictionaryForm: entry.dictionaryForm,
    reading: entry.reading,
    meanings: [...entry.meanings],
    partOfSpeech: entry.partOfSpeech,
    verbClass: entry.verbClass,
    adjectiveClass: entry.adjectiveClass,
    transitivity: entry.transitivity,
    tokenForms: [...entry.tokenForms],
    semanticTags: [...entry.semanticTags],
    romaji: entry.romaji,
    source: entry.source,
    confidence: entry.confidence,
    provenance: entry.provenance,
    // Temporary compatibility aliases. Their linguistic source is DictionaryEntry.
    kanji: entry.dictionaryForm,
    writtenForm: entry.dictionaryForm,
    writing: entry.reading,
    translation: courseMeaning,
    meaning: courseMeaning,
    lexemeId: entry.id,
    lesson: reference.introducedIn,
    lessonIds: [reference.introducedIn],
    category,
    topic,
  });
}

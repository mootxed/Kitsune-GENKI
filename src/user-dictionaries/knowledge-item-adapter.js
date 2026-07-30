import { getUserEntryCapabilities } from './capabilities.js';

export function createKnowledgeItemFromUserEntry(entry) {
  const capabilities = getUserEntryCapabilities(entry);
  const knowledgeItemId = entry.globalDictionaryId || entry.id;
  return {
    id: entry.id,
    dictionaryId: entry.globalDictionaryId || null,
    knowledgeItemId,
    sourceType: 'user-dictionary',
    sourceDictionaryId: entry.dictionaryId,
    learningEnabled: entry.learningEnabled,
    writing: entry.writing || entry.reading,
    kanji: entry.writing,
    reading: entry.reading,
    kana: entry.reading,
    translation: entry.meanings.join('; '),
    russian: entry.meanings.join('; '),
    meanings: [...entry.meanings],
    acceptedAnswers: [...capabilities.acceptedAnswers],
    examples: entry.examples.map((example) => ({ ...example })),
    productionTask: entry.productionTask ? { ...entry.productionTask } : undefined,
    contextProduction: entry.productionTask
      ? {
          ...entry.productionTask,
          id: `${entry.id}_cp`,
          focusItemId: knowledgeItemId,
        }
      : undefined,
    capabilities,
  };
}

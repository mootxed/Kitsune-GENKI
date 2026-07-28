import { getUserEntryCapabilities } from './capabilities.js';

export function createKnowledgeItemFromUserEntry(entry) {
  const capabilities = getUserEntryCapabilities(entry);
  return {
    id: entry.id,
    sourceType: 'user-dictionary',
    sourceDictionaryId: entry.dictionaryId,
    learningEnabled: entry.learningEnabled,
    writing: entry.writing || entry.reading,
    kanji: entry.writing,
    reading: entry.reading,
    kana: entry.reading,
    russian: entry.meanings.join('; '),
    meanings: [...entry.meanings],
    acceptedAnswers: [...capabilities.acceptedAnswers],
    examples: entry.examples.map((example) => ({ ...example })),
    productionTask: entry.productionTask ? { ...entry.productionTask } : undefined,
    contextProduction: entry.productionTask
      ? {
          ...entry.productionTask,
          id: `${entry.id}_cp`,
          focusItemId: entry.id,
        }
      : undefined,
    capabilities,
  };
}

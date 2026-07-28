import { SKILLS, vocabularySkills } from '../knowledge-model.js';
import { typingCapability } from '../typing-capability.js';

export function getUserEntryCapabilities(entry) {
  const acceptedAnswers = [
    entry.writing,
    entry.reading,
    ...(entry.alternativeWritings || []),
  ].filter(Boolean);
  const typing = typingCapability(entry, acceptedAnswers);
  const word = {
    ...entry,
    acceptedAnswers,
    writing: entry.writing || entry.reading,
    kanji: entry.writing,
    contextProduction: entry.productionTask
      ? {
          ...entry.productionTask,
          id: `${entry.id}_cp`,
          focusItemId: entry.id,
        }
      : undefined,
  };
  const commonSkills = vocabularySkills(word);
  return {
    recognition: Boolean((entry.writing || entry.reading) && entry.meanings?.length),
    recall: typing.canType,
    activeProduction: typing.canType,
    contextProduction: commonSkills.includes(SKILLS.CONTEXT_PRODUCTION),
    drawing: commonSkills.includes(SKILLS.READING_WRITING),
    acceptedAnswers: typing.acceptedAnswers,
    skills: commonSkills,
  };
}

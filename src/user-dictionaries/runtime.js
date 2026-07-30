import { calculateMastery } from '../mastery.js';
import { cardsForItem, knowledgeItemIdForWord, vocabularySkills } from '../knowledge-model.js';
import { SRS } from '../../srs.js';
import { createKnowledgeItemFromUserEntry } from './knowledge-item-adapter.js';
import { UserDictionaryRepository } from './repository.js';
import { syncUserEntryCards } from './learning-service.js';

export const USER_DICTIONARY_LESSON_ID = 'user-dictionaries';

export async function loadUserDictionaryKnowledgeItems(
  repository = new UserDictionaryRepository()
) {
  const dictionaries = await repository.listDictionaries();
  const entries = (
    await Promise.all(dictionaries.map((dictionary) => repository.listEntries(dictionary.id)))
  ).flat();
  return entries.filter((entry) => entry.learningEnabled).map(createKnowledgeItemFromUserEntry);
}

export async function refreshUserDictionaryLesson(
  lessons,
  repository = new UserDictionaryRepository(),
  state = null
) {
  const dictionaries = await repository.listDictionaries();
  const entries = (
    await Promise.all(dictionaries.map((dictionary) => repository.listEntries(dictionary.id)))
  ).flat();
  let added = 0;
  if (state) {
    for (const entry of entries) {
      const result = syncUserEntryCards(entry, state);
      added += result.added;
    }
  }
  const words = entries
    .filter((entry) => entry.learningEnabled)
    .map(createKnowledgeItemFromUserEntry);
  const existingIndex = lessons.findIndex((lesson) => lesson.id === USER_DICTIONARY_LESSON_ID);
  const lesson = {
    id: USER_DICTIONARY_LESSON_ID,
    title: 'Мои словари',
    words,
    vocabulary: words,
    sourceType: 'user-dictionary',
  };
  if (existingIndex >= 0) lessons[existingIndex] = lesson;
  else lessons.push(lesson);
  return { lesson, added };
}

export function isUserDictionaryWordLearned(word, state) {
  if (word?.sourceType !== 'user-dictionary') return true;
  if (!word.learningEnabled) return false;
  const itemId = knowledgeItemIdForWord(word);
  const mastery = calculateMastery({
    itemId,
    cards: cardsForItem(state.srs, itemId),
    events: state.reviewEvents || [],
    archive: state.masteryArchive?.[itemId],
    applicableSkills: vocabularySkills(word),
    getRetrievability: (card, now) => SRS.getRetrievability(card, now),
  });
  return mastery.level === 'Уверенно' || mastery.level === 'Освоено';
}

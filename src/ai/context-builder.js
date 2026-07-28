import { AI_INTENTS } from './intents.js';
import { selectRelevantMessages } from './chat-history.js';
import { selectWords, tokenizeWordsForPrompt } from './word-selector.js';

function explicitJlpt(settings = {}) {
  const value = settings.jlptTarget;
  return /^N[1-5]$/u.test(value || '') ? value : null;
}

async function getDictionaryEntries(repository, dictionaryId) {
  if (!repository) return [];
  if (dictionaryId) return repository.listEntries(dictionaryId);
  const dictionaries = await repository.listDictionaries();
  const groups = await Promise.all(
    dictionaries.slice(0, 20).map((dictionary) => repository.listEntries(dictionary.id))
  );
  return groups.flat();
}

export async function buildAIContext({
  intentResult,
  state = {},
  lessons = [],
  repository = null,
  history = state.chatHistory,
  wordLimit = 12,
} = {}) {
  const context = {
    recentMessages: selectRelevantMessages(history, 12),
  };
  const jlptTarget = explicitJlpt(state.settings);
  if (jlptTarget) context.jlptTarget = jlptTarget;

  const needsWords =
    intentResult.intent === AI_INTENTS.CREATE_STORY ||
    intentResult.intent === AI_INTENTS.CREATE_QUIZ ||
    intentResult.wordSource ||
    intentResult.dictionaryId;
  if (needsWords) {
    const userEntries =
      intentResult.wordSource === 'user_dictionary' ||
      intentResult.wordSource === 'mixed' ||
      intentResult.dictionaryId
        ? await getDictionaryEntries(repository, intentResult.dictionaryId)
        : [];
    const selected = selectWords({
      source: intentResult.wordSource || 'mixed',
      state,
      lessons,
      userEntries,
      explicitWords: intentResult.explicitWords || [],
      currentLessonId: intentResult.currentLessonId || state.activeChapterId,
      limit: wordLimit,
    });
    const { promptWords, idMap } = tokenizeWordsForPrompt(selected);
    context.words = promptWords;
    Object.defineProperty(context, 'localWordIds', {
      value: idMap,
      enumerable: false,
    });
  }
  if (intentResult.topic) context.topic = intentResult.topic;
  if (intentResult.tone) context.tone = intentResult.tone;
  if (intentResult.length) context.length = intentResult.length;
  if (intentResult.storyContext) context.storyContext = intentResult.storyContext;
  return context;
}

export function serializeAIContext(context = {}) {
  const safe = {
    ...(context.jlptTarget ? { jlptTarget: context.jlptTarget } : {}),
    ...(context.words?.length ? { words: context.words } : {}),
    ...(context.topic ? { topic: context.topic } : {}),
    ...(context.tone ? { tone: context.tone } : {}),
    ...(context.length ? { length: context.length } : {}),
    ...(context.storyContext ? { storyContext: context.storyContext } : {}),
    recentMessages: (context.recentMessages || []).slice(-12),
  };
  return JSON.stringify(safe);
}

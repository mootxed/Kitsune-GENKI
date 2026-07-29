import { z } from 'zod';

export const AI_INTENTS = Object.freeze({
  GENERAL_QUESTION: 'general_question',
  EXPLAIN_WORD: 'explain_word',
  EXPLAIN_GRAMMAR: 'explain_grammar',
  COMPARE_ITEMS: 'compare_items',
  CREATE_STORY: 'create_story',
  CREATE_QUIZ: 'create_quiz',
  CLARIFY_REQUEST: 'clarify_request',
  // Review-specific intents — triggered from card UI, not the chat composer
  EXPLAIN_REVIEW_ERROR: 'explain_review_error',
  CREATE_MNEMONIC: 'create_mnemonic',
});

export const WORD_SOURCES = Object.freeze([
  'explicit_words',
  'user_dictionary',
  'fsrs_difficult',
  'fsrs_learned',
  'current_lesson',
  'mixed',
]);

export const ExplicitActionSchema = z.enum([
  AI_INTENTS.GENERAL_QUESTION,
  AI_INTENTS.EXPLAIN_WORD,
  AI_INTENTS.EXPLAIN_GRAMMAR,
  AI_INTENTS.COMPARE_ITEMS,
  AI_INTENTS.CREATE_STORY,
  AI_INTENTS.CREATE_QUIZ,
]);

const clean = (value) => String(value || '').trim();

function stripActionPrefix(text, patterns) {
  let result = clean(text);
  for (const pattern of patterns) result = result.replace(pattern, '').trim();
  return result || clean(text);
}

export function buildExplicitIntent(action, text, overrides = {}) {
  const intent = ExplicitActionSchema.parse(action);
  const sourceText = clean(text);
  if (intent === AI_INTENTS.EXPLAIN_WORD) {
    return {
      intent,
      word: stripActionPrefix(sourceText, [/^объясни(?:ть)?\s+(?:слово\s+)?/iu]),
      ...overrides,
    };
  }
  if (intent === AI_INTENTS.EXPLAIN_GRAMMAR) {
    return {
      intent,
      grammar: stripActionPrefix(sourceText, [/^объясни(?:ть)?\s+(?:грамматику\s+)?/iu]),
      complexity: overrides.complexity || 'normal',
      ...overrides,
    };
  }
  if (intent === AI_INTENTS.COMPARE_ITEMS) {
    const comparison = stripActionPrefix(sourceText, [/^сравни(?:ть)?\s+/iu]);
    const targets = comparison
      .split(/\s+(?:и|или|vs\.?|против)\s+|[,/]/iu)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
    return {
      intent,
      itemType: overrides.itemType || 'auto',
      targets,
      complexity: overrides.complexity || 'complex',
      ...overrides,
    };
  }
  if (intent === AI_INTENTS.CREATE_STORY) {
    return {
      intent,
      topic: stripActionPrefix(sourceText, [/^созда(?:й|ть)\s+(?:историю\s+)?/iu]),
      tone: overrides.tone || 'neutral',
      length: overrides.length || 'short',
      wordSource: overrides.wordSource || 'mixed',
      explicitWords: overrides.explicitWords || [],
      ...(overrides.dictionaryId ? { dictionaryId: overrides.dictionaryId } : {}),
      ...(overrides.dictionaryName ? { dictionaryName: overrides.dictionaryName } : {}),
      ...overrides,
    };
  }
  if (intent === AI_INTENTS.CREATE_QUIZ) {
    return {
      intent,
      topic: stripActionPrefix(sourceText, [/^созда(?:й|ть)\s+(?:квиз\s+)?/iu]),
      complexity: overrides.complexity || 'normal',
      ...overrides,
    };
  }
  return { intent, question: sourceText, ...overrides };
}

export const STARTER_ACTIONS = Object.freeze([
  {
    intent: AI_INTENTS.EXPLAIN_WORD,
    icon: '語',
    title: 'Объяснить слово',
    prompt: 'Какое слово объяснить?',
  },
  {
    intent: AI_INTENTS.EXPLAIN_GRAMMAR,
    icon: '文',
    title: 'Объяснить грамматику',
    prompt: 'Какую конструкцию объяснить?',
  },
  {
    intent: AI_INTENTS.COMPARE_ITEMS,
    icon: '対',
    title: 'Сравнить',
    prompt: 'Что сравнить? Например: は и が',
  },
  {
    intent: AI_INTENTS.CREATE_STORY,
    icon: '物',
    title: 'Создать историю',
    prompt: 'Задайте тему истории',
  },
  {
    intent: AI_INTENTS.GENERAL_QUESTION,
    icon: '問',
    title: 'Задать свободный вопрос',
    prompt: 'Спросите что угодно о японском',
  },
]);

import { AI_INTENTS } from '../intents.js';
import { handleGeneralQuestion } from './general-question.js';
import { handleExplainWord } from './explain-word.js';
import { handleExplainGrammar } from './explain-grammar.js';
import { handleCompareItems } from './compare-items.js';
import { handleCreateStory } from './create-story.js';
import { handleCreateQuiz } from './create-quiz.js';
import { handleExplainReviewError } from './explain-review-error.js';
import { handleCreateMnemonic } from './create-mnemonic.js';

export const AI_HANDLERS = Object.freeze({
  [AI_INTENTS.GENERAL_QUESTION]: handleGeneralQuestion,
  [AI_INTENTS.EXPLAIN_WORD]: handleExplainWord,
  [AI_INTENTS.EXPLAIN_GRAMMAR]: handleExplainGrammar,
  [AI_INTENTS.COMPARE_ITEMS]: handleCompareItems,
  [AI_INTENTS.CREATE_STORY]: handleCreateStory,
  [AI_INTENTS.CREATE_QUIZ]: handleCreateQuiz,
  [AI_INTENTS.EXPLAIN_REVIEW_ERROR]: handleExplainReviewError,
  [AI_INTENTS.CREATE_MNEMONIC]: handleCreateMnemonic,
});

export function getAIHandler(intent) {
  return AI_HANDLERS[intent] || null;
}

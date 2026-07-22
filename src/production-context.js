/* Validation and normalization for curated active-production prompts. */

import { normalizeKanaAnswer, parseTypingAnswers } from './typing-capability.js';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns a trustworthy production task or null. Production evidence must be
 * backed by an explicit prompt, a meaning cue and explicit accepted answers.
 */
export function productionContext(word) {
  const source = word?.contextProduction || word?.context_production;
  if (!source || typeof source !== 'object') return null;

  const prompt = source.prompt?.trim();
  const meaningCue = source.meaningCue?.trim();
  const requiredForm = source.requiredForm?.trim();
  if (!nonEmptyString(prompt) || !prompt.includes('_') || !nonEmptyString(meaningCue)) return null;
  if (!nonEmptyString(requiredForm)) return null;

  const declaredAnswers = Array.isArray(source.acceptedAnswers)
    ? source.acceptedAnswers
    : [source.acceptedAnswers];
  const acceptedAnswers = declaredAnswers
    .flatMap((answer) => parseTypingAnswers(answer))
    .map(normalizeKanaAnswer)
    .filter(Boolean)
    .filter((answer, index, answers) => answers.indexOf(answer) === index);
  if (acceptedAnswers.length === 0) return null;

  return { prompt, meaningCue, acceptedAnswers, requiredForm };
}

/**
 * distractor-validator.js
 * Validates distractor sets for multiple-choice quiz questions.
 */

import { canonicalHiragana } from '../../src/dictionary/dictionary-id.js';

/**
 * Validate a set of distractors against a correct answer.
 * @param {object} params
 * @param {string} params.correctAnswer
 * @param {string[]} params.distractors
 * @param {string} [params.partOfSpeech]
 * @param {string[]} [params.meanings]
 * @returns {{ valid: boolean, issues: string[] }}
 */
export function validateDistractorSet({
  correctAnswer,
  distractors,
  _partOfSpeech = null,
  meanings = [],
}) {
  const issues = [];
  if (!Array.isArray(distractors) || distractors.length === 0) {
    return { valid: true, issues: [] };
  }

  const normalizedCorrect = canonicalHiragana(correctAnswer.toLowerCase().trim());
  const normalizedMeanings = (meanings || []).map((m) => String(m).toLowerCase().trim());

  const seen = new Set();
  seen.add(normalizedCorrect);

  for (let i = 0; i < distractors.length; i++) {
    const raw = distractors[i];
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      issues.push(`Distractor [${i}] is empty or invalid`);
      continue;
    }

    const norm = canonicalHiragana(raw.toLowerCase().trim());

    // 1. Check duplicate distractors
    if (seen.has(norm)) {
      issues.push(`Duplicate distractor or matches correct answer: "${raw}"`);
    } else {
      seen.add(norm);
    }

    // 2. Check if distractor matches any secondary meaning of correct answer
    for (const meaning of normalizedMeanings) {
      if (meaning && norm === meaning) {
        issues.push(
          `Distractor "${raw}" matches secondary meaning of correct answer ("${meaning}")`
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

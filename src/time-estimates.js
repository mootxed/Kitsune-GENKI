/* src/time-estimates.js — Centralized time estimation constants & helpers */

export const TIME_ESTIMATES = Object.freeze({
  REVIEW_CARD_MINUTES: 0.2, // ~12 seconds per card review
  VOCAB_WORD_MINUTES: 1.0, // 1 minute per new word introduction
  GRAMMAR_TOPIC_MINUTES: 12.0, // 12 minutes per grammar topic
  DEFAULT_PRACTICE_MINUTES: 10.0, // 10 minutes for practice task
  DEFAULT_BONUS_MINUTES: 10.0, // 10 minutes for bonus task
});

export const DEFAULT_DAILY_CAPACITY_MINUTES = 30;
export const VALID_CAPACITY_OPTIONS = Object.freeze([15, 30, 45, 60]);

export function calculateReviewMinutes(dueCount) {
  return Math.ceil(Math.max(0, Number(dueCount) || 0) * TIME_ESTIMATES.REVIEW_CARD_MINUTES);
}

export function calculateVocabMinutes(wordCount) {
  return Math.ceil(Math.max(0, Number(wordCount) || 0) * TIME_ESTIMATES.VOCAB_WORD_MINUTES);
}

export function calculateGrammarMinutes(topic = null) {
  return Number(topic?.estimatedMinutes) || TIME_ESTIMATES.GRAMMAR_TOPIC_MINUTES;
}

export function calculatePracticeMinutes(task = null) {
  return Number(task?.estimatedMinutes) || TIME_ESTIMATES.DEFAULT_PRACTICE_MINUTES;
}

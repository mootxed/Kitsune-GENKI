/**
 * tests/sensei-review-fixes.test.js
 *
 * Comprehensive tests for AI Sensei integration, card review lifecycle,
 * FSRS pre-review context, incorrect attempts tracking, supplemental practice snapshots,
 * and response time thresholds.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RESPONSE_TIME_THRESHOLDS } from '../src/card-behavior.js';
import {
  DIAGNOSIS_CATEGORIES,
  ReviewAttemptSnapshotSchema,
} from '../src/ai/review-attempt-schema.js';
import { hasRecentLapse } from '../src/ai/review-memory-context.js';
import { buildReviewAttemptSnapshot } from '../src/ai/review-context-builder.js';
import { adaptTypingContext } from '../ui/flashcards/review-context-adapters.js';
import {
  shouldShowSenseiAction,
  buildSenseiActionInput,
} from '../ui/flashcards/sensei-review-actions.js';
import { handleExplainReviewError } from '../src/ai/handlers/explain-review-error.js';
import { importReviewExplanationToChat } from '../ui/chat.js';
import { submitReview } from '../ui/flashcards/review-fsrs.js';
import { SRS } from '../srs.js';
import { SessionManager } from '../session-manager.js';
import { lockCurrentReviewUI } from '../ui/flashcards/card-modes.js';
import { clearPostReviewSenseiActions } from '../ui/flashcards/sensei-review-panel.js';
import { clearActiveReviewAIContext } from '../ui/flashcards/state.js';

describe('AI Sensei & Review Lifecycle Fixes', () => {
  beforeEach(() => {
    clearActiveReviewAIContext();
  });

  describe('Point 10: Response Time Thresholds', () => {
    it('contains thresholds for reverse-multiple-choice and context-sentence', () => {
      expect(RESPONSE_TIME_THRESHOLDS['reverse-multiple-choice']).toEqual({
        fast: 3000,
        slow: 10000,
      });
      expect(RESPONSE_TIME_THRESHOLDS['context-sentence']).toEqual({ fast: 5000, slow: 15000 });
    });
  });

  describe('Point 8: hasRecentLapse with reviewEvents', () => {
    const now = Date.now();
    const cardId = 'genki1_l1_v1:recognition';
    const srsCard = { id: cardId, lapses: 2, last_review: now - 1000 };

    it('returns false if recent review event was Good (effectiveRating !== 0)', () => {
      const reviewEvents = [
        { cardId, effectiveRating: 3, reviewedAt: now - 1000, eventType: 'review' },
        { cardId, effectiveRating: 0, reviewedAt: now - 40 * 86400000, eventType: 'review' },
      ];
      expect(hasRecentLapse(srsCard, reviewEvents, 30, now)).toBe(false);
    });

    it('returns true if most recent non-undone review event was Again (effectiveRating === 0)', () => {
      const reviewEvents = [
        { cardId, effectiveRating: 0, reviewedAt: now - 1000, eventType: 'review' },
        { cardId, effectiveRating: 3, reviewedAt: now - 5000, eventType: 'review' },
      ];
      expect(hasRecentLapse(srsCard, reviewEvents, 30, now)).toBe(true);
    });

    it('ignores undone review events', () => {
      const reviewEvents = [
        {
          cardId,
          effectiveRating: 0,
          reviewedAt: now - 500,
          undoneAt: now - 100,
          eventType: 'review',
        },
        { cardId, effectiveRating: 3, reviewedAt: now - 1000, eventType: 'review' },
      ];
      expect(hasRecentLapse(srsCard, reviewEvents, 30, now)).toBe(false);
    });
  });

  describe('Point 7: FSRS Pre-review Card Context', () => {
    it('uses pre-review card snapshot to evaluate memory stage', () => {
      const preCard = { id: 'c1', reps: 1, stability: 5, lapses: 0 };
      const word = { writing: '食べる', reading: 'たべる', meanings: ['есть'] };
      const aiAttempt = adaptTypingContext({
        word,
        acceptedAnswers: ['食べる'],
        userAnswer: '食べる',
        mistakes: 0,
        hintUsed: false,
        firstAttemptCorrect: true,
      });

      const snapshot = buildReviewAttemptSnapshot({
        card: preCard,
        word,
        mode: 'typing',
        submitResult: { accepted: true },
        aiAttempt,
        srsCard: preCard,
        reviewEvents: [],
        responseTimeMs: 16000,
      });

      expect(snapshot).not.toBeNull();
      expect(snapshot.memoryContext.stage).toBe('fragile');
    });
  });

  describe('Point 4 & Schema: Structured incorrectAttempts', () => {
    it('includes no_error in DIAGNOSIS_CATEGORIES', () => {
      expect(DIAGNOSIS_CATEGORIES).toContain('no_error');
    });

    it('stores and validates structured incorrectAttempts array', () => {
      const incorrectAttempts = [
        { rawAnswer: 'たべます', normalizedAnswer: 'たべます', timestamp: Date.now() },
      ];

      const word = { writing: '食べる', reading: 'たべる', meanings: ['есть'] };
      const aiAttempt = adaptTypingContext({
        word,
        acceptedAnswers: ['食べる'],
        userAnswer: '食べる',
        mistakes: 1,
        hintUsed: false,
        firstAttemptCorrect: false,
        incorrectAttempts,
      });

      expect(aiAttempt.incorrectAttempts).toHaveLength(1);
      expect(aiAttempt.incorrectAttempts[0].rawAnswer).toBe('たべます');

      const snapshot = buildReviewAttemptSnapshot({
        card: { id: 'c1', reps: 1, stability: 5, lapses: 0 },
        word,
        mode: 'typing',
        submitResult: { accepted: true },
        aiAttempt,
        srsCard: { id: 'c1', reps: 1, stability: 5, lapses: 0 },
        reviewEvents: [],
        responseTimeMs: 2000,
      });

      expect(snapshot.answer.incorrectAttempts).toHaveLength(1);
      expect(snapshot.answer.incorrectAttempts[0].rawAnswer).toBe('たべます');
      expect(ReviewAttemptSnapshotSchema.safeParse(snapshot).success).toBe(true);
    });
  });

  describe('Point 9: Supplemental Practice Snapshot Path', () => {
    it('creates AI snapshot for supplemental practice (particle-quiz) with supplementalAccepted', () => {
      const word = { writing: 'に', reading: 'に', meanings: ['в, на (частица)'] };
      const aiAttempt = {
        prompt: 'Выберите частицу: 学校___行く',
        instruction: 'в школу',
        expectedAnswers: ['に'],
        userAnswer: null,
        selectedOption: 'に',
        correctOption: 'に',
        mistakes: 0,
        hintUsed: false,
        firstAttemptCorrect: true,
        incorrectAttempts: [],
      };

      const submitResult = { accepted: false, supplementalAccepted: true };
      const snapshot = buildReviewAttemptSnapshot({
        card: { id: 'particle:1', reps: 0, stability: 0 },
        word,
        mode: 'particle-quiz',
        submitResult,
        aiAttempt,
        srsCard: { id: 'particle:1' },
        reviewEvents: [],
        responseTimeMs: 2000,
      });

      expect(snapshot).not.toBeNull();
      expect(snapshot.mode).toBe('particle-quiz');
    });

    it('submitReview does not change FSRS card state or add SRS review event for particle-quiz', () => {
      const card = { id: 'genki1_l1_v1::recognition', reps: 2, stability: 10, due: '2026-07-29' };
      const word = {
        id: 'genki1_l1_v1',
        writing: '学校',
        reading: 'がっこう',
        meanings: ['школа'],
      };
      const state = {
        srs: { 'genki1_l1_v1::recognition': { ...card } },
        dictionary: [word],
        reviewEvents: [],
      };
      const initialSnapshot = JSON.parse(JSON.stringify(state.srs['genki1_l1_v1::recognition']));

      const aiAttempt = {
        prompt: 'Test prompt',
        expectedAnswers: ['に'],
        mistakes: 0,
        hintUsed: false,
      };

      const res = submitReview({ id: 'genki1_l1_v1::recognition' }, SRS.Quality.Good, state, {
        mode: 'particle-quiz',
        responseTimeMs: 1500,
        aiAttempt,
      });

      expect(res.accepted).toBe(false);
      expect(res.supplementalAccepted).toBe(true);
      expect(state.srs['genki1_l1_v1::recognition']).toEqual(initialSnapshot);
      expect(state.reviewEvents).toHaveLength(0);
      expect(res._snapshotReady).toBe(true);
    });
  });

  describe('Point 6 & 5: Reason-Aware Prompting & Drawing Mode', () => {
    it('hides explain_error and provides explain_more for Drawing mode with errors', () => {
      const snapshot = {
        schemaVersion: 1,
        item: { writing: '始', reading: 'はじめ', meanings: ['начинать'], partOfSpeech: ['kanji'] },
        skill: 'reading-writing',
        mode: 'drawing',
        task: { prompt: 'По переводу «начинать» напишите кандзи' },
        answer: {
          expectedAnswers: ['始'],
          userAnswer: null,
          selectedOption: null,
          correctOption: '始',
        },
        result: {
          outcome: 'incorrect',
          mistakes: 1,
          hintUsed: false,
          firstAttemptCorrect: false,
          responseTimeBand: 'normal',
        },
        memoryContext: { stage: 'fragile', isLeech: false, recentLapse: false },
      };

      const decision = shouldShowSenseiAction(snapshot);
      expect(decision.show).toBe(true);
      const actionTypes = decision.actions.map((a) => a.actionType);
      expect(actionTypes).not.toContain('explain_error');
      expect(actionTypes).toContain('explain_more');
    });

    it('builds action input with reason property', () => {
      const snapshot = {
        schemaVersion: 1,
        item: {
          writing: '行きます',
          reading: 'いきます',
          meanings: ['идти'],
          partOfSpeech: ['verb'],
        },
        skill: 'recognition',
        mode: 'typing',
        task: { prompt: 'Напишите слово' },
        answer: { expectedAnswers: ['行く'], userAnswer: '行きます' },
        result: {
          outcome: 'correct',
          mistakes: 0,
          hintUsed: false,
          firstAttemptCorrect: true,
          responseTimeBand: 'slow',
        },
        memoryContext: { stage: 'fragile', isLeech: false, recentLapse: false },
      };

      const input = buildSenseiActionInput(snapshot, 'explain_more', null, 'slow_answer');
      expect(input.reason).toBe('slow_answer');
    });

    it('handleExplainReviewError accepts reason=slow_answer and returns category=no_error', async () => {
      const snapshot = {
        schemaVersion: 1,
        item: {
          writing: '行きます',
          reading: 'いきます',
          meanings: ['идти'],
          partOfSpeech: ['verb'],
        },
        skill: 'recognition',
        mode: 'typing',
        task: { prompt: 'Напишите слово' },
        answer: {
          expectedAnswers: ['行く'],
          userAnswer: '行く',
          selectedOption: null,
          correctOption: null,
        },
        result: {
          outcome: 'correct',
          mistakes: 0,
          hintUsed: false,
          firstAttemptCorrect: true,
          responseTimeBand: 'slow',
        },
        memoryContext: { stage: 'fragile', isLeech: false, recentLapse: false },
      };

      const mockRequest = async () =>
        JSON.stringify({
          type: 'review_explanation',
          diagnosis: { category: 'no_error', message: 'Разбор использования вежливой формы' },
          explanation: 'Вам потребовалось больше времени на этот ответ.',
          comparison: [
            { form: '行く', reading: 'いく', role: 'Словарная форма', isExpected: true },
          ],
          examples: [{ japanese: '明日行きます。', translation: 'Завтра пойду.' }],
          quiz: {
            questions: [
              {
                id: 'q1',
                type: 'usage',
                prompt: 'Когда используется вежливая форма?',
                topic: 'Вежливость',
                options: [
                  { text: 'В разговоре с малознакомыми людьми', isCorrect: true },
                  { text: 'Только с близкими друзьями', isCorrect: false },
                ],
                explanation: 'Правильно.',
              },
            ],
          },
        });

      const res = await handleExplainReviewError({
        input: { attempt: snapshot, localDiagnosis: null, reason: 'slow_answer' },
        request: mockRequest,
      });

      if (!res.success) {
        console.log('handleExplainReviewError issues:', JSON.stringify(res.issues, null, 2));
      }

      expect(res.success).toBe(true);
      expect(res.artifact.diagnosis.category).toBe('no_error');
    });
  });

  describe('Point 3: Chat Continuation', () => {
    it('importReviewExplanationToChat updates state.chatHistory and returns created chat message', () => {
      const state = { chatHistory: [] };
      const artifact = {
        type: 'review_explanation',
        diagnosis: { category: 'polite_instead_of_dictionary_form', message: 'Ошибка формы' },
        explanation: 'Подробное объяснение',
      };
      const snapshot = {
        item: { writing: '行く', reading: 'いく', meanings: ['идти'] },
        result: { outcome: 'incorrect' },
      };

      const msg = importReviewExplanationToChat(artifact, snapshot, state);

      expect(msg).not.toBeNull();
      expect(state.chatHistory).toHaveLength(1);
      expect(state.chatHistory[0].artifact._importedFromReviewPanel).toBe(true);
    });
  });

  describe('Blocker Fixes & Safeguards', () => {
    it('Blocker 1: handleExplainReviewError input schema preserves incorrectAttempts array', async () => {
      let sentInput = null;
      const snapshot = {
        schemaVersion: 1,
        item: { writing: '食べる', reading: 'たべる', meanings: ['есть'], partOfSpeech: [] },
        skill: 'recall',
        mode: 'typing',
        task: { prompt: 'Напишите слово' },
        answer: {
          expectedAnswers: ['食べる'],
          userAnswer: '食べる',
          incorrectAttempts: [
            { rawAnswer: 'たべます', normalizedAnswer: 'たべます', timestamp: 123456 },
          ],
        },
        result: {
          outcome: 'correct',
          mistakes: 1,
          hintUsed: false,
          firstAttemptCorrect: false,
          responseTimeBand: 'normal',
        },
        memoryContext: { stage: 'developing', isLeech: false, recentLapse: false },
      };

      const mockRequest = async (messages) => {
        sentInput = JSON.stringify(messages);
        return JSON.stringify({
          type: 'review_explanation',
          diagnosis: { category: 'no_error', message: 'Разбор' },
          explanation: 'Подробное объяснение',
          comparison: [
            { form: '食べる', reading: 'たべる', role: 'Словарная форма', isExpected: true },
          ],
          examples: [{ japanese: 'ご飯を食べる。', translation: 'Есть еду.' }],
          quiz: {
            questions: [
              {
                id: 'q1',
                type: 'usage',
                prompt: 'Вопрос',
                topic: 'Тема',
                options: [
                  { text: 'Вариант 1', isCorrect: true },
                  { text: 'Вариант 2', isCorrect: false },
                ],
                explanation: 'Объяснение',
              },
            ],
          },
        });
      };

      const res = await handleExplainReviewError({
        input: { attempt: snapshot, localDiagnosis: null, reason: 'error' },
        request: mockRequest,
      });

      expect(res.success).toBe(true);
      expect(sentInput).toContain('incorrectAttempts');
      expect(sentInput).toContain('たべます');
    });

    it('Blocker 3: SessionManager.completeSupplementalPractice completes card without FSRS and advances getNextCard queue', () => {
      const card1 = { id: 'c1', state: 1 };
      const card2 = { id: 'c2', state: 1 };
      const manager = new SessionManager([card1, card2]);

      expect(manager.getNextCard().id).toBe('c1');

      const ok = manager.completeSupplementalPractice('c1', { correct: true });
      expect(ok).toBe(true);
      expect(manager.getNextCard().id).toBe('c2');
      expect(manager.getStats().reviewed).toBe(1);
      expect(manager.getStats().perfect).toBe(1);
      expect(manager.getStats().remaining).toBe(1);
    });

    it('Blocker 2 UI Lock: lockCurrentReviewUI disables controls in #srs-body', () => {
      document.body.innerHTML = `
        <div id="srs-body">
          <button class="quiz-option-btn" id="opt-1">Option 1</button>
          <button class="quiz-option-btn" id="opt-2">Option 2</button>
          <input id="typing-input" value="test" />
          <button id="typing-check">Check</button>
        </div>
      `;

      lockCurrentReviewUI();

      expect(document.getElementById('opt-1').disabled).toBe(true);
      expect(document.getElementById('opt-2').disabled).toBe(true);
      expect(document.getElementById('typing-check').disabled).toBe(true);
    });

    it('Lingering Actions Cleanup: clearPostReviewSenseiActions empties containers', () => {
      document.body.innerHTML = `
        <div id="sensei-post-review-actions"><button id="old-btn">Old</button></div>
        <div id="review-feedback-actions"><button id="old-btn-2">Old 2</button></div>
      `;

      clearPostReviewSenseiActions();

      expect(document.getElementById('sensei-post-review-actions').children.length).toBe(0);
      expect(document.getElementById('review-feedback-actions').children.length).toBe(0);
    });

    it('Drawing Guidance: shouldShowSenseiAction returns reason: writing_guidance for drawing error', () => {
      const snapshot = {
        mode: 'drawing',
        task: { prompt: 'Нарисуйте 日' },
        result: {
          outcome: 'incorrect',
          mistakes: 2,
          hintUsed: false,
          firstAttemptCorrect: false,
          responseTimeBand: 'normal',
        },
        memoryContext: { stage: 'developing', isLeech: false, recentLapse: false },
      };

      const decision = shouldShowSenseiAction(snapshot);
      expect(decision.show).toBe(true);
      expect(decision.actions[0].reason).toBe('writing_guidance');
    });
  });
});

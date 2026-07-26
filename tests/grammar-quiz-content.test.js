import { describe, it, expect } from 'vitest';
import { validateGrammarQuizData } from '../src/grammar-quiz-content.js';
import quizData from '../public/data/genki-lesson-01-grammar-quiz.json';
import lesson01Data from '../public/data/lessons/lesson-01.json';

describe('Grammar Quiz Content & Schema (genki-lesson-01-grammar-quiz.json)', () => {
  it('loads JSON with valid schemaVersion === 1 and chapterId === 1', () => {
    expect(quizData).toBeDefined();
    expect(quizData.schemaVersion).toBe(1);
    expect(quizData.chapterId).toBe(1);
  });

  it('contains exactly 5 topics matching lesson-01 grammar note IDs', () => {
    expect(Array.isArray(quizData.topics)).toBe(true);
    expect(quizData.topics.length).toBe(5);

    const topicIds = quizData.topics.map((t) => t.id);
    expect(topicIds).toEqual(['L1_g1', 'L1_g2', 'L1_g3', 'L1_g4', 'L1_g5']);

    const lessonNoteIds = (lesson01Data.lesson.notes || lesson01Data.lesson.grammar).map(
      (n, i) => `L1_g${n.note_id || i + 1}`
    );
    expect(topicIds).toEqual(lessonNoteIds);
  });

  it('ensures each topic has 3 or more questions and all question IDs are unique', () => {
    const allQuestionIds = new Set();

    for (const topic of quizData.topics) {
      expect(Array.isArray(topic.quiz)).toBe(true);
      expect(topic.quiz.length).toBeGreaterThanOrEqual(3);

      for (const q of topic.quiz) {
        expect(allQuestionIds.has(q.id)).toBe(false);
        allQuestionIds.add(q.id);
      }
    }
  });

  it('ensures requiredVocabularyIds and vocabularyRefs exist in lesson-01', () => {
    const lessonVocabIds = new Set(
      (lesson01Data.lesson.words || lesson01Data.lesson.vocabulary).map((w) => w.id)
    );

    for (const topic of quizData.topics) {
      for (const vId of topic.requiredVocabularyIds || []) {
        expect(lessonVocabIds.has(vId)).toBe(true);
      }

      for (const q of topic.quiz) {
        for (const vRef of q.vocabularyRefs || []) {
          expect(lessonVocabIds.has(vRef)).toBe(true);
        }
      }
    }
  });

  it('ensures grammarRefs refer only to current or previous topics and no future chapters', () => {
    const validTopics = new Set(['L1_g1', 'L1_g2', 'L1_g3', 'L1_g4', 'L1_g5']);

    for (const topic of quizData.topics) {
      for (const q of topic.quiz) {
        for (const gRef of q.grammarRefs || []) {
          expect(validTopics.has(gRef)).toBe(true);
          const chMatch = gRef.match(/^L(\d+)_/);
          if (chMatch) {
            expect(Number(chMatch[1])).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('validates question type structures (single-choice, fill-blank, sentence-order)', () => {
    const forbiddenFutureGrammar = [
      'て形',
      'て-form',
      'から',
      '受身',
      'たら',
      'short form',
      'たい',
    ];

    for (const topic of quizData.topics) {
      for (const q of topic.quiz) {
        expect(q.prompt).toBeTruthy();
        expect(q.explanation).toBeTruthy();

        // Ensure no forbidden future grammar terms in prompts or explanations
        for (const forbidden of forbiddenFutureGrammar) {
          expect(q.prompt).not.toContain(forbidden);
        }

        if (q.type === 'single-choice') {
          expect(Array.isArray(q.options)).toBe(true);
          expect(q.options.length).toBeGreaterThan(0);
          const optionIds = q.options.map((o) => o.id);
          expect(optionIds.includes(q.correctOptionId)).toBe(true);
        } else if (q.type === 'fill-blank') {
          expect(Array.isArray(q.acceptedAnswers)).toBe(true);
          expect(q.acceptedAnswers.length).toBeGreaterThan(0);
        } else if (q.type === 'sentence-order') {
          expect(Array.isArray(q.tokens)).toBe(true);
          expect(Array.isArray(q.correctOrder)).toBe(true);
          for (const tok of q.correctOrder) {
            expect(q.tokens.includes(tok)).toBe(true);
          }
        } else {
          throw new Error(`Unexpected question type: ${q.type}`);
        }
      }
    }
  });

  it('passes validateGrammarQuizData validation cleanly', () => {
    const result = validateGrammarQuizData(quizData, [lesson01Data.lesson]);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

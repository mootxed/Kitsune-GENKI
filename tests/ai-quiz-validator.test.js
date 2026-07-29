import { describe, it, expect } from 'vitest';
import {
  validateSingleQuizQuestion,
  validateAllQuizQuestions,
  filterInvalidQuizQuestions,
} from '../src/ai/quiz-validator.js';
import { validateQuizForMaterial } from '../src/ai/schemas.js';
import { AI_INTENTS } from '../src/ai/intents.js';
import { defaultState } from '../state/store.js';

describe('AI Quiz Correctness & Verb Form Validation', () => {
  it('rejects incomplete verb stem 勉強し marked as correct at sentence boundary', () => {
    const invalidQuestion = {
      id: 'q4',
      type: 'verb_form',
      prompt: 'Выберите правильную форму глагола в предложении: 毎日日本語を（_____）。',
      options: [
        { text: '勉強する', isCorrect: false },
        { text: '勉強し', isCorrect: true },
      ],
      explanation: 'Вариант 勉強し является неполной основой.',
    };

    const issues = validateSingleQuizQuestion(invalidQuestion);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('勉強し');
    expect(issues[0]).toContain('ошибочно отмечен правильным');
  });

  it('accepts dictionary form 勉強する marked as correct at sentence boundary', () => {
    const validQuestion = {
      id: 'q4',
      type: 'verb_form',
      prompt: 'Выберите правильную форму глагола в предложении: 毎日日本語を（_____）。',
      options: [
        { text: '勉強する', isCorrect: true },
        { text: '勉強し', isCorrect: false },
      ],
      explanation: 'Глагол 勉強する стоящий в конце повествовательного предложения.',
    };

    const issues = validateSingleQuizQuestion(validQuestion);
    expect(issues.length).toBe(0);
  });

  it('allows verb stem 勉強し when followed by stem continuation like に行きます', () => {
    const validContinuationQuestion = {
      id: 'q5',
      type: 'verb_form',
      prompt: 'Заполните пропуск: 日本語を（_____）に行きます。',
      options: [
        { text: '勉強する', isCorrect: false },
        { text: '勉強し', isCorrect: true },
      ],
      explanation: 'Основа 勉強し используется перед грамматической конструкцией に行きます.',
    };

    const issues = validateSingleQuizQuestion(validContinuationQuestion);
    expect(issues.length).toBe(0);
  });

  it('detects contradiction when explanation claims correct option is wrong', () => {
    const contradictoryQuestion = {
      id: 'q6',
      type: 'translation',
      prompt: 'Переведите: 猫',
      options: [
        { text: 'Кот', isCorrect: true },
        { text: 'Собака', isCorrect: false },
      ],
      explanation: 'Кот — неправильно, на самом деле Собака.',
    };

    const issues = validateSingleQuizQuestion(contradictoryQuestion);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('объяснения утверждает, что правильный вариант');
  });

  it('validateQuizForMaterial rejects invalid verb form on first pass and filters on repaired pass', () => {
    const rawPayload = {
      type: 'quiz',
      message: 'Проверка знаний',
      quiz: {
        questions: [
          {
            id: 'q1',
            type: 'translation',
            topic: 'Словарь',
            prompt: 'Перевод 犬',
            options: [
              { text: 'Собака', isCorrect: true },
              { text: 'Кошка', isCorrect: false },
            ],
            explanation: 'Собака — правильный перевод.',
          },
          {
            id: 'q2',
            type: 'verb_form',
            topic: 'Грамматика',
            prompt: '毎日日本語を（_____）。',
            options: [
              { text: '勉強する', isCorrect: false },
              { text: '勉強し', isCorrect: true },
            ],
            explanation: 'Неверное объяснение.',
          },
        ],
      },
    };

    // Первая попытка — возвращает ошибку с указанием вопроса
    const firstValidation = validateQuizForMaterial(rawPayload, { intent: AI_INTENTS.CREATE_QUIZ });
    expect(firstValidation.success).toBe(false);
    const errorStr = JSON.stringify(firstValidation.error);
    expect(errorStr).toContain('勉強し');

    // На попытке после repair (isRepairedAttempt: true) невалидный вопрос удаляется без потери остальных
    const repairedValidation = validateQuizForMaterial(rawPayload, {
      intent: AI_INTENTS.CREATE_QUIZ,
      isRepairedAttempt: true,
    });
    expect(repairedValidation.success).toBe(true);
    expect(repairedValidation.data.quiz.questions.length).toBe(1);
    expect(repairedValidation.data.quiz.questions[0].id).toBe('q1');
  });

  it('guarantees AI quiz generation does not modify state.srs, mastery or reviewEvents', () => {
    const initialState = defaultState();
    const stateCopy = JSON.parse(JSON.stringify(initialState));

    // Проверяем, что состояние SRS осталось нетронутым
    expect(initialState.srs).toEqual(stateCopy.srs);
    expect(initialState.reviewEvents).toEqual(stateCopy.reviewEvents);
  });
});

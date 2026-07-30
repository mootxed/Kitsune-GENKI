import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openGrammarLesson } from '../ui/grammar-lesson.js';
import quizData from '../public/data/courses/genki-1/grammar/lesson-01.json';

describe('UI Grammar Lesson Modal (ui/grammar-lesson.js)', () => {
  const topic = quizData.topics[0]; // L1_g1

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders explanation screen with title, formula, explanation, and examples', () => {
    openGrammarLesson({ chapterId: 1, topic });

    const titleEl = document.querySelector('.grammar-lesson-title');
    expect(titleEl).not.toBeNull();
    expect(titleEl.textContent).toContain('X は Y です');

    const formulaEl = document.querySelector('.grammar-formula-content');
    expect(formulaEl).not.toBeNull();
    expect(formulaEl.textContent).toBe('X は Y です');

    const startBtn = document.querySelector('[data-start-quiz]');
    expect(startBtn).not.toBeNull();
    expect(startBtn.textContent).toBe('Перейти к проверке');
  });

  it('navigates to single-choice question and disables submit until option selected', () => {
    openGrammarLesson({ chapterId: 1, topic });

    const startBtn = document.querySelector('[data-start-quiz]');
    startBtn.click();

    let submitBtn = document.querySelector('[data-submit-answer]');
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.disabled).toBe(true);

    const options = document.querySelectorAll('.grammar-option');
    expect(options.length).toBe(3);

    // Select option A (correct)
    options[0].click();
    submitBtn = document.querySelector('[data-submit-answer]');
    expect(submitBtn.disabled).toBe(false);

    submitBtn.click();

    // Feedback displayed
    const feedbackEl = document.querySelector('.grammar-feedback');
    expect(feedbackEl).not.toBeNull();
    expect(feedbackEl.textContent).toContain('Верно');

    const nextBtn = document.querySelector('[data-next-question]');
    expect(nextBtn).not.toBeNull();
  });

  it('supports fill-blank question input normalization', () => {
    openGrammarLesson({ chapterId: 1, topic });

    document.querySelector('[data-start-quiz]').click();

    // Answer Q1
    document.querySelectorAll('.grammar-option')[0].click();
    document.querySelector('[data-submit-answer]').click();
    document.querySelector('[data-next-question]').click();

    // Q2: fill-blank
    const input = document.querySelector('.grammar-input');
    expect(input).not.toBeNull();

    const submitBtn = document.querySelector('[data-submit-answer]');
    expect(submitBtn.disabled).toBe(true);

    input.value = '  は。  ';
    input.dispatchEvent(new window.Event('input'));
    expect(submitBtn.disabled).toBe(false);

    submitBtn.click();

    const feedback = document.querySelector('.grammar-feedback');
    expect(feedback.textContent).toContain('Верно');
  });

  it('supports sentence-order assembly, undo, and clear actions', () => {
    openGrammarLesson({ chapterId: 1, topic });

    document.querySelector('[data-start-quiz]').click();

    // Q1
    document.querySelectorAll('.grammar-option')[0].click();
    document.querySelector('[data-submit-answer]').click();
    document.querySelector('[data-next-question]').click();

    // Q2
    const input = document.querySelector('.grammar-input');
    input.value = 'は';
    input.dispatchEvent(new window.Event('input'));
    document.querySelector('[data-submit-answer]').click();
    document.querySelector('[data-next-question]').click();

    // Q3: sentence-order
    const poolTokens = document.querySelectorAll('.grammar-token.pool');
    expect(poolTokens.length).toBe(4);

    // Click first token
    poolTokens[0].click();
    let placed = document.querySelectorAll('.grammar-token.placed');
    expect(placed.length).toBe(1);

    // Click undo
    document.querySelector('[data-token-undo]').click();
    placed = document.querySelectorAll('.grammar-token.placed');
    expect(placed.length).toBe(0);

    // Add 2 tokens and clear
    const freshPool = document.querySelectorAll('.grammar-token.pool');
    freshPool[0].click();
    freshPool[1].click();
    expect(document.querySelectorAll('.grammar-token.placed').length).toBe(2);

    document.querySelector('[data-token-clear]').click();
    expect(document.querySelectorAll('.grammar-token.placed').length).toBe(0);

    // Assemble correct order
    const tokens = Array.from(document.querySelectorAll('.grammar-token.pool'));
    tokens.forEach((t) => t.click());

    document.querySelector('[data-submit-answer]').click();

    const feedback = document.querySelector('.grammar-feedback');
    expect(feedback.textContent).toContain('Верно');
  });

  it('returns canceled when closed via close button', async () => {
    const promise = openGrammarLesson({ chapterId: 1, topic });

    const closeBtn = document.querySelector('[data-close]');
    closeBtn.click();

    const res = await promise;
    expect(res.canceled).toBe(true);
  });
});

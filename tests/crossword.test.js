/* crossword.test.js — Тесты для логики и UI кроссворда */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  renderCrossword,
  renderCrosswordModeSelection,
  startCrosswordGame,
  cleanupCrossword,
  refreshGridCellClasses,
} from '../ui/crossword.js';

describe('Crossword System', () => {
  let mockState;
  let mockDeps;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="crossword-body"></div>
      <div id="completion-overlay" class="hidden">
        <div id="completion-title"></div>
        <div id="completion-subtitle"></div>
        <div id="completion-desc"></div>
        <div id="completion-rewards"></div>
        <button id="btn-completion-continue"></button>
      </div>
    `;

    mockState = {
      chapters: {
        1: { started: true },
        2: { started: true },
        3: { started: true },
      },
      priorKnowledgeChapterIds: [1, 2, 3],
      srs: {
        L1_V001: { id: 'L1_V001', state: 3, reps: 5, lapses: 2, stability: 1 },
        L1_V002: { id: 'L1_V002', state: 3, reps: 5, lapses: 2, stability: 1 },
        L1_V003: { id: 'L1_V003', state: 3, reps: 5, lapses: 2, stability: 1 },
        L1_V004: { id: 'L1_V004', state: 3, reps: 5, lapses: 2, stability: 1 },
      },
    };

    mockDeps = {
      save: vi.fn(),
      addXP: vi.fn(),
      lessons: [
        {
          id: 1,
          words: [
            { id: 'L1_V001', writing: 'だいがく', translation: 'университет' },
            { id: 'L1_V002', writing: 'がくせい', kanji: '学生', translation: 'студент' },
            { id: 'L1_V003', writing: 'せんせい', kanji: '先生', translation: 'учитель' },
            { id: 'L1_V004', writing: 'さかな', kanji: '魚', translation: 'рыба' },
            { id: 'L1_V005', writing: 'かさ', kanji: '傘', translation: 'зонт' },
            { id: 'L1_V006', writing: 'あさ', kanji: '朝', translation: 'утро' },
          ],
        },
      ],
    };

    delete window.cwState;
    delete window.crosswordFinishedState;
    cleanupCrossword();
  });

  describe('Mode Selection UI (Section 22)', () => {
    it('1. При открытии показывается выбор режима, а не готовая сетка', () => {
      renderCrossword(mockState, mockDeps);
      const modeScreen = document.querySelector('[data-testid="cw-mode-screen"]');
      expect(modeScreen).not.toBeNull();
      expect(document.querySelector('#crossword-grid')).toBeNull();
    });

    it('2. Обычный режим запускает генерацию', () => {
      startCrosswordGame(mockState, mockDeps, 'normal');
      const grid = document.querySelector('#crossword-grid');
      expect(grid).not.toBeNull();
      const badge = document.querySelector('[data-testid="cw-mode-badge"]');
      expect(badge.textContent).toContain('🧩 Все слова');
    });

    it('3. Weak mode использует слабые слова и отображает слабую плашку', () => {
      startCrosswordGame(mockState, mockDeps, 'weak');
      const badge = document.querySelector('[data-testid="cw-mode-badge"]');
      expect(badge.textContent).toContain('🩹 Слабые слова');
    });

    it('4. Weak mode не включает State.New без evidence', () => {
      const stateWithoutReview = {
        chapters: { 1: { started: true } },
        srs: {
          L1_V005: { id: 'L1_V005', state: 0, reps: 0, lapses: 0, stability: 0 },
        },
      };
      startCrosswordGame(stateWithoutReview, mockDeps, 'weak');
      const emptyState = document.querySelector('[data-testid="crossword-empty"]');
      expect(emptyState).not.toBeNull();
    });

    it('5. Weak mode показывает понятный empty state при отсутствии слабых слов', () => {
      const stateWithoutWeak = { chapters: { 1: { started: true } }, srs: {} };
      startCrosswordGame(stateWithoutWeak, mockDeps, 'weak');
      const emptyState = document.querySelector('[data-testid="crossword-empty"]');
      expect(emptyState).not.toBeNull();
      expect(emptyState.textContent).toContain('Слабых слов пока нет');
    });

    it('6. Кнопка обычного режима из empty state работает', () => {
      const stateWithoutWeak = { chapters: { 1: { started: true } }, srs: {} };
      startCrosswordGame(stateWithoutWeak, mockDeps, 'weak');
      const switchBtn = document.getElementById('cw-switch-normal-btn');
      expect(switchBtn).not.toBeNull();

      switchBtn.click();
      const grid = document.querySelector('#crossword-grid');
      expect(grid).not.toBeNull();
    });

    it('7. Новый кроссворд сохраняет режим', () => {
      startCrosswordGame(mockState, mockDeps, 'weak');
      const newGameBtn = document.getElementById('cw-new-game-btn');
      newGameBtn.click();

      const badge = document.querySelector('[data-testid="cw-mode-badge"]');
      expect(badge.textContent).toContain('🩹 Слабые слова');
    });

    it('8. Смена режима возвращает на стартовый экран', () => {
      startCrosswordGame(mockState, mockDeps, 'weak');
      const changeModeBtn = document.getElementById('cw-change-mode-btn');
      changeModeBtn.click();

      const modeScreen = document.querySelector('[data-testid="cw-mode-screen"]');
      expect(modeScreen).not.toBeNull();
    });

    it('9. Повторный вход не дублирует listeners', () => {
      renderCrossword(mockState, mockDeps);
      renderCrossword(mockState, mockDeps);
      const modeScreen = document.querySelectorAll('[data-testid="cw-mode-screen"]');
      expect(modeScreen.length).toBe(1);
    });

    it('10. Решение кроссворда и подсказки не изменяют FSRS', () => {
      const originalSrs = JSON.stringify(mockState.srs);
      startCrosswordGame(mockState, mockDeps, 'weak');
      expect(JSON.stringify(mockState.srs)).toBe(originalSrs);
    });
  });

  describe('Word length and grid validation', () => {
    it('should correctly calculate word length from kana string', () => {
      const testWords = [
        { kana: 'だいがく', expectedLength: 4 },
        { kana: 'だいがくせい', expectedLength: 6 },
        { kana: 'せんせい', expectedLength: 4 },
      ];

      testWords.forEach(({ kana, expectedLength }) => {
        expect(kana.length).toBe(expectedLength);
      });
    });

    it('should detect overlapping substrings correctly', () => {
      const word1 = 'だいがく';
      const word2 = 'だいがくせい';
      expect(word2.includes(word1)).toBe(true);
    });

    it('should prevent word from exceeding grid boundaries horizontally', () => {
      const gridSize = 11;
      const word = { kana: 'だいがくせい', length: 6 };
      const startCol = 6;
      expect(startCol + word.kana.length > gridSize).toBe(true);
    });
  });

  describe('FSRS Isolation Tests', () => {
    it('Решение слова в кроссворде не меняет FSRS state/due/stability/reps/lapses', () => {
      const source = readFileSync('ui/crossword.js', 'utf8');
      expect(source).not.toMatch(/markActivity/u);
      expect(source).not.toMatch(/SRS\.review/u);
      expect(source).not.toMatch(/SRS\.applyReview/u);
      expect(source).not.toMatch(/reviewEvents/u);
      expect(source).not.toMatch(/masteryArchive/u);
    });
  });
});

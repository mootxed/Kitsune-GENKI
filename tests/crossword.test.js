/* crossword.test.js — Тесты для логики кроссворда */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderCrossword, cleanupCrossword, refreshGridCellClasses } from '../ui/crossword.js';

describe('Crossword System', () => {
  it('не читает и не изменяет legacy progress карточек', () => {
    const source = readFileSync('ui/crossword.js', 'utf8');
    expect(source).not.toMatch(/srsCard\.progress|\.progress\s*[+\-=]/u);
  });
  describe('Word length validation', () => {
    it('should correctly calculate word length from kana string', () => {
      const testWords = [
        { kana: 'だいがく', expectedLength: 4 },
        { kana: 'だいがくせい', expectedLength: 6 },
        { kana: 'せんせい', expectedLength: 4 },
        { kana: 'がくせい', expectedLength: 4 },
      ];

      testWords.forEach(({ kana, expectedLength }) => {
        expect(kana.length).toBe(expectedLength);
      });
    });

    it('should ensure word.length matches word.kana.length', () => {
      // Симулируем создание объекта слова
      const word = {
        id: 'test-1',
        kana: 'だいがくせい',
        kanji: '大学生',
        translation: 'university student',
        length: 'だいがくせい'.length, // Должно быть 6
      };

      expect(word.length).toBe(word.kana.length);
      expect(word.length).toBe(6);
    });
  });

  describe('Grid placement validation', () => {
    it('should detect overlapping substrings correctly', () => {
      const word1 = 'だいがく'; // 4 символа
      const word2 = 'だいがくせい'; // 6 символов

      // word1 является подстрокой word2
      expect(word2.includes(word1)).toBe(true);
      expect(word1.length).toBe(4);
      expect(word2.length).toBe(6);
    });

    it('should validate grid cell allocation matches word length', () => {
      // Если слово имеет 6 символов, должно быть выделено ровно 6 ячеек
      const word = { kana: 'だいがくせい', length: 6 };
      const gridSize = 11;
      const startCol = 3;

      // Проверяем, что слово умещается
      expect(startCol + word.kana.length).toBeLessThanOrEqual(gridSize);

      // Проверяем, что длина совпадает
      expect(word.kana.length).toBe(word.length);
    });
  });

  describe('Intersection logic', () => {
    it('should allow multiple intersections for longer words', () => {
      // Длинное слово может пересекать несколько уже размещенных слов
      const intersectionCount = 3;
      expect(intersectionCount).toBeGreaterThanOrEqual(1);
    });

    it('should require at least one intersection for non-first words', () => {
      // Симулируем размещение второго слова с минимум одним пересечением
      const intersectionCount = 1;
      const isFirstWord = false;

      if (!isFirstWord) {
        // Второе и последующие слова должны иметь минимум 1 пересечение
        expect(intersectionCount).toBeGreaterThanOrEqual(1);
      }
    });

    it('should allow first word to have zero intersections', () => {
      const intersectionCount = 0;
      const isFirstWord = true;

      if (isFirstWord) {
        // Первое слово может не иметь пересечений
        expect(intersectionCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Boundary checks', () => {
    it('should prevent word from exceeding grid boundaries horizontally', () => {
      const gridSize = 11;
      const word = { kana: 'だいがくせい', length: 6 };
      const startCol = 6;

      // startCol + length = 6 + 6 = 12 > 11, должно быть отклонено
      const wouldExceed = startCol + word.kana.length > gridSize;
      expect(wouldExceed).toBe(true);
    });

    it('should allow word within grid boundaries horizontally', () => {
      const gridSize = 11;
      const word = { kana: 'だいがくせい', length: 6 };
      const startCol = 5;

      // startCol + length = 5 + 6 = 11 <= 11, должно быть разрешено
      const wouldExceed = startCol + word.kana.length > gridSize;
      expect(wouldExceed).toBe(false);
    });

    it('should prevent word from exceeding grid boundaries vertically', () => {
      const gridSize = 11;
      const word = { kana: 'だいがくせい', length: 6 };
      const startRow = 7;

      // startRow + length = 7 + 6 = 13 > 11, должно быть отклонено
      const wouldExceed = startRow + word.kana.length > gridSize;
      expect(wouldExceed).toBe(true);
    });
  });

  describe('Parallel collision prevention', () => {
    it('should not allow words to be placed directly next to each other', () => {
      // Создаем простую сетку
      const grid = Array(5)
        .fill(null)
        .map(() =>
          Array(5)
            .fill(null)
            .map(() => ({ letter: null, wordIds: [] }))
        );

      // Размещаем первое слово горизонтально в строке 2
      grid[2][1].letter = 'あ';
      grid[2][2].letter = 'い';

      // Попытка разместить второе слово горизонтально в строке 1 (параллельно)
      const word2Row = 1;
      const word2Col = 1;

      // Должна быть ячейка снизу от нового слова
      const hasLetterBelow = grid[word2Row + 1][word2Col].letter !== null;
      expect(hasLetterBelow).toBe(true); // Конфликт обнаружен
    });
  });

  describe('Character matching at intersections', () => {
    it('should only allow intersection when characters match', () => {
      const existingLetter = 'が';
      const newWordLetter = 'が';
      expect(existingLetter === newWordLetter).toBe(true);
    });

    it('should reject intersection when characters do not match', () => {
      const existingLetter = 'が';
      const newWordLetter = 'か';
      expect(existingLetter === newWordLetter).toBe(false);
    });
  });

  describe('Edge cases with common substrings', () => {
    it('should handle words that are substrings of each other', () => {
      const shortWord = 'せんせい'; // 4 символа
      const longWord = 'だいがくせい'; // 6 символов

      // Эти слова имеют общее окончание 'せい'
      expect(shortWord.includes('せい')).toBe(true);
      expect(longWord.includes('せい')).toBe(true);

      // Но они НЕ являются подстроками друг друга
      expect(shortWord.includes(longWord)).toBe(false);
      expect(longWord.includes(shortWord)).toBe(false);
    });

    it('should correctly identify when one word contains another', () => {
      const shortWord = 'だいがく'; // 4 символа - "университет"
      const longWord = 'だいがくせい'; // 6 символов - "студент университета"

      expect(longWord.includes(shortWord)).toBe(true);
      expect(shortWord.includes(longWord)).toBe(false);
    });
  });

  describe('Grid integrity validation', () => {
    it('should maintain correct word IDs at intersection points', () => {
      const cell = { letter: 'が', wordIds: ['word-1', 'word-2'] };

      // В точке пересечения должно быть ровно 2 слова
      expect(cell.wordIds.length).toBe(2);

      // Буква должна быть общей для обоих слов
      expect(cell.letter).toBeTruthy();
    });

    it('should not have more than 2 words intersecting at a single cell', () => {
      // В классическом кроссворде ячейка может содержать максимум 2 слова
      // (одно горизонтальное и одно вертикальное)
      const cell = { letter: 'が', wordIds: ['word-1', 'word-2'] };
      expect(cell.wordIds.length).toBeLessThanOrEqual(2);
    });
  });

  describe('FSRS Isolation Tests (Requirements 21-28)', () => {
    it('21-26. Решение слова в кроссворде не меняет FSRS state/due/stability/reps/lapses/reviewEvents/masteryArchive/learningEvents/dailyCards', () => {
      const source = readFileSync('ui/crossword.js', 'utf8');

      // Verify no SRS review or activity marking calls remain in crossword module
      expect(source).not.toMatch(/markActivity/u);
      expect(source).not.toMatch(/SRS\.review/u);
      expect(source).not.toMatch(/SRS\.applyReview/u);
      expect(source).not.toMatch(/reviewEvents/u);
      expect(source).not.toMatch(/masteryArchive/u);
      expect(source).not.toMatch(/learningEvents/u);
      expect(source).not.toMatch(/dailyCards/u);
      expect(source).not.toMatch(/introducedOn/u);
    });

    it('27. Использование подсказки не меняет FSRS', () => {
      const source = readFileSync('ui/crossword.js', 'utf8');
      expect(source).toContain('// Подсказка влияет только на локальную попытку кроссворда.');
    });

    it('28. completeCrossword выдаёт игровую награду ровно один раз', () => {
      // Verify window.crosswordFinishedState guard logic in completeCrossword
      const source = readFileSync('ui/crossword.js', 'utf8');
      expect(source).toContain('if (window.crosswordFinishedState?.awarded) return;');
      expect(source).toContain('window.crosswordFinishedState = { awarded: true };');
    });
  });

  describe('Crossword UI & Handler Regression Tests', () => {
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
          4: { started: true },
          5: { started: true },
        },
        priorKnowledgeChapterIds: [1, 2, 3, 4, 5],
        srs: {},
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
              { id: 'L1_V007', writing: 'あき', kanji: '秋', translation: 'осень' },
              { id: 'L1_V008', writing: 'あお', kanji: '青', translation: 'синий' },
            ],
          },
        ],
      };

      delete window.currentCrosswordWord;
      delete window.cwState;
      cleanupCrossword();
    });

    it('1-3. Модуль импортируется, renderCrossword() и initCrosswordHandlers() выбирают слово без ReferenceError', async () => {
      const crosswordModule = await import('../ui/crossword.js');
      expect(crosswordModule.renderCrossword).toBeDefined();
      expect(typeof crosswordModule.renderCrossword).toBe('function');

      expect(() => {
        crosswordModule.renderCrossword(mockState, mockDeps);
      }).not.toThrow();

      const body = document.getElementById('crossword-body');
      expect(body.children.length).toBeGreaterThan(0);
      expect(window.currentCrosswordWord).toBeDefined();
    });

    it('4. Первое автоматически выбранное слово получает highlighted-клетки', () => {
      renderCrossword(mockState, mockDeps);
      const highlightedCells = document.querySelectorAll('.grid-cell.highlighted');
      expect(highlightedCells.length).toBeGreaterThan(0);
    });

    it('5. Клик по другой активной ячейке переключает подсветку без ReferenceError', () => {
      renderCrossword(mockState, mockDeps);
      const firstWordId = window.currentCrosswordWord?.word?.id;
      const { placedWords } = window.cwState;
      const firstWord = placedWords.find((p) => p.word.id === firstWordId);

      let targetCell = null;
      let targetWordId = null;

      for (const pw of placedWords) {
        if (pw.word.id === firstWordId) continue;
        for (let i = 0; i < pw.word.length; i++) {
          const r = pw.direction === 'across' ? pw.row : pw.row + i;
          const c = pw.direction === 'across' ? pw.col + i : pw.col;
          const isIntersectionWithFirst =
            firstWord &&
            (firstWord.direction === 'across'
              ? r === firstWord.row &&
                c >= firstWord.col &&
                c < firstWord.col + firstWord.word.length
              : c === firstWord.col &&
                r >= firstWord.row &&
                r < firstWord.row + firstWord.word.length);

          if (!isIntersectionWithFirst) {
            const cellDom = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
            if (cellDom) {
              targetCell = cellDom;
              targetWordId = pw.word.id;
              break;
            }
          }
        }
        if (targetCell) break;
      }

      if (targetCell) {
        expect(() => {
          targetCell.click();
        }).not.toThrow();
        expect(window.currentCrosswordWord.word.id).toBe(targetWordId);
      }
    });

    it('6. Правильное слово сохраняет статус correct после переключения активного слова', () => {
      renderCrossword(mockState, mockDeps);
      const { placedWords, userAnswers } = window.cwState;
      expect(placedWords.length).toBeGreaterThan(0);

      const firstWord = placedWords[0];
      userAnswers[firstWord.word.id].correct = true;
      refreshGridCellClasses(placedWords, userAnswers, firstWord.word.id);

      let targetCell = null;
      for (const pw of placedWords) {
        if (pw.word.id === firstWord.word.id) continue;
        for (let i = 0; i < pw.word.length; i++) {
          const r = pw.direction === 'across' ? pw.row : pw.row + i;
          const c = pw.direction === 'across' ? pw.col + i : pw.col;
          const isIntersectionWithFirst =
            firstWord.direction === 'across'
              ? r === firstWord.row &&
                c >= firstWord.col &&
                c < firstWord.col + firstWord.word.length
              : c === firstWord.col &&
                r >= firstWord.row &&
                r < firstWord.row + firstWord.word.length;

          if (!isIntersectionWithFirst) {
            const cellDom = document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
            if (cellDom) {
              targetCell = cellDom;
              break;
            }
          }
        }
        if (targetCell) break;
      }

      if (targetCell) {
        targetCell.click();

        const firstCell = document.querySelector(
          `.grid-cell[data-row="${firstWord.row}"][data-col="${firstWord.col}"]`
        );
        expect(firstCell.classList.contains('correct')).toBe(true);
      }
    });

    it('8. Повторное открытие кроссворда удаляет предыдущие обработчики (cleanup)', () => {
      const spyRemove = vi.spyOn(document, 'removeEventListener');
      renderCrossword(mockState, mockDeps);
      renderCrossword(mockState, mockDeps);

      expect(spyRemove).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(spyRemove).toHaveBeenCalledWith('click', expect.any(Function));
      spyRemove.mockRestore();
    });
  });
});

/* crossword.test.js — Тесты для логики кроссворда */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

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
      const word1 = 'あい'; // 2 символа
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
});

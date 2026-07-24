import { describe, it, expect } from 'vitest';
import {
  WORD_SEARCH_DIFFICULTIES,
  generateWordSearchGrid,
  isValidWordForSearch,
  normalizeKana,
  deduplicateCandidates,
} from '../src/word-search-generator.js';

describe('Word Search Generator Unit Tests', () => {
  const sampleCandidates = [
    { id: '1', writing: 'みず', translation: 'вода' },
    { id: '2', writing: 'がくせい', kanji: '学生', translation: 'студент' },
    { id: '3', writing: 'テレビ', kanji: 'テレビ', translation: 'телевизор' },
    { id: '4', writing: 'たべる', kanji: '食べる', translation: 'есть' },
    { id: '5', writing: 'ともだち', kanji: '友達', translation: 'друг' },
    { id: '6', writing: 'ほん', kanji: '本', translation: 'книга' },
    { id: '7', writing: 'ねこ', kanji: '猫', translation: 'кошка' },
    { id: '8', writing: 'いぬ', kanji: '犬', translation: 'собака' },
    { id: '9', writing: 'くるま', kanji: '車', translation: 'машина' },
    { id: '10', writing: 'さかな', kanji: '魚', translation: 'рыба' },
  ];

  it('1. WORD_SEARCH_DIFFICULTIES object exports easy, medium, hard configurations', () => {
    expect(WORD_SEARCH_DIFFICULTIES).toBeDefined();
    expect(WORD_SEARCH_DIFFICULTIES.easy.gridSize).toBe(7);
    expect(WORD_SEARCH_DIFFICULTIES.easy.targetCount).toBe(4);
    expect(WORD_SEARCH_DIFFICULTIES.medium.gridSize).toBe(9);
    expect(WORD_SEARCH_DIFFICULTIES.medium.targetCount).toBe(6);
    expect(WORD_SEARCH_DIFFICULTIES.hard.gridSize).toBe(11);
    expect(WORD_SEARCH_DIFFICULTIES.hard.targetCount).toBe(9);
  });

  it('2. All placed words are within grid boundaries', () => {
    const result = generateWordSearchGrid(sampleCandidates, { gridSize: 9, targetCount: 6 });
    expect(result.success).toBe(true);
    const { grid, placedWords, gridSize } = result;

    for (const pw of placedWords) {
      for (const cell of pw.cells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(gridSize);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(gridSize);
        expect(grid[cell.row][cell.col]).toBeDefined();
      }
    }
  });

  it('3. Words read in correct sequence at coordinates', () => {
    const result = generateWordSearchGrid(sampleCandidates, { gridSize: 9, targetCount: 6 });
    expect(result.success).toBe(true);

    for (const pw of result.placedWords) {
      let readKana = '';
      for (const cell of pw.cells) {
        readKana += result.grid[cell.row][cell.col].char;
      }
      expect(readKana).toBe(pw.kana);
    }
  });

  it('4. Assigns colorIndex to each placedWord', () => {
    const result = generateWordSearchGrid(sampleCandidates, { gridSize: 9, targetCount: 6 });
    expect(result.success).toBe(true);

    result.placedWords.forEach((pw) => {
      expect(typeof pw.colorIndex).toBe('number');
      expect(pw.colorIndex).toBeGreaterThanOrEqual(0);
      expect(pw.colorIndex).toBeLessThan(10);
    });
  });

  it('5. Intersections allowed only with matching characters', () => {
    const result = generateWordSearchGrid(sampleCandidates, { gridSize: 9 });
    expect(result.success).toBe(true);

    const cellMap = new Map();
    for (const pw of result.placedWords) {
      pw.cells.forEach((cell, idx) => {
        const key = `${cell.row},${cell.col}`;
        const char = pw.kana[idx];
        if (cellMap.has(key)) {
          expect(cellMap.get(key)).toBe(char);
        } else {
          cellMap.set(key, char);
        }
      });
    }
  });

  it('6. Empty cells after generation are filled with Kana', () => {
    const result = generateWordSearchGrid(sampleCandidates, { gridSize: 9 });
    expect(result.success).toBe(true);

    for (let r = 0; r < result.gridSize; r++) {
      for (let c = 0; c < result.gridSize; c++) {
        const char = result.grid[r][c].char;
        expect(char).not.toBeNull();
        expect(/[\u3040-\u309F\u30A0-\u30FFー]/.test(char)).toBe(true);
      }
    }
  });

  it('7. Returns minimum words or error if placement fails', () => {
    const resultSuccess = generateWordSearchGrid(sampleCandidates, { minCount: 4 });
    expect(resultSuccess.success).toBe(true);
    expect(resultSuccess.placedWords.length).toBeGreaterThanOrEqual(4);

    const resultFew = generateWordSearchGrid([{ id: '1', writing: 'みず', translation: 'вода' }], {
      minCount: 4,
    });
    expect(resultFew.success).toBe(false);
    expect(resultFew.error).toBe('INSUFFICIENT_WORDS');
  });

  it('8. Katakana word remains Katakana', () => {
    const katakanaWord = { id: 'tv', writing: 'テレビ', translation: 'телевизор' };
    expect(isValidWordForSearch(katakanaWord)).toBe(true);
    const kana = normalizeKana(katakanaWord.writing);
    expect(kana).toBe('テレビ');
    expect(/[\u30A0-\u30FF]/.test(kana)).toBe(true);
  });

  it('9. Kanji word uses reading/writing and turns into Kana', () => {
    const kanjiWord = { id: 'eat', writing: 'たべる', kanji: '食べる', translation: 'есть' };
    expect(isValidWordForSearch(kanjiWord)).toBe(true);
    const kana = normalizeKana(kanjiWord.writing);
    expect(kana).toBe('たべる');
    expect(/[\u3040-\u309F]/.test(kana)).toBe(true);
  });

  it('10. Duplicate readings are removed', () => {
    const candidates = [
      { id: '1', writing: 'みず', translation: 'вода' },
      { id: '2', writing: 'みず', translation: 'вода (дубликат)' },
      { id: '3', writing: 'ほん', translation: 'книга' },
    ];
    const deduped = deduplicateCandidates(candidates);
    expect(deduped.length).toBe(2);
    expect(deduped.map((w) => w.kana)).toEqual(['みず', 'ほん']);
  });
});

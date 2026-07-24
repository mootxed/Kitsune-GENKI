import { describe, it, expect } from 'vitest';
import {
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
  ];

  it('1. All placed words are within grid boundaries', () => {
    const result = generateWordSearchGrid(sampleCandidates, { baseSize: 9 });
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

  it('2. Words read in correct sequence at coordinates', () => {
    const result = generateWordSearchGrid(sampleCandidates, { baseSize: 9 });
    expect(result.success).toBe(true);

    for (const pw of result.placedWords) {
      let readKana = '';
      for (const cell of pw.cells) {
        readKana += result.grid[cell.row][cell.col].char;
      }
      expect(readKana).toBe(pw.kana);
    }
  });

  it('3. Intersections allowed only with matching characters', () => {
    const result = generateWordSearchGrid(sampleCandidates, { baseSize: 9 });
    expect(result.success).toBe(true);

    // Map cell to its character
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

  it('4. Conflicting characters are not overwritten', () => {
    const result = generateWordSearchGrid(sampleCandidates, { baseSize: 9 });
    expect(result.success).toBe(true);

    for (let r = 0; r < result.gridSize; r++) {
      for (let c = 0; c < result.gridSize; c++) {
        const cell = result.grid[r][c];
        expect(cell.char).toBeDefined();
        expect(typeof cell.char).toBe('string');
        expect(cell.char.length).toBe(1);
      }
    }
  });

  it('5. Empty cells after generation are filled with Kana', () => {
    const result = generateWordSearchGrid(sampleCandidates, { baseSize: 9 });
    expect(result.success).toBe(true);

    for (let r = 0; r < result.gridSize; r++) {
      for (let c = 0; c < result.gridSize; c++) {
        const char = result.grid[r][c].char;
        expect(char).not.toBeNull();
        expect(/[\u3040-\u309F\u30A0-\u30FFー]/.test(char)).toBe(true);
      }
    }
  });

  it('6. Generator does not infinite loop on a difficult set', () => {
    const longCandidates = Array.from({ length: 15 }, (_, i) => ({
      id: `word_${i}`,
      writing: `あいうえおか${i}`,
      translation: `слово ${i}`,
    }));

    const startTime = Date.now();
    const result = generateWordSearchGrid(longCandidates, { baseSize: 9, maxRetries: 5 });
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(2000);
    expect(result).toBeDefined();
  });

  it('7. Returns minimum 4 words or clear error if placement fails', () => {
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

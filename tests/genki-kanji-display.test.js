import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGenkiKanjiAvailability,
  configureGenkiKanjiAvailability,
  displayWordForm,
  getWordKanjiUnlockLesson,
  isKanjiFormAvailable,
} from '../src/genki-kanji.js';

describe('GENKI I kanji availability', () => {
  beforeEach(() => {
    clearGenkiKanjiAvailability();
    configureGenkiKanjiAvailability({
      characters: [
        { kanji: '時', unlockLesson: 3 },
        { kanji: '本', unlockLesson: 4 },
      ],
    });
  });

  it('shows kana before kanji unlock and written form after unlock', () => {
    const word = { id: 'L3_V001', writtenForm: '時々', reading: 'ときどき' };
    expect(displayWordForm(word, 2)).toBe('ときどき');
    expect(displayWordForm(word, 3)).toBe('時々');
  });

  it('requires every kanji in a multi-kanji word', () => {
    const word = { id: 'L1_V001', writtenForm: '日本', reading: 'にほん' };
    expect(getWordKanjiUnlockLesson(word)).toBeNull();
    expect(isKanjiFormAvailable(word, 12)).toBe(false);
    expect(displayWordForm(word, 12)).toBe('にほん');
  });

  it('uses the latest unlock lesson when every kanji is known', () => {
    const word = { id: 'L4_V001', writtenForm: '時本', reading: 'じほん' };
    expect(getWordKanjiUnlockLesson(word)).toBe(4);
    expect(displayWordForm(word, 3)).toBe('じほん');
    expect(displayWordForm(word, 4)).toBe('時本');
  });

  it('does not apply the GENKI unlock table to personal dictionary words', () => {
    const word = { id: 'user:test', writtenForm: '日本語', reading: 'にほんご' };
    expect(isKanjiFormAvailable(word, 1)).toBe(true);
    expect(displayWordForm(word, 1)).toBe('日本語');
  });
});

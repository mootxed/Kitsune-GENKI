import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { conjugateVerb } from '../src/verb-conjugator.js';

describe('verb conjugator forms & Cyrillic regression', () => {
  it('correctly conjugates key verbs across standard forms without Cyrillic characters', () => {
    const verbsToTest = [
      { writing: 'ある', kanji: 'ある', partOfSpeech: 'verb', verbClass: 'godan' },
      { writing: 'いく', kanji: '行く', partOfSpeech: 'verb', verbClass: 'godan' },
      { writing: 'たべる', kanji: '食べる', partOfSpeech: 'verb', verbClass: 'ichidan' },
      { writing: 'する', kanji: 'する', partOfSpeech: 'verb', verbClass: 'irregular' },
      { writing: 'くる', kanji: '来る', partOfSpeech: 'verb', verbClass: 'irregular' },
      { writing: 'よむ', kanji: '読む', partOfSpeech: 'verb', verbClass: 'godan' },
      { writing: 'はなす', kanji: '話す', partOfSpeech: 'verb', verbClass: 'godan' },
    ];

    const requiredForms = [
      'masu',
      'masen',
      'masenka',
      'mashita',
      'masendeshita',
      'mashou',
      'mashouka',
      'te',
      'nai',
      'ta',
      'nakatta',
    ];

    const CYRILLIC_RE = /[\u0400-\u04FF]/u;

    for (const verb of verbsToTest) {
      const forms = conjugateVerb(verb);
      expect(forms.length).toBeGreaterThanOrEqual(12);

      const formMap = Object.fromEntries(forms.map((f) => [f.formId, f]));

      for (const formId of requiredForms) {
        const item = formMap[formId];
        expect(item).toBeDefined();
        expect(item.kana).toBeTruthy();
        expect(item.kanji).toBeTruthy();

        // Regression check: no Cyrillic in generated kana or kanji forms
        expect(CYRILLIC_RE.test(item.kana)).toBe(false);
        expect(CYRILLIC_RE.test(item.kanji)).toBe(false);
      }

      // Explicit check for mashouka
      expect(formMap.mashouka.kana).not.toContain('ка');
      expect(formMap.mashouka.kanji).not.toContain('ка');
    }
  });

  it('verifies that no generated token forms in token-index.json contain Cyrillic characters', () => {
    const tokenIndexPath = path.resolve('public/data/dictionary/token-index.json');
    const tokenData = JSON.parse(readFileSync(tokenIndexPath, 'utf8'));
    const tokens = Object.keys(tokenData.tokens || {});

    const CYRILLIC_RE = /[\u0400-\u04FF]/u;
    const cyrillicTokens = tokens.filter((t) => CYRILLIC_RE.test(t));

    expect(cyrillicTokens).toEqual([]);
  });
});

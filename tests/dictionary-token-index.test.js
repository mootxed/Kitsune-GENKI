import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findReadingCandidates,
  findTokenCandidates,
  resolveTokenCandidates,
} from '../src/dictionary/token-index.js';

async function dictionaryData() {
  const root = path.join(process.cwd(), 'public/data/dictionary');
  const entries = JSON.parse(await readFile(path.join(root, 'entries.json'), 'utf8')).entries;
  const tokenIndex = JSON.parse(await readFile(path.join(root, 'token-index.json'), 'utf8'));
  return { entries, tokenIndex };
}

describe('global dictionary token index', () => {
  it.each(['食べる', '食べます', '食べました', '食べて'])(
    'resolves generated verb form %s',
    async (token) => {
      const { tokenIndex } = await dictionaryData();
      expect(findTokenCandidates(tokenIndex, token)).toMatchObject({
        candidates: ['jp-word:食べる:たべる'],
        exact: true,
        ambiguous: false,
      });
    }
  );

  it('supports canonical kana reading lookup', async () => {
    const { entries } = await dictionaryData();
    expect(findReadingCandidates(entries, 'タベル').candidates).toContain('jp-word:食べる:たべる');
  });

  it('returns ambiguous candidates instead of silently choosing the first one', () => {
    const index = {
      はし: ['jp-word:橋:はし', 'jp-word:箸:はし', 'jp-word:端:はし'],
    };
    expect(resolveTokenCandidates(index, 'はし')).toEqual({
      status: 'ambiguous',
      dictionaryId: null,
      normalizedToken: 'はし',
      candidates: ['jp-word:橋:はし', 'jp-word:端:はし', 'jp-word:箸:はし'],
      exact: true,
      ambiguous: true,
    });
  });

  it('uses course preferences only for ranking and never filters candidates', () => {
    const index = {
      はし: ['jp-word:橋:はし', 'jp-word:箸:はし', 'jp-word:端:はし'],
    };
    const result = findTokenCandidates(index, 'はし', {
      preferredDictionaryIds: ['jp-word:箸:はし'],
    });
    expect(result.candidates[0]).toBe('jp-word:箸:はし');
    expect(result.candidates).toHaveLength(3);
    expect(result.ambiguous).toBe(true);
  });
});

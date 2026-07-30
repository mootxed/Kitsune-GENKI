import { describe, expect, it } from 'vitest';
import { validateGenkiData } from '../scripts/validate-genki-i-data.js';

describe('GENKI I generated data', () => {
  it('satisfies cross-file invariants', async () => {
    const result = await validateGenkiData();
    expect(result.errors).toEqual([]);
    expect(result.stats).toMatchObject({
      lessons: 12,
      words: 676,
      kanji: 145,
    });
  });
});

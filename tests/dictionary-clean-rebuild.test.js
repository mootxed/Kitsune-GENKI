import { describe, expect, it } from 'vitest';
import { buildDictionary } from '../scripts/build-dictionary.js';

describe('clean dictionary rebuild reproducibility', () => {
  it('builds dictionary reproducibly with check option', async () => {
    const result = await buildDictionary({ mode: 'check' });
    expect(result.differences).toBe(0);
    expect(result.entries).toBeGreaterThan(600);
  });
});

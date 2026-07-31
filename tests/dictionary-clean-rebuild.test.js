import { describe, expect, it } from 'vitest';
import { buildDictionary } from '../scripts/build-dictionary.js';

describe('clean dictionary rebuild reproducibility', () => {
  it('builds dictionary reproducibly from clean state with check option', async () => {
    // Check mode builds in-memory and compares against files on disk
    const result = await buildDictionary({ mode: 'check' });
    expect(result.differences).toBe(0);
    expect(result.entries).toBeGreaterThan(600);
    expect(result.courseReferences).toBeGreaterThan(600);
    expect(result.collisions).toEqual([]);
  });
});

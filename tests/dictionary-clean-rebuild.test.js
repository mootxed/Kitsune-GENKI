import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDictionary } from '../scripts/build-dictionary.js';

describe('clean dictionary rebuild reproducibility', () => {
  it('builds dictionary reproducibly from a clean directory', async () => {
    // 1. First verify current generated artifacts match raw source
    const checkActual = await buildDictionary({ mode: 'check' });
    expect(checkActual.differences).toBe(0);

    // 2. Create isolated temp directory to perform a clean build test
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dict-build-test-'));
    const tempAliasesFile = path.join(tempDir, 'generated-aliases.js');

    try {
      // 3. Build into clean empty temp directory
      const writeResult = await buildDictionary({
        mode: 'write',
        dictionaryRoot: tempDir,
        generatedAliasesPath: tempAliasesFile,
      });
      expect(writeResult.entries).toBeGreaterThan(600);
      expect(writeResult.collisions).toEqual([]);

      // 4. Verify rebuilt files in temp directory match check mode (0 differences)
      const checkResult = await buildDictionary({
        mode: 'check',
        dictionaryRoot: tempDir,
        generatedAliasesPath: tempAliasesFile,
      });
      expect(checkResult.differences).toBe(0);

      // 5. Compare manifest content built in tempDir with committed manifest
      const commitedManifest = await readFile(
        path.resolve('public/data/dictionary/manifest.json'),
        'utf8'
      );
      const tempManifest = await readFile(path.join(tempDir, 'manifest.json'), 'utf8');
      expect(tempManifest).toBe(commitedManifest);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

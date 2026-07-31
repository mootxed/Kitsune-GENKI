import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

describe('Legacy Aliases Uniqueness & Resolution', () => {
  it('ensures every legacy alias resolves to exactly one canonical dictionary entry ID', async () => {
    const aliasesContent = await readFile(
      path.join(ROOT, 'public/data/dictionary/aliases.json'),
      'utf8'
    );
    const entriesContent = await readFile(
      path.join(ROOT, 'public/data/dictionary/entries.json'),
      'utf8'
    );

    const aliasesDoc = JSON.parse(aliasesContent);
    const entriesDoc = JSON.parse(entriesContent);

    const aliases = aliasesDoc.aliases || {};
    const validEntryIds = new Set((entriesDoc.entries || []).map((entry) => entry.id));

    expect(Object.keys(aliases).length).toBeGreaterThan(0);
    expect(validEntryIds.size).toBeGreaterThan(0);

    for (const [aliasKey, targetId] of Object.entries(aliases)) {
      expect(aliasKey).not.toBe(targetId);

      // Resolve alias to final canonical target
      let current = targetId;
      const visited = new Set([aliasKey]);

      while (aliases[current]) {
        expect(visited.has(current)).toBe(false);
        visited.add(current);
        current = aliases[current];
      }

      // Assert final target is a known canonical entry ID
      expect(
        validEntryIds.has(current),
        `Alias "${aliasKey}" resolves to unknown entry ID "${current}"`
      ).toBe(true);
    }

    // Specific check for 買う / 飼у lexemeId safety
    const kauBuyingAlias = aliases['かう_買う_verb_godan_покупать'];
    expect(kauBuyingAlias).toBe('jp-word:買う:かう');
  });
});

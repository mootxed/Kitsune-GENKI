import { describe, expect, it } from 'vitest';
import { createImportPreview } from '../src/dictionary-import/index.js';
import {
  exportUserDictionaryCsv,
  normalizeJapaneseForComparison,
} from '../src/user-dictionaries/index.js';

describe('user dictionary large collection operations', () => {
  for (const size of [100, 1_000, 10_000, 20_000]) {
    it(`normalizes, previews, searches and exports ${size.toLocaleString('en-US')} records`, () => {
      const records = Array.from({ length: size }, (_, index) => ({
        value: {
          word: `猫${'々'.repeat(index % 3)}`,
          reading: `ねこ${'こ'.repeat(index % 3)}`,
          meaning: `кошка ${index}`,
          tags: index % 2 ? 'животные' : 'частые',
        },
        sourceIndex: index + 2,
      }));
      const preview = createImportPreview({
        records,
        mapping: {
          writing: 'word',
          reading: 'reading',
          meanings: 'meaning',
          tags: 'tags',
        },
        options: {
          dictionaryId: 'user-dict:12345678',
          sourceLabel: 'large.csv',
        },
      });
      expect(preview.ready).toBe(size);
      const query = normalizeJapaneseForComparison('ねこ');
      const found = preview.accepted.filter(({ entry }) => entry.searchText.includes(query));
      expect(found).toHaveLength(size);
      const csv = exportUserDictionaryCsv(preview.accepted.map(({ entry }) => entry));
      expect(csv.split('\r\n')).toHaveLength(size + 1);
    }, 30_000);
  }
});

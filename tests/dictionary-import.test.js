import { describe, expect, it } from 'vitest';
import {
  applyDictionaryMapping,
  createImportErrorReport,
  createImportPreview,
  createImportProfile,
  detectDictionaryFormat,
  discoverJsonCollections,
  inferDictionaryMapping,
  parseDelimited,
  parseDictionaryJson,
} from '../src/dictionary-import/index.js';
import { normalizeUserDictionaryEntry } from '../src/user-dictionaries/index.js';

const DICTIONARY_ID = 'user-dict:12345678';
const options = {
  dictionaryId: DICTIONARY_ID,
  sourceLabel: 'test.csv',
  meaningSeparator: ';',
  tagSeparator: ',',
  stripHtml: true,
  now: '2026-07-28T10:00:00.000Z',
};

describe('delimited dictionary parsing', () => {
  it('supports BOM, quoted commas, escaped quotes and empty columns', () => {
    const parsed = parseDelimited(
      '\uFEFFword,reading,meaning,notes\n"食べる","たべる","есть, кушать","a ""quote"""\n'
    );
    expect(parsed.headers).toEqual(['word', 'reading', 'meaning', 'notes']);
    expect(parsed.records[0].value.meaning).toBe('есть, кушать');
    expect(parsed.records[0].value.notes).toBe('a "quote"');
  });

  it('supports multiline quoted fields', () => {
    const parsed = parseDelimited(
      'word,meaning,notes\n食べる,есть,"line 1\nline 2"\n猫,кошка,second\n'
    );
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0].value.notes).toBe('line 1\nline 2');
    expect(parsed.records[0].sourceIndex).toBe(2);
    expect(parsed.records[1].sourceIndex).toBe(4);
  });

  it('supports TSV and explicit semicolon delimiters', () => {
    expect(
      parseDelimited('word\tmeaning\n猫\tкошка', { delimiter: '\t' }).records[0].value.word
    ).toBe('猫');
    expect(
      parseDelimited('word;meaning\n犬;собака', { delimiter: ';' }).records[0].value.meaning
    ).toBe('собака');
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseDelimited('word,meaning\n"食べる,есть')).toThrow('Незакрытое');
  });
});

describe('JSON collections and security', () => {
  it('parses a root array and a common nested collection path', () => {
    expect(parseDictionaryJson('[{"word":"猫","meaning":"кошка"}]').records).toHaveLength(1);
    const nested = parseDictionaryJson(
      '{"dictionary":{"entries":[{"word":"犬","meaning":"собака"}]}}'
    );
    expect(nested.path).toBe('dictionary.entries');
    expect(nested.records[0].value.word).toBe('犬');
  });

  it('supports an object dictionary and exposes the key', () => {
    const parsed = parseDictionaryJson('{"食べる":{"reading":"たべる","ru":"есть"}}');
    expect(parsed.records[0].objectKey).toBe('食べる');
    const mapped = applyDictionaryMapping(
      parsed.records[0],
      { reading: 'reading', meanings: 'ru' },
      { ...options, useObjectKeyAsWriting: true }
    );
    expect(mapped.writing).toBe('食べる');
  });

  it('discovers and lets callers select an array path', () => {
    const root = { ignored: [{ x: 1 }], words: [{ word: '猫' }, { word: '犬' }] };
    expect(discoverJsonCollections(root)[0].path).toBe('words');
    const selected = parseDictionaryJson(JSON.stringify(root), { collectionPath: 'ignored' });
    expect(selected.records).toHaveLength(1);
  });

  it('rejects dangerous keys and excessive depth', () => {
    expect(() =>
      parseDictionaryJson('{"entries":[{"__proto__":{"polluted":true},"word":"猫"}]}')
    ).toThrow('Опасное поле');
    let nested = '{"value":1}';
    for (let index = 0; index < 25; index += 1) nested = `{"next":${nested}}`;
    expect(() => parseDictionaryJson(nested)).toThrow('глубже');
  });

  it('rejects repeated IDs in strict KotoKitsu JSON', () => {
    expect(() =>
      parseDictionaryJson(
        JSON.stringify({
          format: 'kotokitsu-dictionary',
          schemaVersion: 1,
          entries: [{ id: 'user-word:duplicate' }, { id: 'user-word:duplicate' }],
        })
      )
    ).toThrow('повторяющиеся ID');
  });
});

describe('mapping and preview', () => {
  it('infers aliases but leaves mapping editable', () => {
    expect(inferDictionaryMapping(['Expression', 'Reading', 'Meaning', 'Tags'])).toEqual({
      writing: 'Expression',
      reading: 'Reading',
      meanings: 'Meaning',
      tags: 'Tags',
    });
  });

  it('maps arrays, strings, tags and strips HTML', () => {
    const mapped = applyDictionaryMapping(
      {
        value: {
          japanese: '食べる',
          kana: 'たべる',
          translation: ['<b>есть</b>', 'кушать'],
          labels: 'еда,глагол',
        },
      },
      {
        writing: 'japanese',
        reading: 'kana',
        meanings: 'translation',
        tags: 'labels',
      },
      options
    );
    expect(mapped.meanings).toEqual(['есть', 'кушать']);
    expect(mapped.tags).toEqual(['еда', 'глагол']);
  });

  it('combines multiple mapped meaning columns without an expression language', () => {
    const mapped = applyDictionaryMapping(
      {
        value: {
          word: '猫',
          meaningRu: 'кошка',
          meaningAlt: 'кот',
        },
      },
      { writing: 'word', meanings: ['meaningRu', 'meaningAlt'] },
      options
    );
    expect(mapped.meanings).toEqual(['кошка', 'кот']);
  });

  it('reports exact rejected source indices, warnings and duplicates', () => {
    const existing = normalizeUserDictionaryEntry(
      { writing: '猫', reading: 'ねこ', meanings: ['кошка'] },
      options
    );
    const records = [
      { value: { word: '猫', kana: 'ねこ', meaning: 'кот' }, sourceIndex: 2 },
      { value: { word: '犬', meaning: 'собака' }, sourceIndex: 3 },
      { value: { word: '', meaning: '' }, sourceIndex: 4 },
    ];
    const preview = createImportPreview({
      records,
      mapping: { writing: 'word', reading: 'kana', meanings: 'meaning' },
      options,
      existingEntries: [existing],
    });
    expect(preview.total).toBe(3);
    expect(preview.ready).toBe(2);
    expect(preview.warningCount).toBe(1);
    expect(preview.rejectedCount).toBe(1);
    expect(preview.duplicateCount).toBe(1);
    expect(createImportErrorReport(preview)).toContain('4:');
  });

  it('detects JSON, CSV and TSV and enforces file size', () => {
    expect(detectDictionaryFormat({ name: 'words.json', text: '[]' })).toBe('json');
    expect(detectDictionaryFormat({ name: 'words.csv', text: 'a,b' })).toBe('csv');
    expect(detectDictionaryFormat({ name: 'words.tsv', text: 'a\tb' })).toBe('tsv');
    expect(() => detectDictionaryFormat({ name: 'words.csv', size: 10 * 1024 * 1024 + 1 })).toThrow(
      '10 МБ'
    );
  });

  it('creates a reusable validated import profile', () => {
    const profile = createImportProfile(
      {
        name: 'Anki CSV',
        format: 'csv',
        mapping: { writing: 'Expression', meanings: 'Meaning' },
        transforms: { stripHtml: true, meaningSeparator: ';' },
      },
      '2026-07-28T10:00:00.000Z'
    );
    expect(profile.id).toMatch(/^import-profile:/u);
    expect(profile.mapping.writing).toBe('Expression');
    expect(profile.transforms.tagSeparator).toBe(',');
  });
});

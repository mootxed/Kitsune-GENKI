import { describe, expect, it } from 'vitest';
import {
  createKnowledgeItemFromUserEntry,
  createUserDictionaryExport,
  exportUserDictionaryCsv,
  getUserEntryCapabilities,
  getUserDictionaryEntryKey,
  mergeUserDictionaryEntries,
  normalizeJapaneseForComparison,
  normalizeMeanings,
  normalizeUserDictionaryEntry,
  protectCsvFormula,
  resolveEntryConflict,
  UserDictionaryEntrySchema,
  UserDictionarySchema,
} from '../src/user-dictionaries/index.js';

const NOW = '2026-07-28T10:00:00.000Z';

function entry(overrides = {}) {
  return normalizeUserDictionaryEntry(
    {
      writing: '食べる',
      reading: 'たべる',
      meanings: ['есть'],
      ...overrides,
    },
    {
      dictionaryId: 'user-dict:12345678',
      sourceType: 'manual',
      now: NOW,
    }
  );
}

describe('user dictionary schema and normalization', () => {
  it('accepts a strict schema-v1 dictionary and rejects unknown fields', () => {
    const dictionary = {
      id: 'user-dict:12345678',
      name: 'Мой словарь',
      description: '',
      createdAt: NOW,
      updatedAt: NOW,
      sourceType: 'manual',
      schemaVersion: 1,
    };
    expect(UserDictionarySchema.parse(dictionary)).toEqual(dictionary);
    expect(() => UserDictionarySchema.parse({ ...dictionary, constructor: 'bad' })).toThrow();
  });

  it('requires writing or reading and at least one meaning', () => {
    expect(() => entry({ writing: '', reading: '', meanings: ['есть'] })).toThrow(
      'Укажите написание или чтение'
    );
    expect(() => entry({ meanings: [] })).toThrow();
  });

  it('enforces length and count limits', () => {
    expect(() => entry({ writing: 'あ'.repeat(201) })).toThrow();
    expect(() =>
      entry({ tags: Array.from({ length: 51 }, (_, index) => `tag-${index}`) })
    ).toThrow();
    expect(() => entry({ notes: 'n'.repeat(10_001) })).toThrow();
  });

  it('rejects non-Japanese writing and unexpected object types', () => {
    expect(() => entry({ writing: '<script>alert(1)</script>' })).toThrow(
      'Ожидался японский текст'
    );
    expect(() => entry({ reading: { kana: 'たべる' } })).toThrow('Ожидалась строка');
  });

  it('normalizes meanings from arrays, delimited strings, and objects', () => {
    expect(normalizeMeanings('есть; кушать; есть')).toEqual(['есть', 'кушать']);
    expect(normalizeMeanings(['есть', '', 'кушать'])).toEqual(['есть', 'кушать']);
    expect(normalizeMeanings({ ru: ['есть', 'кушать'] })).toEqual(['есть', 'кушать']);
  });

  it('normalizes tags and preserves display writing', () => {
    const normalized = entry({ writing: ' タベル ', tags: 'еда, глагол, еда' });
    expect(normalized.writing).toBe('タベル');
    expect(normalized.tags).toEqual(['еда', 'глагол']);
    expect(normalizeJapaneseForComparison(' タベル。')).toBe('たべる');
    expect(getUserDictionaryEntryKey(normalized)).toBe('たべる');
  });

  it('does not invent readings, meanings, or examples', () => {
    const normalized = entry({ writing: '', reading: 'たべる', examples: [] });
    expect(normalized.writing).toBe('');
    expect(normalized.reading).toBe('たべる');
    expect(normalized.meanings).toEqual(['есть']);
    expect(normalized.examples).toEqual([]);
  });

  it('strips HTML only when requested and keeps it inert as text otherwise', () => {
    expect(entry({ meanings: ['<b>есть</b>'] }).meanings).toEqual(['<b>есть</b>']);
    expect(
      normalizeUserDictionaryEntry(
        { writing: '食べる', meanings: ['<script>alert(1)</script>есть'] },
        {
          dictionaryId: 'user-dict:12345678',
          sourceType: 'import',
          stripHtml: true,
          now: NOW,
        }
      ).meanings
    ).toEqual(['alert(1) есть']);
  });

  it('validates fully normalized entries with a strict Zod schema', () => {
    const value = entry();
    expect(UserDictionaryEntrySchema.parse(value)).toEqual(value);
    expect(() => UserDictionaryEntrySchema.parse({ ...value, __unexpected: true })).toThrow();
  });
});

describe('duplicates and exports', () => {
  it('merges values without replacing stable identity or a populated note', () => {
    const existing = entry({ id: 'user-word:existing1', notes: 'Сохранить', tags: ['еда'] });
    const incoming = entry({
      id: 'user-word:incoming1',
      meanings: ['кушать'],
      tags: ['глагол'],
      notes: 'Новая заметка',
    });
    const merged = mergeUserDictionaryEntries(existing, incoming, { now: NOW });
    expect(merged.id).toBe(existing.id);
    expect(merged.meanings).toEqual(['есть', 'кушать']);
    expect(merged.tags).toEqual(['еда', 'глагол']);
    expect(merged.notes).toBe('Сохранить');
  });

  it('supports skip, replace, merge and separate conflict strategies', () => {
    const existing = entry({ id: 'user-word:existing1' });
    const incoming = entry({ id: 'user-word:incoming1', meanings: ['кушать'] });
    expect(resolveEntryConflict(existing, incoming, 'skip').entry.id).toBe(existing.id);
    expect(resolveEntryConflict(existing, incoming, 'replace').entry.id).toBe(existing.id);
    expect(resolveEntryConflict(existing, incoming, 'merge').entry.meanings).toContain('кушать');
    expect(resolveEntryConflict(existing, incoming, 'separate').entry.id).toBe(incoming.id);
  });

  it('creates strict JSON export without unrelated state', () => {
    const dictionary = UserDictionarySchema.parse({
      id: 'user-dict:12345678',
      name: 'Экспорт',
      description: '',
      createdAt: NOW,
      updatedAt: NOW,
      sourceType: 'manual',
      schemaVersion: 1,
    });
    const exported = createUserDictionaryExport(dictionary, [entry()], NOW);
    expect(exported.format).toBe('kotokitsu-dictionary');
    expect(exported.schemaVersion).toBe(1);
    expect(exported).not.toHaveProperty('settings');
    expect(exported).not.toHaveProperty('srs');
  });

  it('protects every spreadsheet formula prefix in CSV', () => {
    for (const value of ['=SUM(A1:A2)', '+cmd', '-1+2', '@IMPORT']) {
      expect(protectCsvFormula(value)).toBe(`'${value}`);
    }
    const csv = exportUserDictionaryCsv([entry({ meanings: ['=danger'], notes: '+cmd' })]);
    expect(csv).toContain(`"'=danger"`);
    expect(csv).toContain(`"'+cmd"`);
  });
});

describe('knowledge item capabilities', () => {
  it('reuses typing and kanji capabilities', () => {
    const value = entry();
    const capabilities = getUserEntryCapabilities(value);
    expect(capabilities.recognition).toBe(true);
    expect(capabilities.recall).toBe(true);
    expect(capabilities.drawing).toBe(true);
    expect(capabilities.contextProduction).toBe(false);
    expect(capabilities.acceptedAnswers).toContain('たべる');
  });

  it('does not create context production from a plain example', () => {
    const value = entry({
      examples: [{ japanese: 'りんごを食べる。', translation: 'Есть яблоко.' }],
    });
    expect(getUserEntryCapabilities(value).contextProduction).toBe(false);
  });

  it('allows context production only with a structured verifiable task', () => {
    const value = entry({
      productionTask: {
        prompt: 'Скажите: я ем яблоко',
        meaningCue: 'есть',
        acceptedAnswers: ['りんごを食べる'],
        requiredForm: 'dictionary',
      },
    });
    expect(getUserEntryCapabilities(value).contextProduction).toBe(true);
  });

  it('creates a namespaced knowledge item without changing the entry', () => {
    const value = entry();
    const item = createKnowledgeItemFromUserEntry(value);
    expect(item.id).toBe(value.id);
    expect(item.sourceType).toBe('user-dictionary');
    expect(item.sourceDictionaryId).toBe(value.dictionaryId);
    expect(item.russian).toBe('есть');
  });
});

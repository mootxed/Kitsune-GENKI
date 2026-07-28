import { describe, expect, it } from 'vitest';
import {
  ensurePersonalDictionary,
  findTokenLexemeMatches,
  PERSONAL_DICTIONARY_ID,
  prepareTokenDictionaryDraft,
  saveSenseiDictionaryEntry,
} from '../src/ai/personal-dictionary.js';
import { createUserDictionaryModel } from '../src/user-dictionaries/repository.js';
import { normalizeUserDictionaryEntry } from '../src/user-dictionaries/normalize.js';

class MemoryRepository {
  constructor() {
    this.dictionaries = [];
    this.entries = [];
  }
  async listDictionaries() {
    return this.dictionaries;
  }
  async getDictionary(id) {
    return this.dictionaries.find((dictionary) => dictionary.id === id) || null;
  }
  async saveDictionary(raw) {
    const current = await this.getDictionary(raw.id);
    const value = createUserDictionaryModel(
      { ...current, ...raw, createdAt: current?.createdAt },
      new Date().toISOString()
    );
    this.dictionaries = [...this.dictionaries.filter((item) => item.id !== value.id), value];
    return value;
  }
  async listEntries(dictionaryId) {
    return this.entries.filter((entry) => entry.dictionaryId === dictionaryId);
  }
  async getEntry(id) {
    return this.entries.find((entry) => entry.id === id) || null;
  }
  async saveEntry(raw) {
    const current = raw.id ? await this.getEntry(raw.id) : null;
    const value = normalizeUserDictionaryEntry({
      ...current,
      ...raw,
      id: current?.id || raw.id,
      dictionaryId: raw.dictionaryId || current?.dictionaryId,
      createdAt: current?.createdAt || raw.createdAt,
    });
    this.entries = [...this.entries.filter((entry) => entry.id !== value.id), value];
    return value;
  }
}

describe('AI Sensei personal dictionary', () => {
  it('lazily creates one personal dictionary and survives rename', async () => {
    const repository = new MemoryRepository();
    const first = await ensurePersonalDictionary(repository);
    const second = await ensurePersonalDictionary(repository);
    expect(first.id).toBe(PERSONAL_DICTIONARY_ID);
    expect(second.id).toBe(first.id);
    expect(repository.dictionaries).toHaveLength(1);
    await repository.saveDictionary({ ...first, name: 'Японские слова' });
    const renamed = await ensurePersonalDictionary(repository);
    expect(renamed.id).toBe(PERSONAL_DICTIONARY_ID);
    expect(repository.dictionaries).toHaveLength(1);
  });

  it.each([
    ['ordinary word', { kanji: '猫', writing: 'ねこ', translation: 'кошка', type: 'Noun' }, '猫'],
    [
      'inflected verb',
      {
        kanji: '始めました',
        writing: 'はじめました',
        translation: 'начал',
        type: 'Verb',
        dictionaryForm: '始める',
        dictionaryReading: 'はじめる',
        dictionaryMeaning: 'начинать',
      },
      '始める',
    ],
    [
      'particle',
      { kanji: 'は', writing: 'は', translation: 'тематическая частица', type: 'Particle' },
      'は',
    ],
  ])('adds %s with learning disabled', async (_name, token, expectedWriting) => {
    const repository = new MemoryRepository();
    const draft = prepareTokenDictionaryDraft({
      token,
      sentence: '私は始めました。',
      sentenceTranslation: 'Я начал.',
    });
    const result = await saveSenseiDictionaryEntry({
      repository,
      draft,
      duplicateAction: 'separate',
    });
    expect(result.entry.writing).toBe(expectedWriting);
    expect(result.entry.learningEnabled).toBe(false);
    expect(result.entry.source.label).toBe('AI Сенсей');
  });

  it('warns when dictionary form falls back to the surface form', () => {
    const draft = prepareTokenDictionaryDraft({
      token: { kanji: '未知語', writing: 'みちご', translation: 'неизвестное', type: 'Noun' },
    });
    expect(draft.writing).toBe('未知語');
    expect(draft.uncertain).toBe(true);
    expect(draft.notes).toContain('проверьте');
  });

  it('prefers the local catalog, then user dictionaries, before model fallback', () => {
    const token = {
      kanji: '始めました',
      writing: 'はじめました',
      translation: 'начал',
      dictionaryForm: '始める',
      dictionaryReading: 'はじめる',
      dictionaryMeaning: 'начинать',
    };
    const matches = findTokenLexemeMatches(
      token,
      [{ writing: '始める', reading: 'はじめる', meanings: ['приступать'] }],
      [{ writing: '始める', reading: 'はじめる', meanings: ['начинать'] }]
    );
    const draft = prepareTokenDictionaryDraft({ token, ...matches });
    expect(draft.meanings).toEqual(['приступать']);
    expect(draft.uncertain).toBe(false);
  });

  it('supports duplicate open, merge and separate without resetting learning progress', async () => {
    const repository = new MemoryRepository();
    const dictionary = await ensurePersonalDictionary(repository);
    const existing = await repository.saveEntry({
      id: 'user-word:abcdefgh',
      dictionaryId: dictionary.id,
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      tags: ['старое'],
      examples: [],
      partOfSpeech: ['Noun'],
      notes: 'Старая заметка',
      source: { type: 'manual', label: 'Ручной ввод', externalId: null },
      learningEnabled: true,
    });
    const draft = prepareTokenDictionaryDraft({
      token: { kanji: '猫', writing: 'ねこ', translation: 'кот', type: 'Noun' },
      dictionaryId: dictionary.id,
      sentence: '猫です。',
      sentenceTranslation: 'Это кошка.',
    });
    const duplicate = await saveSenseiDictionaryEntry({ repository, draft });
    expect(duplicate.status).toBe('duplicate');
    const opened = await saveSenseiDictionaryEntry({
      repository,
      draft,
      duplicateAction: 'open',
      duplicateEntry: existing,
    });
    expect(opened.entry.id).toBe(existing.id);
    const merged = await saveSenseiDictionaryEntry({
      repository,
      draft,
      duplicateAction: 'merge',
      duplicateEntry: existing,
    });
    expect(merged.entry.id).toBe(existing.id);
    expect(merged.entry.learningEnabled).toBe(true);
    expect(merged.entry.meanings).toEqual(expect.arrayContaining(['кошка', 'кот']));
    const separate = await saveSenseiDictionaryEntry({
      repository,
      draft,
      duplicateAction: 'separate',
      duplicateEntry: existing,
    });
    expect(separate.entry.id).not.toBe(existing.id);
  });

  it('can target a regular dictionary and rejects a deleted target', async () => {
    const repository = new MemoryRepository();
    const regular = await repository.saveDictionary({ name: 'Учёба', kind: 'regular' });
    const draft = prepareTokenDictionaryDraft({
      token: { kanji: '本', writing: 'ほん', translation: 'книга', type: 'Noun' },
      dictionaryId: regular.id,
    });
    const saved = await saveSenseiDictionaryEntry({
      repository,
      draft,
      duplicateAction: 'separate',
    });
    expect(saved.entry.dictionaryId).toBe(regular.id);
    await expect(
      saveSenseiDictionaryEntry({
        repository,
        draft: { ...draft, dictionaryId: 'user-dict:deleted1' },
        duplicateAction: 'separate',
      })
    ).rejects.toThrow('удалён');
  });

  it('correctly distinguishes homonyms like 橋 (bridge) and 箸 (chopsticks) based on 6-tier hierarchy', () => {
    const catalog = [
      { writing: '箸', reading: 'はし', meanings: ['палочки'] },
      { writing: '橋', reading: 'はし', meanings: ['мост'] },
    ];

    // Case A: token has exact writing 橋 and reading はし -> must match 橋, NOT 箸
    const bridgeToken = {
      kanji: '橋',
      writing: 'はし',
      dictionaryForm: '橋',
      dictionaryReading: 'はし',
    };
    const bridgeMatch = findTokenLexemeMatches(bridgeToken, catalog);
    expect(bridgeMatch.catalogMatch?.writing).toBe('橋');

    // Case B: token has reading only はし and multiple homonyms exist -> returns null (ambiguous)
    const ambiguousToken = { writing: 'はし', dictionaryReading: 'はし' };
    const ambiguousMatch = findTokenLexemeMatches(ambiguousToken, catalog);
    expect(ambiguousMatch.catalogMatch).toBeNull();
  });
});

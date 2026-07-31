import { describe, expect, it } from 'vitest';
import {
  TokenOccurrenceSchema,
  normalizeLegacyStoryToken,
} from '../src/dictionary/token-occurrence.js';

describe('TokenOccurrence Contract', () => {
  it('validates canonical TokenOccurrence structure', () => {
    const canonical = {
      schemaVersion: 1,
      id: 'story-42:sentence-3:token-5',
      surface: '食べました',
      reading: 'たべました',
      dictionaryId: 'jp-word:食べる:たべる',
      form: {
        tense: 'past',
        politeness: 'polite',
        polarity: 'affirmative',
        conjugation: 'masu-past',
      },
      contextMeaning: 'поел',
      resolution: {
        status: 'resolved',
        source: 'builtin',
        confidence: 1,
      },
    };

    const parsed = TokenOccurrenceSchema.parse(canonical);
    expect(parsed).toEqual(canonical);
  });

  it('rejects invalid resolution status', () => {
    const invalid = {
      schemaVersion: 1,
      id: 'token-1',
      surface: 'テスト',
      reading: 'てすと',
      dictionaryId: null,
      resolution: {
        status: 'unknown-status',
        source: 'builtin',
        confidence: 1,
      },
    };

    expect(() => TokenOccurrenceSchema.parse(invalid)).toThrow();
  });
});

describe('normalizeLegacyStoryToken Adapter', () => {
  it('converts legacy token with kanji, writing, translation to canonical TokenOccurrence', () => {
    const legacyToken = {
      kanji: '食べました',
      writing: 'たべました',
      translation: 'поел',
      type: 'Verb',
      lexemeId: 'jp-word:食べる:たべる',
    };

    const context = { storyId: 'story-1', sentenceId: 2, tokenIndex: 3 };
    const normalized = normalizeLegacyStoryToken(legacyToken, context);

    expect(normalized).toEqual({
      schemaVersion: 1,
      id: 'story-1:sentence-2:token-3',
      surface: '食べました',
      reading: 'たべました',
      dictionaryId: 'jp-word:食べる:たべる',
      form: {
        tense: null,
        politeness: null,
        polarity: null,
        conjugation: null,
      },
      contextMeaning: 'поел',
      resolution: {
        status: 'resolved',
        source: 'builtin',
        confidence: 1,
      },
    });
  });

  it('handles punctuation correctly as non-lexical token', () => {
    const legacyPunctuation = {
      kanji: '。',
      writing: '。',
      translation: '',
      type: 'Punctuation',
    };

    const normalized = normalizeLegacyStoryToken(legacyPunctuation, {
      storyId: 'story-1',
      sentenceId: 1,
      tokenIndex: 0,
    });

    expect(normalized.resolution.status).toBe('non-lexical');
    expect(normalized.resolution.source).toBe('none');
    expect(normalized.dictionaryId).toBeNull();
  });

  it('is idempotent when given an already normalized TokenOccurrence', () => {
    const canonical = TokenOccurrenceSchema.parse({
      schemaVersion: 1,
      id: 'story-1:sentence-1:token-1',
      surface: '猫',
      reading: 'ねこ',
      dictionaryId: 'jp-word:猫:ねこ',
      form: {},
      contextMeaning: 'кошка',
      resolution: {
        status: 'resolved',
        source: 'builtin',
        confidence: 1,
      },
    });

    const result = normalizeLegacyStoryToken(canonical, {
      storyId: 's',
      sentenceId: 1,
      tokenIndex: 1,
    });
    expect(result).toEqual(canonical);
  });
});

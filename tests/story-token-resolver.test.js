import { describe, expect, it } from 'vitest';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { resolveStoryTokens } from '../src/ai/story-token-resolver.js';

const eatEntry = normalizeDictionaryEntry({
  id: 'jp-word:食べる:たべる',
  dictionaryForm: '食べる',
  reading: 'たべる',
  meanings: ['есть', 'кушать'],
  partOfSpeech: 'verb',
  verbClass: 'ichidan',
  tokenForms: ['食べる', 'たべる', '食べました', '食べて'],
});

const watashiEntry = normalizeDictionaryEntry({
  id: 'jp-word:私:わたし',
  dictionaryForm: '私',
  reading: 'わたし',
  meanings: ['я'],
  partOfSpeech: 'noun',
  tokenForms: ['私', 'わたし'],
});

const gohanEntry = normalizeDictionaryEntry({
  id: 'jp-word:ご飯:ごはん',
  dictionaryForm: 'ご飯',
  reading: 'ごはん',
  meanings: ['еда'],
  partOfSpeech: 'noun',
  tokenForms: ['ご飯', 'ごはん'],
});

function createMockLoader() {
  return {
    async load() {
      return {
        manifest: { schemaVersion: 1, contentVersion: '1' },
        entries: [eatEntry, watashiEntry, gohanEntry],
        tokenIndex: {
          食べる: [eatEntry.id],
          たべる: [eatEntry.id],
          食べました: [eatEntry.id],
          食べて: [eatEntry.id],
          私: [watashiEntry.id],
          わたし: [watashiEntry.id],
          ご飯: [gohanEntry.id],
          ごはん: [gohanEntry.id],
        },
        aliases: {},
      };
    },
  };
}

describe('StoryTokenResolver', () => {
  it('resolves curated hit (0 lexical AI calls)', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });
    let aiCalls = 0;
    const aiProvider = {
      async enrichUnknownLexemes() {
        aiCalls++;
        return { entries: [] };
      },
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Рассказчик',
        translation: 'Я поел.',
        tokens: [
          { kanji: '私', writing: 'わたし', translation: 'я' },
          { kanji: 'は', writing: 'は', type: 'Punctuation' },
          { kanji: 'ご飯', writing: 'ごはん', translation: 'еда' },
          { kanji: 'を', writing: 'を', type: 'Punctuation' },
          { kanji: '食べました', writing: 'たべました', translation: 'поел' },
        ],
      },
    ];

    const result = await resolveStoryTokens({
      story,
      dictionaryStore: store,
      aiLexicalProvider: aiProvider,
    });

    expect(result.statistics.lexicalAiCalls).toBe(0);
    const eatToken = result.story[0].tokens.find((t) => t.surface === '食べました');
    expect(eatToken.dictionaryId).toBe('jp-word:食べる:たべる');
    expect(eatToken.resolution.status).toBe('resolved');
    expect(eatToken.resolution.source).toBe('builtin');
  });

  it('resolves explicit W1 reference from prompt', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });
    const selectedWordRefs = {
      W1: 'jp-word:食べる:たべる',
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Taro',
        translation: 'Поел.',
        tokens: [{ surface: '食べました', dictionaryRef: 'W1', contextMeaning: 'поел' }],
      },
    ];

    const result = await resolveStoryTokens({
      story,
      selectedWordRefs,
      dictionaryStore: store,
    });

    expect(result.statistics.explicitReferenceHits).toBe(1);
    const token = result.story[0].tokens[0];
    expect(token.dictionaryId).toBe('jp-word:食べる:たべる');
    expect(token.resolution.source).toBe('explicit-reference');
  });

  it('rejects invalid W999 reference from model', async () => {
    const store = new DictionaryStore({ loader: createMockLoader(), userRepository: null });
    const selectedWordRefs = {
      W1: 'jp-word:食べる:たべる',
    };

    const story = [
      {
        sentence_id: 1,
        speaker: 'Taro',
        translation: 'Поел.',
        tokens: [{ surface: '食べました', dictionaryRef: 'W999' }],
      },
    ];

    const result = await resolveStoryTokens({
      story,
      selectedWordRefs,
      dictionaryStore: store,
    });

    expect(result.statistics.explicitReferenceHits).toBe(0);
    const token = result.story[0].tokens[0];
    // Falls back to curated lookup for '食べました'
    expect(token.dictionaryId).toBe('jp-word:食べる:たべる');
    expect(token.resolution.source).toBe('builtin');
  });
});

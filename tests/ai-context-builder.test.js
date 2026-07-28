import { describe, expect, it } from 'vitest';
import { buildAIContext, serializeAIContext } from '../src/ai/context-builder.js';
import { selectWords } from '../src/ai/word-selector.js';

const lessons = [
  {
    id: 1,
    words: [
      { id: 'word:猫', writing: '猫', reading: 'ねこ', meanings: ['кошка'] },
      { id: 'word:犬', writing: '犬', reading: 'いぬ', meanings: ['собака'] },
      { id: 'word:本', writing: '本', reading: 'ほん', meanings: ['книга'] },
    ],
  },
];

const state = {
  xp: 9000,
  level: 99,
  masteryArchive: { secret: true },
  reviewEvents: [{ sensitive: true }],
  settings: { jlptTarget: 'N5' },
  activeChapterId: 1,
  chapters: { 1: { started: true } },
  srs: {
    'word:猫::recognition': { itemId: 'word:猫', difficulty: 8, lapses: 2, status: 'review' },
    'word:犬::recognition': { itemId: 'word:犬', stability: 4, status: 'review' },
    'word:本::recognition': { itemId: 'word:本', stability: 20, status: 'review' },
  },
  chatHistory: [{ role: 'user', content: 'Привет' }],
};

describe('AI context builder privacy boundary', () => {
  it('sends only needed fields and temporary word tokens', async () => {
    const context = await buildAIContext({
      intentResult: {
        intent: 'create_story',
        topic: 'магазин',
        wordSource: 'mixed',
        explicitWords: [],
      },
      state,
      lessons,
    });
    const serialized = serializeAIContext(context);
    expect(serialized).toContain('"jlptTarget":"N5"');
    expect(serialized).toContain('"token":"W1"');
    expect(serialized).not.toContain('word:猫');
    expect(serialized).not.toContain('9000');
    expect(serialized).not.toContain('mastery');
    expect(serialized).not.toContain('reviewEvents');
  });

  it('does not infer or send JLPT without an explicit setting', async () => {
    const context = await buildAIContext({
      intentResult: { intent: 'general_question', question: 'Что такое は?' },
      state: { ...state, settings: {}, level: 5 },
      lessons,
    });
    expect(context).not.toHaveProperty('jlptTarget');
  });

  it('supports explicit, difficult, learned, current lesson and mixed sources', () => {
    expect(
      selectWords({ source: 'explicit_words', explicitWords: ['水'], state, lessons })[0].writing
    ).toBe('水');
    expect(selectWords({ source: 'fsrs_difficult', state, lessons })[0].writing).toBe('猫');
    expect(selectWords({ source: 'fsrs_learned', state, lessons }).length).toBeGreaterThan(0);
    expect(selectWords({ source: 'current_lesson', state, lessons })).toHaveLength(3);
    expect(selectWords({ source: 'mixed', state, lessons, limit: 3 })).toHaveLength(3);
  });

  it('uses only entries from the selected user dictionary', async () => {
    const repository = {
      listDictionaries: async () => [{ id: 'user-dict:abcdefgh', name: 'A' }],
      listEntries: async (id) =>
        id === 'user-dict:abcdefgh'
          ? [{ id: 'user-word:abcdefgh', writing: '空', reading: 'そら', meanings: ['небо'] }]
          : [],
    };
    const context = await buildAIContext({
      intentResult: {
        intent: 'create_story',
        topic: 'небо',
        wordSource: 'user_dictionary',
        dictionaryId: 'user-dict:abcdefgh',
      },
      state,
      lessons,
      repository,
    });
    expect(context.words).toEqual([
      expect.objectContaining({ token: 'W1', writing: '空', reading: 'そら' }),
    ]);
  });
});

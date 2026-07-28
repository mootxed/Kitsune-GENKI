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

  it('does not unlock words in other unstarted chapters when a single card from chapter 1 is learning', () => {
    const multiChapterLessons = [
      {
        id: 1,
        words: [{ id: 'word:ch1', writing: '一', reading: 'いち', meanings: ['один'] }],
      },
      {
        id: 2,
        words: [{ id: 'word:ch2', writing: '二', reading: 'に', meanings: ['два'] }],
      },
    ];
    const testState = {
      chapters: { 1: { started: true }, 2: { started: false } },
      srs: {
        'word:ch1::recognition': { itemId: 'word:ch1', status: 'learning' },
      },
    };
    const unlocked = selectWords({
      source: 'mixed',
      state: testState,
      lessons: multiChapterLessons,
    });
    const writings = unlocked.map((w) => w.writing);
    expect(writings).toContain('一');
    expect(writings).not.toContain('二');
  });

  it('excludes words that are planLocked even if the chapter is started', () => {
    const lessonWithLockedWord = [
      {
        id: 1,
        words: [
          { id: 'word:unlocked', writing: '月', reading: 'つき', meanings: ['луна'] },
          { id: 'word:plan_locked', writing: '太陽', reading: 'たいよう', meanings: ['солнце'] },
        ],
      },
    ];
    const testState = {
      chapters: { 1: { started: true } },
      srs: {
        'word:plan_locked::recognition': { itemId: 'word:plan_locked', planLocked: true },
      },
    };
    const unlocked = selectWords({
      source: 'mixed',
      state: testState,
      lessons: lessonWithLockedWord,
    });
    const writings = unlocked.map((w) => w.writing);
    expect(writings).toContain('月');
    expect(writings).not.toContain('太陽');
  });

  it('sorts recent learned cards by last review timestamp in descending order', () => {
    const recentState = {
      chapters: { 1: { started: true } },
      srs: {
        'word:猫::recognition': {
          itemId: 'word:猫',
          stability: 2,
          status: 'review',
          last_review: '2026-01-01T10:00:00Z',
        },
        'word:犬::recognition': {
          itemId: 'word:犬',
          stability: 3,
          status: 'review',
          last_review: '2026-05-01T10:00:00Z',
        },
      },
    };
    const result = selectWords({ source: 'fsrs_learned', state: recentState, lessons });
    expect(result[0].writing).toBe('犬');
    expect(result[1].writing).toBe('猫');
  });
});

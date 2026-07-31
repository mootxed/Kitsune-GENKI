/**
 * tests/dictionary-relations-index.test.js
 *
 * Tests for DictionaryRelationsIndex and StoryOccurrenceIndex.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { DictionaryRelationsIndex } from '../src/dictionary/dictionary-relations-index.js';
import {
  StoryOccurrenceIndex,
  savedNotesToStoryDescriptors,
  builtinStoryToDescriptor,
} from '../src/dictionary/story-occurrence-index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const taberu = normalizeDictionaryEntry({
  dictionaryForm: '食べる',
  reading: 'たべる',
  meanings: ['есть'],
  partOfSpeech: 'verb',
  verbClass: 'ichidan',
  tokenForms: ['食べる', 'たべる', '食べます', '食べました'],
});

const neko = normalizeDictionaryEntry({
  dictionaryForm: '猫',
  reading: 'ねこ',
  meanings: ['кошка'],
  partOfSpeech: 'noun',
  tokenForms: ['猫', 'ねこ'],
});

function makeStore() {
  const store = new DictionaryStore({
    loader: {
      async load() {
        return {
          manifest: { schemaVersion: 1, contentVersion: '1' },
          entries: [taberu, neko],
          tokenIndex: { 食べる: [taberu.id], ねこ: [neko.id] },
          aliases: {},
        };
      },
    },
    userRepository: null,
  });
  return store;
}

// ---------------------------------------------------------------------------
// StoryOccurrenceIndex tests
// ---------------------------------------------------------------------------

describe('StoryOccurrenceIndex', () => {
  let index;
  beforeEach(() => {
    index = new StoryOccurrenceIndex();
  });

  it('indexes resolved tokens from curated story', () => {
    index.build([
      {
        storyId: 'genki-1:story:4',
        storyTitle: 'Море',
        source: 'curated',
        content: [
          {
            sentence_id: 1,
            translation: 'Я ел суши.',
            tokens: [
              {
                surface: '食べました',
                reading: 'たべました',
                dictionaryId: taberu.id,
                resolution: { status: 'resolved' },
              },
              { surface: 'が', resolution: { status: 'non-lexical' } },
            ],
          },
        ],
      },
    ]);
    const occs = index.getOccurrences(taberu.id);
    expect(occs).toHaveLength(1);
    expect(occs[0]).toMatchObject({
      storyId: 'genki-1:story:4',
      storyTitle: 'Море',
      surface: '食べました',
      source: 'curated',
    });
  });

  it('does NOT index non-lexical or unresolved tokens', () => {
    index.build([
      {
        storyId: 'genki-1:story:1',
        storyTitle: 'Test',
        source: 'curated',
        content: [
          {
            sentence_id: 1,
            translation: '',
            tokens: [
              { surface: '。', resolution: { status: 'non-lexical' } },
              { surface: 'unknown', dictionaryId: null, resolution: { status: 'missing' } },
            ],
          },
        ],
      },
    ]);
    expect(index.getOccurrences('any-id')).toHaveLength(0);
  });

  it('generates deterministic IDs', () => {
    const descriptor = {
      storyId: 'story-a',
      storyTitle: 'A',
      source: 'curated',
      content: [
        {
          sentence_id: 3,
          translation: '',
          tokens: [
            { surface: '食べる', dictionaryId: taberu.id, resolution: { status: 'resolved' } },
          ],
        },
      ],
    };
    index.build([descriptor]);
    index.invalidate();
    index.build([descriptor]);
    const occs = index.getOccurrences(taberu.id);
    expect(occs[0].id).toBe('story-occurrence:story-a:3:0');
  });

  it('two occurrences in same sentence are separate entries', () => {
    index.build([
      {
        storyId: 'story-b',
        storyTitle: 'B',
        source: 'curated',
        content: [
          {
            sentence_id: 1,
            translation: '',
            tokens: [
              { surface: '食べる', dictionaryId: taberu.id, resolution: { status: 'resolved' } },
              { surface: '食べます', dictionaryId: taberu.id, resolution: { status: 'resolved' } },
            ],
          },
        ],
      },
    ]);
    const occs = index.getOccurrences(taberu.id);
    expect(occs).toHaveLength(2);
    expect(occs[0].id).not.toBe(occs[1].id);
  });

  it('saved AI story (with story array) is indexed', () => {
    const descriptors = savedNotesToStoryDescriptors([
      {
        id: 'ai_story_note:ai-story-abc',
        sourceStoryId: 'ai-story-abc',
        title: 'AI История',
        content: 'текст',
        story: [
          {
            sentence_id: 1,
            translation: 'test',
            tokens: [
              { surface: '食べた', dictionaryId: taberu.id, resolution: { status: 'resolved' } },
            ],
          },
        ],
      },
    ]);
    expect(descriptors).toHaveLength(1);
    index.build(descriptors);
    const occs = index.getOccurrences(taberu.id);
    expect(occs).toHaveLength(1);
    expect(occs[0].source).toBe('ai');
  });

  it('unsaved AI story (no story array) is NOT indexed', () => {
    const descriptors = savedNotesToStoryDescriptors([
      {
        id: 'ai_story_note:x',
        title: 'No story array',
        content: 'text only, no story property',
      },
    ]);
    expect(descriptors).toHaveLength(0);
  });

  it('invalidate clears the index', () => {
    index.build([
      {
        storyId: 'story-c',
        storyTitle: 'C',
        source: 'curated',
        content: [
          {
            sentence_id: 1,
            translation: '',
            tokens: [
              { surface: '食べる', dictionaryId: taberu.id, resolution: { status: 'resolved' } },
            ],
          },
        ],
      },
    ]);
    expect(index.getOccurrences(taberu.id)).toHaveLength(1);
    index.invalidate();
    expect(index.getOccurrences(taberu.id)).toHaveLength(0);
    expect(index.isBuilt).toBe(false);
  });

  it('builtinStoryToDescriptor generates namespaced storyId', () => {
    const desc = builtinStoryToDescriptor({ id: '4', title: 'Море', content: [] }, 'genki-1');
    expect(desc.storyId).toBe('genki-1:story:4');
    expect(desc.source).toBe('curated');
  });
});

// ---------------------------------------------------------------------------
// DictionaryRelationsIndex tests
// ---------------------------------------------------------------------------

describe('DictionaryRelationsIndex', () => {
  let store;
  let relIndex;

  beforeEach(async () => {
    store = makeStore();
    await store.ensureLoaded();
    relIndex = new DictionaryRelationsIndex();
  });

  it('buildLessonIndex uses DictionaryStore course references', () => {
    store.resolveCourseVocabularyReference({
      id: 'genki-1:vocabulary:taberu',
      localId: 'taberu',
      courseId: 'genki-1',
      dictionaryId: taberu.id,
      introducedIn: 'genki-1:lesson-3',
      courseMeaning: 'есть',
    });
    relIndex.buildLessonIndex(store);
    const lessons = relIndex.getLessonReferences(taberu.id, store);
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0].courseId).toBe('genki-1');
  });

  it('getLessonReferences falls back to store when not built', () => {
    store.resolveCourseVocabularyReference({
      id: 'genki-1:vocabulary:neko',
      localId: 'neko',
      courseId: 'genki-1',
      dictionaryId: neko.id,
      introducedIn: 'genki-1:lesson-1',
      courseMeaning: 'кошка',
    });
    // Index not built
    const lessons = relIndex.getLessonReferences(neko.id, store);
    expect(lessons.length).toBeGreaterThan(0);
  });

  it('invalidate clears all indices', () => {
    relIndex.buildLessonIndex(store);
    expect(relIndex.isLessonsBuilt).toBe(true);
    relIndex.invalidate();
    expect(relIndex.isLessonsBuilt).toBe(false);
  });
});

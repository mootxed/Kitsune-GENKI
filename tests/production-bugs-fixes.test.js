import { describe, it, expect, beforeEach } from 'vitest';
import {
  DictionaryRelationsIndex,
  GRAMMAR_REGISTRY,
  getTypeBasedGrammarLinks,
  resolveGrammarTopicId,
} from '../src/dictionary/dictionary-relations-index.js';
import { ExamplesDB } from '../src/examples-db.js';
import { resolveLessonStatus } from '../src/chapter-progress.js';
import { getConjugationsWithStatus } from '../src/dictionary/dictionary-details-service.js';
import { renderStoryContent } from '../ui/stories.js';
import { resolveStoryTokens } from '../src/ai/story-token-resolver.js';

describe('Production Bug Fixes & Architecture Verification', () => {
  let mockStore;

  beforeEach(() => {
    mockStore = {
      ensureLoaded: async () => {},
      resolveAlias: (id) => (id === 'taberu-alias' ? 'taberu' : id),
      getDictionaryEntry: (id) => {
        if (id === 'taberu' || id === 'taberu-alias') {
          return {
            id: 'taberu',
            dictionaryForm: '食べる',
            reading: 'たべる',
            partOfSpeech: 'verb',
            verbClass: 'ru',
            meanings: [{ id: 'm1', gloss: 'eat' }],
          };
        }
        return null;
      },
      findCourseReferencesForDictionary: () => [],
      findDictionaryCandidatesByToken: (t) => {
        const text = typeof t === 'string' ? t : t?.surface || t?.kanji || t?.writing || '';
        if (text.includes('食べる') || text.includes('たべる')) {
          return { candidates: ['taberu'] };
        }
        return { candidates: [] };
      },
      findDictionaryCandidatesByReading: () => ({ candidates: [] }),
    };
    ExamplesDB.clear();
  });

  it('1. DictionaryRelationsIndex preserves example metadata fields (sentenceId, tokenId, sourceLessonId, courseId)', () => {
    ExamplesDB.addRawSentence({
      japanese: 'ご飯を食べる。',
      reading: 'ごはんをたべる。',
      translation: 'Eat rice.',
      sourceLessonId: 'genki-1:lesson-3',
      courseId: 'genki-1',
      source: 'story',
      storyId: 'genki-1:story:lesson-3',
      sentenceId: 2,
      tokens: [
        { surface: 'ご飯', dictionaryId: 'gohan' },
        { surface: 'を', dictionaryId: 'wo' },
        { surface: '食べる', dictionaryId: 'taberu', id: 'tok-taberu-1' },
      ],
      targetLexemeIds: ['taberu'],
    });
    ExamplesDB.rebuildIndex();

    const relationsIndex = new DictionaryRelationsIndex();
    relationsIndex.buildExampleIndex(ExamplesDB, mockStore);

    const refs = relationsIndex.getExampleReferences('taberu', mockStore);
    expect(refs.length).toBeGreaterThan(0);
    const ex = refs[0];

    expect(ex.storyId).toBe('genki-1:story:lesson-3');
    expect(ex.sentenceId).toBe(2);
    expect(ex.tokenId).toBe('tok-taberu-1');
    expect(ex.sourceLessonId).toBe('genki-1:lesson-3');
  });

  it('2. resolveGrammarTopicId resolves both local and global topic IDs, and polite-past points to lesson 4 (L4_g6)', () => {
    // Check registry mapping for polite-past
    const politePastRegistry = GRAMMAR_REGISTRY.find((r) => r.grammarId === 'polite-past');
    expect(politePastRegistry).toBeDefined();
    expect(politePastRegistry.lessonId).toBe('genki-1:lesson-4');
    expect(politePastRegistry.topicId).toBe('L4_g6');

    // Check resolveGrammarTopicId returns global topic ID
    expect(resolveGrammarTopicId('te-form')).toBe('genki-1:grammar:L6_g1');
    expect(resolveGrammarTopicId('L6_g1')).toBe('genki-1:grammar:L6_g1');
    expect(resolveGrammarTopicId('genki-1:grammar:L6_g1')).toBe('genki-1:grammar:L6_g1');
    expect(resolveGrammarTopicId('polite-past')).toBe('genki-1:grammar:L4_g6');
  });

  it('3. getTypeBasedGrammarLinks contains courseId and lessonId for cross-course navigation', () => {
    const entry = { partOfSpeech: 'verb', verbClass: 'ru' };
    const links = getTypeBasedGrammarLinks(entry);

    expect(links.length).toBe(5);
    const teForm = links.find((l) => l.grammarId === 'te-form');
    expect(teForm).toBeDefined();
    expect(teForm.courseId).toBe('genki-1');
    expect(teForm.lessonId).toBe('genki-1:lesson-6');
    expect(teForm.topicId).toBe('L6_g1');

    const politePast = links.find((l) => l.grammarId === 'polite-past');
    expect(politePast).toBeDefined();
    expect(politePast.courseId).toBe('genki-1');
    expect(politePast.lessonId).toBe('genki-1:lesson-4');
    expect(politePast.topicId).toBe('L4_g6');
  });

  it('4. resolveLessonStatus calculates status dynamically from completedAt, checklist, and course state', () => {
    const state = {
      chapters: {
        'genki-1:lesson-1': { completedAt: 123456789, started: true, checklist: {} },
        'genki-1:lesson-2': { started: true, checklist: { sec1: true } },
        'genki-1:lesson-3': { started: false, checklist: {} },
      },
    };

    expect(resolveLessonStatus({ state, courseId: 'genki-1', lessonId: 'genki-1:lesson-1' })).toBe(
      'completed'
    );
    expect(resolveLessonStatus({ state, courseId: 'genki-1', lessonId: 'genki-1:lesson-2' })).toBe(
      'in_progress'
    );
    expect(resolveLessonStatus({ state, courseId: 'genki-1', lessonId: 'genki-1:lesson-3' })).toBe(
      'available'
    );
  });

  it('5. renderStoryContent respects abort signal and prevents DOM overwrite', async () => {
    document.body.innerHTML = '<div id="story-body">Initial Body</div>';
    const controller = new AbortController();
    controller.abort(); // Cancel before executing

    const story = {
      id: 'test-story-race',
      title: 'Race Story',
      content: [{ sentence_id: 1, tokens: [{ surface: 'テスト' }] }],
    };

    await renderStoryContent(story, {}, {}, { signal: controller.signal });
    const storyBody = document.getElementById('story-body');
    expect(storyBody.innerHTML).toBe('Initial Body');
  });

  it('6. resolveStoryTokens enriches legacy tokens with stable tokenId and dictionaryId for ExamplesDB', async () => {
    const rawStoryContent = [
      {
        sentence_id: 1,
        translation: 'I eat food.',
        tokens: [{ kanji: '食べる', writing: 'たべる', type: 'verb' }],
      },
    ];

    const { story: resolvedStory } = await resolveStoryTokens({
      story: rawStoryContent,
      dictionaryStore: mockStore,
      activeCourseId: 'genki-1',
      storyId: 'genki-1:story:lesson-3',
    });

    expect(resolvedStory[0].tokens[0].dictionaryId).toBe('taberu');
    expect(resolvedStory[0].tokens[0].id).toBeDefined();

    // Registering resolved story in ExamplesDB
    ExamplesDB.registerStory({
      id: 'genki-1:story:lesson-3',
      lessonId: 'genki-1:lesson-3',
      content: resolvedStory,
    });
    ExamplesDB.rebuildIndex();

    const relationsIndex = new DictionaryRelationsIndex();
    relationsIndex.buildExampleIndex(ExamplesDB, mockStore);
    const refs = relationsIndex.getExampleReferences('taberu', mockStore);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].tokenId).toBe(resolvedStory[0].tokens[0].id);
  });

  it('7. getConjugationsWithStatus evaluates availability against state dynamically', () => {
    const entry = {
      partOfSpeech: 'verb',
      verbClass: 'ru',
      dictionaryForm: '食べる',
      reading: 'たべる',
    };

    const completedState = {
      chapters: {
        'genki-1:lesson-6': { completedAt: 1000, started: true, checklist: {} },
      },
    };

    const conjugations = getConjugationsWithStatus(entry, null, completedState);
    const teForm = conjugations.find((c) => c.formId === 'te');
    expect(teForm).toBeDefined();
    expect(teForm.availability).toBe('learned');

    const futureState = {
      chapters: {
        'genki-1:lesson-6': { locked: true, started: false, checklist: {} },
      },
    };

    const conjugationsFuture = getConjugationsWithStatus(entry, null, futureState);
    const teFormFuture = conjugationsFuture.find((c) => c.formId === 'te');
    expect(teFormFuture.availability).toBe('future');
  });
});

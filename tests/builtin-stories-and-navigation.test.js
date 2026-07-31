import { describe, it, expect, beforeEach } from 'vitest';
import {
  storyOccurrenceIndex,
  builtinStoryToDescriptor,
} from '../src/dictionary/story-occurrence-index.js';
import { dictionaryStore } from '../src/dictionary/dictionary-store.js';
import { ExamplesDBClass } from '../src/examples-db.js';
import { dictionaryRelationsIndex } from '../src/dictionary/dictionary-relations-index.js';
import { renderStoryRoute, renderStoryContent } from '../ui/stories.js';
import { renderChapter } from '../ui/chapter.js';
import { canonicalLessonId } from '../src/courses/course-context.js';
import { resolveStoryTokens } from '../src/ai/story-token-resolver.js';

describe('Builtin Stories, Indexing, and Navigation Fixes', () => {
  let mockState;

  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="app">
        <div id="story-title"></div>
        <div id="story-title-jp"></div>
        <div id="story-body"></div>
        <div id="word-details-body"></div>
        <div id="word-bottom-sheet">
          <div class="bottom-sheet-content">
            <span class="sheet-title"></span>
            <button id="btn-open-word-page"></button>
          </div>
          <div class="bottom-sheet-backdrop"></div>
        </div>
        <div id="screen-chapter">
          <h2 id="chapter-title"></h2>
          <div id="chapter-jp"></div>
          <div id="chapter-body"></div>
        </div>
      </div>
    `;

    mockState = {
      activeCourseId: 'genki-1',
      savedNotes: [],
      priorKnowledge: {
        chapters: { 3: true },
      },
      chapters: {
        3: { started: true, completed: false },
      },
    };

    await dictionaryStore.ensureLoaded();
    storyOccurrenceIndex.invalidate();
    dictionaryRelationsIndex.invalidate();
  });

  it('1. resolves built-in story tokens with resolveStoryTokens before indexing', async () => {
    const rawStory = {
      id: '3',
      title: 'Встреча в кафе',
      content: [
        {
          sentence_id: 1,
          translation: 'Я пью кофе.',
          tokens: [
            {
              surface: '私',
              reading: 'わたし',
              dictionaryId: 'watashi',
              type: 'Word',
            },
          ],
        },
      ],
    };

    const builtinStoryId = 'genki-1:story:3';
    const { story: resolvedStory } = await resolveStoryTokens({
      story: rawStory,
      storyId: builtinStoryId,
      dictionaryStore,
      activeCourseId: 'genki-1',
      disableAiFallback: true,
    });

    const descriptor = builtinStoryToDescriptor(resolvedStory, 'genki-1');
    storyOccurrenceIndex.build([descriptor], { dictionaryStore });

    expect(storyOccurrenceIndex.isBuilt).toBe(true);
    const targetDictId = resolvedStory.content[0].tokens[0].dictionaryId || 'watashi';
    const occurrences = storyOccurrenceIndex.getOccurrences(targetDictId, dictionaryStore);
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences[0].storyId).toBe(builtinStoryId);
    expect(occurrences[0].surface).toBe('私');
    expect(occurrences[0].tokenId).toBe(resolvedStory.content[0].tokens[0].id);
  });

  it('2. matches indexed StoryOccurrence.tokenId with rendered data-token-id', async () => {
    const rawStory = {
      id: 3,
      storyId: 3,
      title: 'Числовая история',
      content: [
        {
          sentence_id: 1,
          translation: 'Тест токенов.',
          tokens: [
            {
              surface: '私',
              reading: 'わたし',
              dictionaryId: 'watashi',
              type: 'Word',
            },
          ],
        },
      ],
    };

    const builtinStoryId = 'genki-1:story:3';
    const { story: resolvedStory } = await resolveStoryTokens({
      story: rawStory,
      storyId: builtinStoryId,
      dictionaryStore,
      activeCourseId: 'genki-1',
      disableAiFallback: true,
    });

    const descriptor = builtinStoryToDescriptor(resolvedStory, 'genki-1');
    storyOccurrenceIndex.build([descriptor], { dictionaryStore });
    const targetDictId = resolvedStory.content[0].tokens[0].dictionaryId || 'watashi';
    const occurrences = storyOccurrenceIndex.getOccurrences(targetDictId, dictionaryStore);

    expect(occurrences.length).toBe(1);
    const indexedTokenId = occurrences[0].tokenId;

    await renderStoryContent(resolvedStory, mockState, {}, { storyId: builtinStoryId });
    const tokenEl = document.querySelector(`[data-token-id="${indexedTokenId}"]`);
    expect(tokenEl).not.toBeNull();
    expect(tokenEl.dataset.storyId).toBe(builtinStoryId);
  });

  it('3. handles numeric storyId in renderStoryRoute without TypeError', async () => {
    await expect(
      renderStoryRoute(mockState, {}, { storyId: 3, courseId: 'genki-1' })
    ).resolves.not.toThrow();
  });

  it('4. invalidates StoryOccurrenceIndex on course switch', () => {
    storyOccurrenceIndex.build([], { dictionaryStore });
    expect(storyOccurrenceIndex.isBuilt).toBe(true);

    storyOccurrenceIndex.invalidate();
    expect(storyOccurrenceIndex.isBuilt).toBe(false);
  });

  it('5. uses source course ID priority for story rendering and token resolution', async () => {
    const storyObj = {
      id: '5',
      courseId: 'genki-2',
      title: 'GENKI 2 Story',
      content: [
        {
          sentence_id: 1,
          tokens: [{ surface: '猫', reading: 'ねこ', type: 'Word' }],
        },
      ],
    };

    await renderStoryContent(storyObj, mockState, {}, { courseId: 'genki-2' });
    const storyBody = document.getElementById('story-body');
    expect(storyBody.innerHTML).toContain('data-story-id="genki-2:story:5"');
  });

  it('6. fresh AI story tokens include storyId, sentenceId, and form data attributes', async () => {
    const aiSentences = [
      {
        speaker: 'Мари',
        translation: 'Я тоже пойдём.',
        sentence_id: 101,
        tokens: [
          {
            id: 'tok-1',
            surface: '行く',
            reading: 'いく',
            dictionaryId: 'genki:v:iku',
            contextMeaning: 'идти',
            type: 'Word',
            resolution: { status: 'resolved' },
            form: {
              tense: 'past',
              politeness: 'polite',
              polarity: 'positive',
              conjugation: 'past-polite',
            },
          },
        ],
      },
    ];

    const mockNote = {
      id: 'ai-story-1',
      sourceStoryId: 'ai-story-1',
      title: 'AI Story Test',
      story: aiSentences,
    };
    mockState.savedNotes = [mockNote];

    await renderStoryRoute(mockState, {}, { storyId: 'ai-story-1' });
    const tokenEl = document.querySelector('[data-token-id="tok-1"]');
    expect(tokenEl).not.toBeNull();
    expect(tokenEl.getAttribute('data-story-id')).toBe('ai-story-1');
    expect(tokenEl.getAttribute('data-sentence-id')).toBe('101');
    expect(tokenEl.getAttribute('data-form-tense')).toBe('past');
    expect(tokenEl.getAttribute('data-form-politeness')).toBe('polite');
  });

  it('7. renderChapter accepts options and matches focusGrammarId', async () => {
    const chapterOptions = {
      courseId: 'genki-1',
      chapterId: 3,
      focusGrammarId: 'te-form',
    };

    await renderChapter(3, mockState, {}, {}, chapterOptions);

    const chapterBody = document.getElementById('chapter-body');
    expect(chapterBody.innerHTML.length).toBeGreaterThan(0);
    const grammarItems = document.querySelectorAll('[data-kind="grammar"]');
    expect(grammarItems.length).toBeGreaterThan(0);
  });

  it('8. ExamplesDB preserves both sourceLessonId and lessonRequired', () => {
    const db = new ExamplesDBClass();
    db.registerVocabulary([{ id: 'v1', dictionaryId: 'genki:v:taberu', lessonIds: ['1'] }]);
    db.addRawSentence({
      japanese: '食べる',
      reading: 'たべる',
      translation: 'есть',
      sourceLessonId: '3',
      targetLexemeIds: ['genki:v:taberu'],
    });

    db.rebuildIndex();
    expect(db.examples.length).toBe(1);
    expect(db.examples[0].sourceLessonId).toBe(canonicalLessonId('3'));
    expect(db.examples[0].lessonRequired).toBe(canonicalLessonId('3'));
  });

  it('9. story examples store storyId, sentenceId, and tokenId in ExamplesDB', () => {
    const db = new ExamplesDBClass();
    db.registerVocabulary([{ id: 'v1', dictionaryId: 'neko', lessonIds: ['1'] }]);
    db.registerStory({
      id: 3,
      courseId: 'genki-1',
      lessonId: 3,
      content: [
        {
          sentence_id: 12,
          translation: 'Кошка срёт',
          tokens: [
            {
              id: 'tok-neko',
              surface: '猫',
              dictionaryId: 'neko',
            },
          ],
        },
      ],
    });
    db.rebuildIndex();
    expect(db.examples.length).toBe(1);
    expect(db.examples[0].storyId).toBe('genki-1:story:3');
    expect(db.examples[0].sentenceId).toBe(12);
    expect(db.examples[0].tokenId).toBe('tok-neko');
  });

  it('10. bottom sheet hides open page button for unresolved or ambiguous tokens', async () => {
    const { openWordBottomSheet } = await import('../ui/stories.js');

    const tokenSpan = document.createElement('span');
    tokenSpan.className = 'word-token';
    tokenSpan.setAttribute('data-dictionary-id', 'genki:v:ambiguous');
    tokenSpan.setAttribute('data-resolution-status', 'ambiguous');
    tokenSpan.setAttribute('data-surface', ' ambiguous');

    openWordBottomSheet(tokenSpan);

    const openPageBtn = document.getElementById('btn-open-word-page');
    expect(openPageBtn.hidden).toBe(true);
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';
import { getDictionaryDetails } from '../src/dictionary/dictionary-details-service.js';
import { dictionaryRelationsIndex } from '../src/dictionary/dictionary-relations-index.js';
import {
  storyOccurrenceIndex,
  savedNotesToStoryDescriptors,
} from '../src/dictionary/story-occurrence-index.js';
import { openWordBottomSheet, renderStoryRoute, closeWordBottomSheet } from '../ui/stories.js';
import { renderWordDetails } from '../ui/word-details.js';
import { ExamplesDB } from '../src/examples-db.js';
import { Router } from '../router.js';

const taberuEntry = normalizeDictionaryEntry({
  id: 'jp-word:食べる:たべる',
  dictionaryForm: '食べる',
  reading: 'たべる',
  meanings: ['есть', 'кушать'],
  partOfSpeech: 'verb',
  verbClass: 'ichidan',
  source: 'curated',
  confidence: 1.0,
});

function createTestStore() {
  return new DictionaryStore({
    loader: {
      async load() {
        return {
          manifest: { schemaVersion: 1, contentVersion: '1' },
          entries: [taberuEntry],
          tokenIndex: { 食べる: [taberuEntry.id], 食べました: [taberuEntry.id] },
          aliases: {},
        };
      },
    },
    userRepository: null,
  });
}

function setupDOM() {
  document.body.innerHTML = `
    <div id="screen-home" class="screen hidden"></div>
    <div id="screen-word-details" class="screen hidden">
      <div id="word-details-body"></div>
    </div>
    <div id="screen-story" class="screen hidden">
      <h2 id="story-title"></h2>
      <h3 id="story-title-jp"></h3>
      <div id="story-body"></div>
    </div>

    <!-- WORD BOTTOM SHEET -->
    <div id="word-bottom-sheet" class="bottom-sheet" role="dialog" aria-modal="true">
      <div class="bottom-sheet-backdrop"></div>
      <div class="bottom-sheet-content">
        <div class="bottom-sheet-body">
          <div class="bottom-sheet-token-section">
            <h2 id="modal-token-surface" class="word-kanji" lang="ja"></h2>
            <h2 id="modal-kanji" class="word-kanji hidden" lang="ja"></h2>
            <span id="modal-type" class="word-type-badge"></span>
            <p id="modal-token-reading" class="word-reading" lang="ja"></p>
            <p id="modal-context-meaning" class="word-translation"></p>
          </div>
          <div id="modal-dictionary-section" class="bottom-sheet-dict-section">
            <h3 id="modal-dictionary-form" class="word-dict-form" lang="ja"></h3>
            <p id="modal-dictionary-reading" class="word-dict-reading" lang="ja"></p>
            <p id="modal-reading" class="word-reading hidden" lang="ja"></p>
            <p id="modal-dictionary-meanings" class="word-dict-meanings"></p>
            <p id="modal-translation" class="word-translation hidden"></p>
          </div>
          <p id="modal-source" class="word-source-badge" aria-live="polite"></p>
          <button id="btn-open-word-page" class="btn-ghost word-open-page-btn" hidden>
            📖 Открыть страницу слова →
          </button>
        </div>
      </div>
    </div>
  `;
}

describe('Word Details UI Production Integration (Issue #32)', () => {
  let store;
  let router;

  beforeEach(async () => {
    setupDOM();
    store = createTestStore();
    await store.ensureLoaded();
    dictionaryRelationsIndex.invalidate();
    storyOccurrenceIndex.invalidate();
    ExamplesDB.clear();

    router = new Router();
    router.registerRenderHandler('word-details', (opt, ctx) =>
      renderWordDetails({}, { nav: (s, o) => router.navigate(s, o), SRS: null }, opt, ctx)
    );
  });

  it('1. Compact bottom sheet simultaneously displays token occurrence and dictionary entry, then opens word details', async () => {
    const tokenElem = document.createElement('span');
    tokenElem.dataset.tokenId = 'story-1:sent-1:tok-1';
    tokenElem.dataset.dictionaryId = 'jp-word:食べる:たべる';
    tokenElem.dataset.surface = '食べました';
    tokenElem.dataset.reading = 'たべました';
    tokenElem.dataset.contextMeaning = 'поел';
    tokenElem.dataset.resolutionStatus = 'resolved';
    tokenElem.dataset.formTense = 'past';
    tokenElem.dataset.formPoliteness = 'polite';
    tokenElem.dataset.formPolarity = 'affirmative';

    document.body.appendChild(tokenElem);

    let navigatedRoute = null;
    let navigatedOptions = null;
    window.nav = (r, o) => {
      navigatedRoute = r;
      navigatedOptions = o;
    };

    openWordBottomSheet(tokenElem, store);

    expect(document.getElementById('modal-token-surface').textContent).toBe('食べました');
    expect(document.getElementById('modal-token-reading').textContent).toBe('たべました');
    expect(document.getElementById('modal-context-meaning').textContent).toBe('поел');

    expect(document.getElementById('modal-dictionary-form').textContent).toBe('食べる');
    expect(document.getElementById('modal-dictionary-meanings').textContent).toContain('есть');

    const openBtn = document.getElementById('btn-open-word-page');
    expect(openBtn.hidden).toBe(false);

    openBtn.click();

    expect(navigatedRoute).toBe('word-details');
    expect(navigatedOptions.dictionaryId).toBe('jp-word:食べる:たべる');
    expect(navigatedOptions.surface).toBe('食べました');
    expect(navigatedOptions.contextMeaning).toBe('поел');
    expect(navigatedOptions.form.tense).toBe('past');
  });

  it('2. Production ExamplesDB integration displays example with correct source badge', async () => {
    ExamplesDB.registerVocabulary([
      { id: 'jp-word:食べる:たべる', dictionaryId: 'jp-word:食べる:たべる' },
    ]);
    ExamplesDB.addRawSentence({
      japanese: 'ご飯を食べる。',
      reading: 'ごはんをたべる。',
      translation: 'Есть рис.',
      source: 'curated',
      targetLexemeIds: ['jp-word:食べる:たべる'],
    });
    ExamplesDB.rebuildIndex();

    dictionaryRelationsIndex.buildExampleIndex(ExamplesDB, store);

    const details = getDictionaryDetails({
      dictionaryId: 'jp-word:食べる:たべる',
      state: {},
      dictionaryStore: store,
      relationsIndex: dictionaryRelationsIndex,
    });

    expect(details.examples.length).toBe(1);
    expect(details.examples[0].sentence).toBe('ご飯を食べる。');
    expect(details.examples[0].source).toBe('curated');
  });

  it('3. FSRS summary reads production state.srs and does NOT mutate state', async () => {
    const srsState = {
      srs: {
        'card:jp-word:食べる:たべる:recognition': {
          id: 'jp-word:食べる:たべる',
          itemId: 'jp-word:食べる:たべる',
          skill: 'recognition',
          due: Date.now() + 86400000,
          reps: 5,
          lapses: 1,
          stability: 3.2,
          difficulty: 5.1,
        },
      },
    };

    const initialSnapshot = JSON.stringify(srsState);

    const details = getDictionaryDetails({
      dictionaryId: 'jp-word:食べる:たべる',
      state: srsState,
      dictionaryStore: store,
      srs: { getRetrievability: () => 0.9 },
    });

    expect(details.fsrs).not.toBeNull();
    expect(details.fsrs.hasFSRS).toBe(true);
    expect(details.fsrs.reps).toBe(5);
    expect(details.fsrs.lapses).toBe(1);

    // Verify zero state mutation
    expect(JSON.stringify(srsState)).toBe(initialSnapshot);
  });

  it('4. Story navigation opens story route, scrolls sentence and highlights token', async () => {
    const mockStoryNote = {
      id: 'ai-story-101',
      title: 'Ужин Танаки',
      story: [
        {
          sentence_id: 'sent-1',
          translation: 'Танака поел.',
          tokens: [
            {
              id: 'tok-target-1',
              surface: '食べました',
              reading: 'たべました',
              dictionaryId: 'jp-word:食べる:たべる',
              resolution: { status: 'resolved' },
            },
          ],
        },
      ],
    };

    const state = { savedNotes: [mockStoryNote] };
    let navigatedRoute = null;
    let navigatedOpt = null;

    const nav = (r, o) => {
      navigatedRoute = r;
      navigatedOpt = o;
    };

    await renderStoryRoute(
      state,
      { nav },
      { storyId: 'ai-story-101', sentenceId: 'sent-1', tokenId: 'tok-target-1' }
    );

    expect(navigatedRoute).toBeNull();
    expect(navigatedOpt).toBeNull();

    const sentenceEl = document.querySelector('.story-sentence[data-sentence-id="sent-1"]');
    expect(sentenceEl).not.toBeNull();

    const tokenEl = document.querySelector('.word-token[data-token-id="tok-target-1"]');
    expect(tokenEl).not.toBeNull();
    expect(tokenEl.classList.contains('word-token-highlighted')).toBe(true);
  });

  it('5. Invalidation flow updates occurrences when AI story is saved or deleted', async () => {
    const aiStoryNote = {
      id: 'ai-note-1',
      title: 'В ресторане',
      story: [
        {
          sentence_id: 1,
          translation: 'Я поел.',
          tokens: [
            {
              id: 'tok-1',
              surface: '食べた',
              dictionaryId: 'jp-word:食べる:たべる',
              resolution: { status: 'resolved' },
            },
          ],
        },
      ],
    };

    // Initially no saved notes
    let descriptors = savedNotesToStoryDescriptors([]);
    storyOccurrenceIndex.build(descriptors, { dictionaryStore: store });
    expect(storyOccurrenceIndex.getOccurrences('jp-word:食べる:たべる', store).length).toBe(0);

    // Save note and rebuild/ensureBuilt
    descriptors = savedNotesToStoryDescriptors([aiStoryNote]);
    storyOccurrenceIndex.build(descriptors, { dictionaryStore: store });
    expect(storyOccurrenceIndex.getOccurrences('jp-word:食べる:たべる', store).length).toBe(1);

    // Delete note
    storyOccurrenceIndex.build([], { dictionaryStore: store });
    expect(storyOccurrenceIndex.getOccurrences('jp-word:食べる:たべる', store).length).toBe(0);
  });

  it('6. Central DictionaryEntry update is reflected across UIs while contextMeaning stays preserved', async () => {
    const tokenElem = document.createElement('span');
    tokenElem.dataset.tokenId = 'story-1:s-1:t-1';
    tokenElem.dataset.dictionaryId = 'jp-word:食べる:たべる';
    tokenElem.dataset.surface = '食べました';
    tokenElem.dataset.contextMeaning = 'поел';
    tokenElem.dataset.resolutionStatus = 'resolved';

    openWordBottomSheet(tokenElem, store);
    expect(document.getElementById('modal-dictionary-meanings').textContent).toBe('есть, кушать');
    expect(document.getElementById('modal-context-meaning').textContent).toBe('поел');
    closeWordBottomSheet();

    // Update central DictionaryEntry in store
    const updatedEntry = normalizeDictionaryEntry({
      id: 'jp-word:食べる:たべる',
      dictionaryForm: '食べる',
      reading: 'たべる',
      meanings: ['принимать пищу', 'питаться'],
      partOfSpeech: 'verb',
      verbClass: 'ichidan',
      source: 'curated',
    });
    store.builtinEntries.set(updatedEntry.id, updatedEntry);

    // Re-open bottom sheet
    openWordBottomSheet(tokenElem, store);
    expect(document.getElementById('modal-dictionary-meanings').textContent).toBe(
      'принимать пищу, питаться'
    );
    expect(document.getElementById('modal-context-meaning').textContent).toBe('поел');
  });
});

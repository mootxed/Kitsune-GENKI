/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { openWordBottomSheet } from '../ui/stories.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';
import { normalizeDictionaryEntry } from '../src/dictionary/dictionary-contract.js';

const catEntry = normalizeDictionaryEntry({
  id: 'jp-word:猫:ねこ',
  dictionaryForm: '猫',
  reading: 'ねこ',
  meanings: ['кошка'],
  partOfSpeech: 'noun',
  tokenForms: ['猫', 'ねこ'],
});

function createMockStore() {
  const store = new DictionaryStore({
    loader: {
      async load() {
        return {
          manifest: { schemaVersion: 1, contentVersion: '1' },
          entries: [catEntry],
          tokenIndex: { 猫: [catEntry.id] },
          aliases: {},
        };
      },
    },
    userRepository: null,
  });
  return store;
}

describe('Story Token UI Integration & Bottom Sheet', () => {
  it('opens word bottom sheet using dictionaryId and populates modal fields from DictionaryStore', async () => {
    document.body.innerHTML = `
      <div id="word-bottom-sheet" class="bottom-sheet">
        <div class="bottom-sheet-backdrop"></div>
        <div class="bottom-sheet-content">
          <h2 id="modal-kanji"></h2>
          <span id="modal-type"></span>
          <p id="modal-reading"></p>
          <p id="modal-translation"></p>
        </div>
      </div>
      <span id="token-elem"
            data-token-id="story-1:s-1:t-1"
            data-dictionary-id="jp-word:猫:ねこ"
            data-surface="猫"
            data-reading="ねこ"
            data-context-meaning="кошка"
            data-resolution-status="resolved">猫</span>
    `;

    const store = createMockStore();
    await store.ensureLoaded();

    const tokenElem = document.getElementById('token-elem');
    openWordBottomSheet(tokenElem, store);

    const modalKanji = document.getElementById('modal-kanji');
    const modalReading = document.getElementById('modal-reading');
    const modalTranslation = document.getElementById('modal-translation');
    const modalType = document.getElementById('modal-type');
    const sheet = document.getElementById('word-bottom-sheet');

    expect(sheet.classList.contains('active')).toBe(true);
    expect(modalKanji.textContent).toBe('猫');
    expect(modalReading.textContent).toBe('ねこ');
    expect(modalTranslation.textContent).toBe('кошка');
    expect(modalType.textContent).toContain('noun');
  });

  it('handles missing dictionaryId gracefully without crashing', async () => {
    document.body.innerHTML = `
      <div id="word-bottom-sheet" class="bottom-sheet">
        <div class="bottom-sheet-backdrop"></div>
        <div class="bottom-sheet-content">
          <h2 id="modal-kanji"></h2>
          <span id="modal-type"></span>
          <p id="modal-reading"></p>
          <p id="modal-translation"></p>
        </div>
      </div>
      <span id="token-elem"
            data-surface="未知"
            data-reading="みち"
            data-context-meaning="неизвестно"
            data-resolution-status="missing">未知</span>
    `;

    const store = createMockStore();
    await store.ensureLoaded();

    const tokenElem = document.getElementById('token-elem');
    openWordBottomSheet(tokenElem, store);

    const modalKanji = document.getElementById('modal-kanji');
    const modalTranslation = document.getElementById('modal-translation');

    expect(modalKanji.textContent).toBe('未知');
    expect(modalTranslation.textContent).toBe('неизвестно');
  });
});

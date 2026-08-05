/* ui/word-bottom-sheet.js — Lightweight bottom sheet modal handler for word tokens */

import { $ } from '../src/utils.js';
import { dictionaryStore } from '../src/dictionary/dictionary-store.js';

let bottomSheetReturnFocus = null;

function _posLabel(pos) {
  const labels = {
    noun: 'Существительное',
    verb: 'Глагол',
    adjective: 'Прилагательное',
    adverb: 'Наречие',
    particle: 'Частица',
    expression: 'Выражение',
  };
  return labels[pos] || pos || 'Слово';
}

export function openWordBottomSheet(tokenElement, customStore = null) {
  const sheet = $('#word-bottom-sheet');
  if (!sheet) return;

  bottomSheetReturnFocus = tokenElement || document.activeElement;

  const dataset = tokenElement.dataset || {};
  const surface = dataset.surface || dataset.kanji || '';
  const reading = dataset.reading || dataset.writing || surface;
  const contextMeaning = dataset.contextMeaning || dataset.translation || '';
  const dictionaryId = dataset.dictionaryId || null;
  const resolutionStatus = dataset.resolutionStatus || 'resolved';

  const modalTokenSurface = $('#modal-token-surface');
  const modalTokenReading = $('#modal-token-reading');
  const modalContextMeaning = $('#modal-context-meaning');
  const modalDictForm = $('#modal-dictionary-form');
  const modalDictReading = $('#modal-dictionary-reading');
  const modalDictMeanings = $('#modal-dictionary-meanings');

  const modalKanji = $('#modal-kanji');
  const modalReading = $('#modal-reading');
  const modalTranslation = $('#modal-translation');
  const modalType = $('#modal-type');
  const modalSource = $('#modal-source');
  const openPageBtn = $('#btn-open-word-page');

  let entry = null;
  const activeStore =
    customStore ||
    dictionaryStore ||
    (typeof window !== 'undefined' ? window.dictionaryStore : null);
  if (dictionaryId && activeStore && typeof activeStore.getDictionaryEntry === 'function') {
    entry = activeStore.getDictionaryEntry(dictionaryId);
  }

  // Token occurrence details
  if (modalTokenSurface) modalTokenSurface.textContent = surface;
  if (modalTokenReading) modalTokenReading.textContent = reading !== surface ? reading : '';
  if (modalContextMeaning) modalContextMeaning.textContent = contextMeaning;

  // Dictionary entry details
  if (modalDictForm) {
    if (entry) {
      modalDictForm.textContent = entry.dictionaryForm;
    } else if (resolutionStatus === 'missing' || resolutionStatus === 'dangling') {
      modalDictForm.textContent = 'Словарная запись не найдена';
    } else if (resolutionStatus === 'ambiguous') {
      modalDictForm.textContent = 'Не удалось однозначно определить словарную запись';
    } else {
      modalDictForm.textContent = '';
    }
  }

  if (modalDictReading)
    modalDictReading.textContent =
      entry?.reading && entry.reading !== entry.dictionaryForm ? entry.reading : '';
  if (modalDictMeanings)
    modalDictMeanings.textContent = entry?.meanings ? entry.meanings.join(', ') : '';

  // Legacy elements support
  if (modalKanji) modalKanji.textContent = entry?.dictionaryForm || surface;
  if (modalReading) {
    const displayReading =
      reading !== surface ? reading : entry?.reading !== surface ? entry?.reading : '';
    modalReading.textContent = displayReading || '';
  }

  if (modalTranslation) {
    const globalMeanings = entry?.meanings ? entry.meanings.join(', ') : '';
    if (resolutionStatus === 'non-lexical') {
      modalTranslation.textContent = 'Служебный элемент';
    } else if (resolutionStatus === 'missing') {
      modalTranslation.textContent = 'Слово не найдено в словаре';
    } else if (resolutionStatus === 'ambiguous') {
      modalTranslation.textContent = contextMeaning || globalMeanings || 'Неоднозначное слово';
    } else if (contextMeaning && globalMeanings && contextMeaning !== globalMeanings) {
      modalTranslation.textContent = `${contextMeaning} (Значения: ${globalMeanings})`;
    } else {
      modalTranslation.textContent =
        contextMeaning || globalMeanings || 'Слово не найдено в словаре';
    }
  }

  if (modalType) {
    const srcTag =
      entry?.source === 'ai' ? ' [AI]' : entry?.source === 'curated' ? ' [Словарь]' : '';
    modalType.textContent =
      (entry?.partOfSpeech ? _posLabel(entry.partOfSpeech) : dataset.type || 'Слово') + srcTag;
  }

  if (modalSource) {
    if (entry?.source === 'curated') {
      modalSource.textContent = '✓ Проверенная запись KotoKitsu';
      modalSource.className = 'word-source-badge word-source-badge--curated';
    } else if (entry?.source === 'ai') {
      const confStr =
        typeof entry.confidence === 'number' ? ` (${Math.round(entry.confidence * 100)}%)` : '';
      modalSource.textContent = `🤖 Создано AI${confStr}${entry.verified ? ' · Проверено' : ''}`;
      modalSource.className = 'word-source-badge word-source-badge--ai';
    } else {
      modalSource.textContent = '';
      modalSource.className = 'word-source-badge';
    }
  }

  if (openPageBtn) {
    const canOpen = dictionaryId && entry && resolutionStatus === 'resolved';
    openPageBtn.hidden = !canOpen;
    if (canOpen) {
      openPageBtn.onclick = () => {
        closeWordBottomSheet();
        const navFn = typeof window !== 'undefined' ? window.nav : null;
        if (typeof navFn === 'function') {
          navFn('word-details', {
            dictionaryId,
            surface,
            reading: reading !== surface ? reading : null,
            contextMeaning,
            tokenId: dataset.tokenId || null,
            storyId: dataset.storyId || null,
            sentenceId: dataset.sentenceId || null,
            form: {
              tense: dataset.formTense || null,
              politeness: dataset.formPoliteness || null,
              polarity: dataset.formPolarity || null,
              conjugation: dataset.formConjugation || null,
            },
          });
        }
      };
    }
  }

  sheet.classList.add('active');

  const backdrop = sheet.querySelector('.bottom-sheet-backdrop');
  if (backdrop) {
    backdrop.onclick = () => closeWordBottomSheet();
  }

  const firstFocusable = sheet.querySelector('button:not([hidden]), [tabindex="0"]');
  if (firstFocusable) {
    requestAnimationFrame(() => firstFocusable.focus());
  }
}

export function closeWordBottomSheet() {
  const sheet = $('#word-bottom-sheet');
  if (sheet) sheet.classList.remove('active');

  if (bottomSheetReturnFocus && typeof bottomSheetReturnFocus.focus === 'function') {
    try {
      bottomSheetReturnFocus.focus();
    } catch {
      // ignore
    }
    bottomSheetReturnFocus = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const sheet = document.getElementById('word-bottom-sheet');
      if (sheet && sheet.classList.contains('active')) {
        closeWordBottomSheet();
      }
    }
  });
}

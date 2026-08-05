/**
 * example-generator.js — Детерминированный генератор и ранжирование контекстных примеров
 * для словаря и FSRS KotoKitsu.
 *
 * Приоритет источников:
 *   1. Явный curated-пример для лексемы (curated-word, curated)
 *   2. Пример из истории урока (story)
 *   3. Проверенный contextProduction
 *   4. Примеры из грамматики и заметок (particles, note)
 *   5. Остальные проверенные совпадения
 *
 * Ограничение: максимум 12 лучших кандидатов.
 */

import { conjugateVerb } from './verb-conjugator.js';
import { ExamplesDB } from './examples-db.js';

// ---------------------------------------------------------------------------
// Публичные константы
// ---------------------------------------------------------------------------

export const EXAMPLE_SOURCES = Object.freeze({
  CORPUS: 'corpus',
  TEMPLATE: 'template',
  CURATED_WORD: 'curated-word',
  STORY: 'story',
  CONTEXT_PRODUCTION: 'contextProduction',
  PARTICLES: 'particles',
  NOTE: 'note',
});

/**
 * Получить следующий seed (для обратной совместимости)
 */
export function nextSeed(seed) {
  const A = 1664525;
  const C = 1013904223;
  return (A * (seed >>> 0 || 1) + C) >>> 0;
}

// ---------------------------------------------------------------------------
// Подсветка слова
// ---------------------------------------------------------------------------

/**
 * Обернуть первое вхождение изучаемого слова (кандзи или кана) в <mark>.
 * @param {string} sentence
 * @param {object} word
 * @returns {string}
 */
export function highlightWord(sentence, word) {
  if (!sentence || !word) return sentence || '';

  let result = sentence;
  const variants = [];
  if (word.kanji && word.kanji !== '～') variants.push(word.kanji);
  if (word.writing && word.writing !== '～' && !variants.includes(word.writing))
    variants.push(word.writing);

  // Добавить спряжённые формы глагола
  if (word.partOfSpeech === 'verb') {
    try {
      const forms = conjugateVerb(word);
      for (const f of forms) {
        if (!f) continue;
        if (f.kanji && !variants.includes(f.kanji)) variants.push(f.kanji);
        if (f.kana && !variants.includes(f.kana)) variants.push(f.kana);
      }
    } catch {
      // ignore
    }
  }

  // Сортировать от длинных к коротким
  variants.sort((a, b) => b.length - a.length);

  for (const v of variants) {
    if (!v) continue;
    const idx = result.indexOf(v);
    if (idx !== -1) {
      result =
        result.slice(0, idx) +
        `<mark class="ex-highlight">${v}</mark>` +
        result.slice(idx + v.length);
      break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Получить стабильный дедуплицированный список кандидатов-примеров для слова.
 *
 * @param {object} word
 * @param {object} [options]
 * @param {number} [options.userMaxLesson=12]
 * @returns {Array} Список кандидатов (макс. 12)
 */
export function getExampleCandidates(word, { userMaxLesson = 12 } = {}) {
  if (!word || (!word.writing && !word.kanji)) return [];

  const lexemeId = word.lexemeId || word.id;
  if (!lexemeId) return [];

  const rawExamples = ExamplesDB.getExamplesForLexeme(lexemeId, userMaxLesson);
  if (!rawExamples || rawExamples.length === 0) return [];

  const sourceRank = (src) => {
    switch (src) {
      case 'curated-word':
      case 'curated':
        return 1;
      case 'story':
        return 2;
      case 'contextProduction':
        return 3;
      case 'particles':
      case 'note':
      case 'lesson-note':
        return 4;
      default:
        return 5;
    }
  };

  const sorted = [...rawExamples].sort((a, b) => {
    const rA = sourceRank(a.source);
    const rB = sourceRank(b.source);
    if (rA !== rB) return rA - rB;

    const lA = a.lessonRequired || 1;
    const lB = b.lessonRequired || 1;
    if (lA !== lB) return lA - lB;

    const lenA = (a.japanese || '').length;
    const lenB = (b.japanese || '').length;
    if (lenA !== lenB) return lenA - lenB;

    return (a.japanese || '').localeCompare(b.japanese || '');
  });

  const candidates = [];
  const seenJapanese = new Set();

  const normalizeSentence = (str) => {
    if (!str) return '';
    return str.normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '');
  };

  for (const ex of sorted) {
    if (!ex || !ex.japanese) continue;
    const norm = normalizeSentence(ex.japanese);
    if (seenJapanese.has(norm)) continue;
    seenJapanese.add(norm);

    candidates.push({
      japanese: ex.japanese,
      japaneseHighlighted: highlightWord(ex.japanese, word),
      reading: ex.reading || '',
      translation: ex.translation || '',
      source: ex.source || EXAMPLE_SOURCES.CORPUS,
      lessonRequired: ex.lessonRequired || 1,
      grammar: ex.grammarIds ? { particles: ex.grammarIds } : ex.grammar || null,
    });

    if (candidates.length >= 12) break;
  }

  return candidates;
}

/**
 * Вспомогательная функция детерминированного выбора примера по индексу.
 */
export function generateExample(word, { exampleIndex = 0, userMaxLesson = 12 } = {}) {
  const candidates = getExampleCandidates(word, { userMaxLesson });
  if (candidates.length === 0) return null;
  const idx = exampleIndex % candidates.length;
  return candidates[idx >= 0 ? idx : 0];
}

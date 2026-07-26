// ui/flashcards/mode-selector.js - Определение и выбор режимов карточек SRS

import { SRS } from '../../srs.js';
import {
  MAX_TYPING_UNIQUE_CHARS,
  katakanaToHiragana,
  normalizeKanaAnswer,
  typingCapability,
} from '../../src/typing-capability.js';
import { productionContext } from '../../src/production-context.js';

// Типы режимов карточек
export const CARD_MODES = {
  DRAWING: 'drawing',
  TYPING: 'typing',
  MULTIPLE_CHOICE: 'multiple-choice',
  REVERSE_MULTIPLE_CHOICE: 'reverse-multiple-choice',
  CONTEXT_SENTENCE: 'context-sentence',
  CONTEXT_PRODUCTION: 'context-production',
  PARTICLE_QUIZ: 'particle-quiz',
  SENTENCE_BUILDING: 'sentence-building',
};

export function isDebugSkipEnabled(env = import.meta.env) {
  return env?.DEV === true;
}

// Короткая форма перевода: первая часть до пояснения в скобках/после ';'
export function shortT(word) {
  const t = (word && word.translation) || '';
  return t.split(/[(;]/)[0].trim();
}

// Вспомогательная функция перемешивания массива
export function shuffleArray(array, random = Math.random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function normalizeChoiceLabel(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

export function canonicalLexeme(word) {
  const japanese = katakanaToHiragana(word?.writing || word?.kanji || '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .trim();
  if (japanese) return `surface:${japanese}`;
  if (word?.lexemeId) return `id:${word.lexemeId}`;
  return `label:${normalizeChoiceLabel(shortT(word))}`;
}

export function buildMultipleChoiceOptions(
  word,
  allWords,
  optionLabel,
  { isEligible = () => true, random = Math.random } = {}
) {
  const correctLabel = normalizeChoiceLabel(optionLabel(word));
  const correctLexeme = canonicalLexeme(word);
  const usedLabels = new Set([correctLabel]);
  const usedLexemes = new Set([correctLexeme]);
  const distractors = [];
  const candidates = [
    ...(allWords || []).filter((candidate) => candidate.category === word.category),
    ...(allWords || []).filter((candidate) => candidate.category !== word.category),
  ];

  for (const candidate of shuffleArray(candidates, random)) {
    if (candidate.id === word.id || !isEligible(candidate)) continue;
    const label = normalizeChoiceLabel(optionLabel(candidate));
    const lexeme = canonicalLexeme(candidate);
    if (!label || usedLabels.has(label) || usedLexemes.has(lexeme)) continue;
    distractors.push(candidate);
    usedLabels.add(label);
    usedLexemes.add(lexeme);
    if (distractors.length === 3) break;
  }

  return shuffleArray([word, ...distractors], random);
}

// Проверяет, содержит ли строка хотя бы один настоящий кандзи (CJK иероглиф)
export function hasKanjiChars(text) {
  return getAllKanji(text).length > 0;
}

// Очищает строку ответа от служебных символов (~, ～, пробелы, пунктуация, скобки),
// оставляя только символы, доступные на виртуальной клавиатуре (кана)
export function cleanKanaString(text) {
  return normalizeKanaAnswer(text);
}

export { MAX_TYPING_UNIQUE_CHARS };

// Проверяет, допустимо ли слово для режима ввода с клавиатуры:
// - после очистки должен остаться хотя бы один символ каны
// - уникальных символов каны должно быть не больше MAX_TYPING_UNIQUE_CHARS
export function isWordTypingEligible(word) {
  return typingCapability(word).canType;
}

export function weightedRandom(weights, random = Math.random) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return CARD_MODES.MULTIPLE_CHOICE;

  let cursor = random() * total;
  for (const [mode, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return mode;
  }
  return entries.at(-1)[0];
}

export function getAdaptiveModeWeights(card, word) {
  const hasKanji = hasKanjiChars(word.kanji || word.writing);
  const canType = isWordTypingEligible(word);
  const isNewOrEarly = card?.state === SRS.State.New || (card?.reps ?? 0) <= 2;
  const isMature = !isNewOrEarly && (card?.stability ?? 0) >= 7;

  const weights = isNewOrEarly
    ? { multipleChoice: 0.7, typing: hasKanji ? 0.2 : 0.3, drawing: hasKanji ? 0.1 : 0 }
    : isMature
      ? { multipleChoice: 0.2, typing: hasKanji ? 0.3 : 0.8, drawing: hasKanji ? 0.5 : 0 }
      : { multipleChoice: 0.4, typing: hasKanji ? 0.3 : 0.6, drawing: hasKanji ? 0.3 : 0 };

  if (!canType) weights.typing = 0;
  return weights;
}

export function hasWordContext(word) {
  return Boolean(generateWordContext(word));
}

export function selectRecognitionMode(word, random) {
  const weights = hasWordContext(word)
    ? {
        [CARD_MODES.CONTEXT_SENTENCE]: 0.25,
        [CARD_MODES.REVERSE_MULTIPLE_CHOICE]: 0.3,
        [CARD_MODES.MULTIPLE_CHOICE]: 0.45,
      }
    : {
        [CARD_MODES.REVERSE_MULTIPLE_CHOICE]: 0.3,
        [CARD_MODES.MULTIPLE_CHOICE]: 0.7,
      };
  return weightedRandom(weights, random);
}

// Выбирает сложность упражнения по зрелости карточки: recognition → recall → production.
export function selectMode(card, word, random = Math.random) {
  const weights = getAdaptiveModeWeights(card, word);
  const baseMode = weightedRandom(weights, random);

  if (baseMode === 'multipleChoice') return selectRecognitionMode(word, random);
  if (baseMode === 'typing') return CARD_MODES.TYPING;
  if (baseMode === 'drawing') return CARD_MODES.DRAWING;
  return CARD_MODES.MULTIPLE_CHOICE;
}

// Функция определения режима карточки
export function determineCardMode(card, word) {
  return selectMode(card, word);
}

// Контекст существует только при наличии валидного структурированного задания.
export function generateWordContext(word) {
  return productionContext(word);
}

// Функция проверки, является ли строка одиночным кандзи
export function isSingleKanji(text) {
  if (!text || text.length === 0) return false;
  const code = text.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df)
  );
}

// Функция извлекает первый кандзи из текста
export function getFirstKanji(text) {
  if (!text) return null;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      return text[i];
    }
  }
  return null;
}

// Функция извлечения всех кандзи из строки
export function getAllKanji(text) {
  if (!text) return [];
  const kanji = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      kanji.push(text[i]);
    }
  }
  return kanji;
}

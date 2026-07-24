/**
 * example-generator.js — Гибридный детерминированный генератор контекстных предложений
 * для словаря и FSRS Kitsune-GENKI.
 *
 * Приоритет источников:
 *   1. Кураторский пример из корпуса (ExamplesDB)
 *   2. Проверенный шаблон с семантически совместимыми словами
 *   3. null — пустое состояние, если безопасного варианта нет
 *
 * Детерминированность: один seed → один результат. Перерисовка UI не меняет предложение.
 * Просмотр примера не записывает production evidence и не меняет mastery.
 */

import { conjugateVerb } from './verb-conjugator.js';
import { ExamplesDB } from './examples-db.js';

// ---------------------------------------------------------------------------
// Публичные константы
// ---------------------------------------------------------------------------

export const EXAMPLE_SOURCES = Object.freeze({
  CORPUS: 'corpus',
  TEMPLATE: 'template',
});

// ---------------------------------------------------------------------------
// Детерминированный генератор псевдослучайных чисел (LCG)
// ---------------------------------------------------------------------------

/**
 * Простой линейный конгруэнтный генератор (LCG).
 * Один seed → одна последовательность. Не криптографический.
 */
function makeLCG(seed) {
  const A = 1664525;
  const C = 1013904223;
  let state = seed >>> 0 || 1;
  return {
    next() {
      state = (A * state + C) >>> 0;
      return state / 4294967296;
    },
  };
}

/**
 * Получить следующий seed для LCG (для совместимости с тестами).
 * @param {number} seed - Текущий seed
 * @returns {number} Следующий seed
 */
export function nextSeed(seed) {
  const A = 1664525;
  const C = 1013904223;
  return (A * (seed >>> 0 || 1) + C) >>> 0;
}

// ---------------------------------------------------------------------------
// Семантические правила совместимости
// ---------------------------------------------------------------------------

const CATEGORY_TO_SEMANTIC = {
  food: ['food', 'drink'],
  drink: ['drink', 'food'],
  things: ['object'],
  objects: ['object'],
  places: ['place'],
  location_words: ['place'],
  people: ['person', 'animate'],
  person: ['person', 'animate'],
  occupation: ['person', 'animate'],
  family: ['person', 'animate'],
  time: ['time'],
  verbs_u: ['verb'],
  'u-verbs': ['verb'],
  verbs_ru: ['verb'],
  'ru-verbs': ['verb'],
  verbs_irr: ['verb'],
  'irregular-verbs': ['verb'],
  'i-adjectives': ['adjective', 'quality'],
  'na-adjectives': ['adjective', 'quality'],
  adjectives: ['adjective', 'quality'],
  entertainment: ['object', 'entertainment'],
  activities: ['activity'],
  nouns: ['object'],
  countries: ['place', 'country'],
};

function getSemanticTags(word) {
  if (!word) return [];
  const explicit = Array.isArray(word.semanticTags) ? word.semanticTags : [];
  const fromCat = CATEGORY_TO_SEMANTIC[(word.category || '').toLowerCase()] || [];
  const posTag = word.partOfSpeech ? [word.partOfSpeech] : [];
  return [...new Set([...explicit, ...fromCat, ...posTag])];
}

function hasSomeTag(wordTags, requiredTags) {
  if (!requiredTags || requiredTags.length === 0) return true;
  return requiredTags.some((t) => wordTags.includes(t));
}

/**
 * Проверить семантическую совместимость пары (изучаемое слово, компаньон).
 */
export function isSemanticallySafe(word, companion, template) {
  if (!word || !companion) return false;
  if (word.id === companion.id) return false;

  const wordTags = getSemanticTags(word);
  const companionTags = getSemanticTags(companion);

  if (!hasSomeTag(wordTags, template.targetTags)) return false;

  if (template.companionTags && template.companionTags.length > 0) {
    if (!hasSomeTag(companionTags, template.companionTags)) return false;
  }

  if (template.companionTransitivity === 'transitive') {
    if (companion.transitivity && companion.transitivity !== 'transitive') return false;
  }

  if (word.writing === companion.writing) return false;

  if (template.role === 'object' && wordTags.includes('verb') && companionTags.includes('verb')) {
    return false;
  }

  // Запрещено: еда + глагол движения
  const motionVerbs = ['いく', 'くる', 'かえる', 'はしる', 'あるく'];
  if (
    (wordTags.includes('food') || wordTags.includes('drink')) &&
    template.particle === 'を' &&
    motionVerbs.some((v) => (companion.writing || '').includes(v))
  ) {
    return false;
  }

  // Запрещено: объект + непереходный глагол с частицей を
  if (
    template.particle === 'を' &&
    companionTags.includes('verb') &&
    companion.transitivity !== 'transitive' &&
    companion.transitivity !== undefined // если не указано, считаем что ок, или fallback
  ) {
    return false;
  }

  return true;
}

function shortT(word) {
  if (!word) return '';
  return (word.translation || '').split(/[（(;]/)[0].trim();
}

function getVerbMasuForm(word, activeLessonId = 99) {
  if (!word || word.partOfSpeech !== 'verb') return null;
  if (activeLessonId < 3) return null;
  try {
    const forms = conjugateVerb(word);
    const masu = forms.find((f) => f && f.formId === 'masu');
    return masu ? { kana: masu.kana, kanji: masu.kanji } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Семантические шаблоны
// ---------------------------------------------------------------------------

export const SEMANTIC_TEMPLATES = [
  {
    id: 'food-wo-drink',
    targetTags: ['food', 'drink'],
    role: 'object',
    particle: 'を',
    companionTags: ['verb'],
    companionTransitivity: 'transitive',
    build(word, companion, _rng, activeLessonId) {
      const verbForm = getVerbMasuForm(companion, activeLessonId);
      if (!verbForm) return null;
      return {
        japanese: `${word.kanji || word.writing}を${verbForm.kanji}`,
        reading: `${word.writing}を${verbForm.kana}`,
        translation: `${shortT(companion)}（${shortT(word)}を）`,
      };
    },
  },
  {
    id: 'noun-wa-desu',
    targetTags: ['object', 'person', 'place', 'noun', 'adjective', 'quality'],
    role: 'subject',
    particle: 'は',
    companionTags: ['adjective', 'quality', 'object', 'person'],
    build(word, companion, _rng, _activeLessonId) {
      return {
        japanese: `${word.kanji || word.writing}は${companion.kanji || companion.writing}です`,
        reading: `${word.writing}は${companion.writing}です`,
        translation: `${shortT(word)} — ${shortT(companion)}`,
      };
    },
  },
  {
    id: 'place-de-verb',
    targetTags: ['place'],
    role: 'location',
    particle: 'で',
    companionTags: ['verb'],
    build(word, companion, _rng, activeLessonId) {
      const verbForm = getVerbMasuForm(companion, activeLessonId);
      if (!verbForm) return null;
      return {
        japanese: `${word.kanji || word.writing}で${verbForm.kanji}`,
        reading: `${word.writing}で${verbForm.kana}`,
        translation: `${shortT(companion)}（${shortT(word)}で）`,
      };
    },
  },
  {
    id: 'place-ni-verb',
    targetTags: ['place'],
    role: 'destination',
    particle: 'に',
    companionTags: ['verb'],
    build(word, companion, _rng, activeLessonId) {
      const verbForm = getVerbMasuForm(companion, activeLessonId);
      if (!verbForm) return null;
      return {
        japanese: `${word.kanji || word.writing}に${verbForm.kanji}`,
        reading: `${word.writing}に${verbForm.kana}`,
        translation: `${shortT(companion)}（${shortT(word)}に）`,
      };
    },
  },
  {
    id: 'person-to-verb',
    targetTags: ['person', 'animate'],
    role: 'companion-person',
    particle: 'と',
    companionTags: ['verb'],
    build(word, companion, _rng, activeLessonId) {
      const verbForm = getVerbMasuForm(companion, activeLessonId);
      if (!verbForm) return null;
      return {
        japanese: `${word.kanji || word.writing}と${verbForm.kanji}`,
        reading: `${word.writing}と${verbForm.kana}`,
        translation: `${shortT(companion)}（с ${shortT(word)}）`,
      };
    },
  },
  {
    id: 'noun-ga-adj',
    targetTags: ['object', 'person', 'animate', 'noun'],
    role: 'subject-ga',
    particle: 'が',
    companionTags: ['adjective', 'quality'],
    build(word, companion, _rng, _activeLessonId) {
      return {
        japanese: `${word.kanji || word.writing}が${companion.kanji || companion.writing}です`,
        reading: `${word.writing}が${companion.writing}です`,
        translation: `${shortT(word)} — ${shortT(companion)}`,
      };
    },
  },
  {
    id: 'verb-ga-suki',
    targetTags: ['verb'],
    role: 'topic-verb',
    particle: 'が',
    companionTags: [],
    build(word, _companion, _rng, activeLessonId) {
      // Конструкция のが好きです вводится в уроке 8
      if (activeLessonId < 8) return null;
      return {
        japanese: `${word.kanji || word.writing}のが好きです`,
        reading: `${word.writing}のがすきです`,
        translation: `нравится ${shortT(word)}`,
      };
    },
  },
  {
    id: 'person-no-noun',
    targetTags: ['person', 'animate'],
    role: 'possessor',
    particle: 'の',
    companionTags: ['object', 'noun'],
    build(word, companion, _rng, _activeLessonId) {
      return {
        japanese: `${word.kanji || word.writing}の${companion.kanji || companion.writing}`,
        reading: `${word.writing}の${companion.writing}`,
        translation: `${shortT(companion)} (${shortT(word)})`,
      };
    },
  },
  {
    id: 'adj-standalone',
    targetTags: ['adjective', 'quality'],
    role: 'predicate',
    particle: 'は',
    companionTags: ['object', 'person', 'place', 'noun'],
    build(word, companion, _rng, _activeLessonId) {
      return {
        japanese: `${companion.kanji || companion.writing}は${word.kanji || word.writing}です`,
        reading: `${companion.writing}は${word.writing}です`,
        translation: `${shortT(companion)} — ${shortT(word)}`,
      };
    },
  },
  {
    id: 'verb-standalone-masu',
    targetTags: ['verb'],
    role: 'predicate-verb',
    particle: null,
    companionTags: [],
    build(word, _companion, _rng, activeLessonId) {
      const verbForm = getVerbMasuForm(word, activeLessonId);
      if (!verbForm) return null;
      return {
        japanese: `${verbForm.kanji}か`,
        reading: `${verbForm.kana}か`,
        translation: `${shortT(word)}？`,
      };
    },
  },
];

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
// Шаблонный движок
// ---------------------------------------------------------------------------

function pickSeeded(arr, rng) {
  if (!arr || arr.length === 0) return null;
  const idx = Math.floor(rng.next() * arr.length);
  return arr[idx];
}

function templateEngine(word, seed, userMaxLesson) {
  const rng = makeLCG(seed);

  const availableVocab = ExamplesDB.getCompatibleVocab([], userMaxLesson);
  if (!availableVocab || availableVocab.length === 0) return null;

  const wordTags = getSemanticTags(word);
  const suitableTemplates = SEMANTIC_TEMPLATES.filter((tpl) =>
    hasSomeTag(wordTags, tpl.targetTags)
  );
  if (suitableTemplates.length === 0) return null;

  // Детерминированное перемешивание шаблонов
  const shuffledTemplates = [...suitableTemplates];
  for (let i = shuffledTemplates.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffledTemplates[i], shuffledTemplates[j]] = [shuffledTemplates[j], shuffledTemplates[i]];
  }

  for (const tpl of shuffledTemplates) {
    if (!tpl.companionTags || tpl.companionTags.length === 0) {
      try {
        const result = tpl.build(word, null, rng, userMaxLesson);
        if (result) {
          return { ...result, grammar: { particle: tpl.particle, templateId: tpl.id } };
        }
      } catch {
        continue;
      }
    } else {
      const candidates = availableVocab.filter(
        (w) => w.id !== word.id && isSemanticallySafe(word, w, tpl)
      );
      if (candidates.length === 0) continue;

      const companion = pickSeeded(candidates, rng);
      if (!companion) continue;

      try {
        const result = tpl.build(word, companion, rng, userMaxLesson);
        if (result) {
          return { ...result, grammar: { particle: tpl.particle, templateId: tpl.id } };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Публичный API
// ---------------------------------------------------------------------------

/**
 * Получить стабильный дедуплицированный список кандидатов-примеров для слова.
 *
 * Требования:
 * - дедупликация по нормализованному японскому тексту
 * - сохранение приоритета проверенного корпуса
 * - стабильный порядок
 * - исключение примеров из будущих уроков
 * - без небезопасных случайных шаблонов (отключены)
 *
 * @param {object} word
 * @param {object} [options]
 * @param {number} [options.userMaxLesson=12]
 * @returns {Array} Список кандидатов
 */
export function getExampleCandidates(word, { userMaxLesson = 12 } = {}) {
  if (!word || !word.writing) return [];

  const candidates = [];
  const seenJapanese = new Set();

  const normalizeSentence = (str) => {
    if (!str) return '';
    return str.normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, '');
  };

  const addCandidate = (ex, source) => {
    if (!ex || !ex.japanese) return;
    const norm = normalizeSentence(ex.japanese);
    if (seenJapanese.has(norm)) return;
    seenJapanese.add(norm);

    candidates.push({
      japanese: ex.japanese,
      japaneseHighlighted: highlightWord(ex.japanese, word),
      reading: ex.reading || '',
      translation: ex.translation || '',
      source: source,
      grammar: ex.grammarIds ? { particles: ex.grammarIds } : ex.grammar || null,
    });
  };

  // ── 1. Corpus-first ──────────────────────────────────────────────────────
  if (word.lexemeId) {
    const corpusExamples = ExamplesDB.getExamplesForLexeme(word.lexemeId, userMaxLesson);
    // Сортируем по id или japanese для стабильного порядка
    corpusExamples.sort((a, b) => {
      const aVal = a.id || a.japanese || '';
      const bVal = b.id || b.japanese || '';
      return aVal.localeCompare(bVal);
    });

    for (const ex of corpusExamples) {
      addCandidate(ex, EXAMPLE_SOURCES.CORPUS);
    }
  }

  // ── 2. Template-fallback (отключён до появления semanticTags) ────────────
  // Пока не вернутся нормальные семантические теги из словаря, шаблоны
  // вроде noun-wa-desu генерируют бессмыслицу (напр. "寺ははやいです").
  // Мы полагаемся только на проверенные curated примеры.

  return candidates;
}

/**
 * Старая сигнатура для совместимости, но теперь опирается на getExampleCandidates.
 * Для UI рекомендуется использовать getExampleCandidates напрямую.
 */
export function generateExample(word, { exampleIndex = 0, userMaxLesson = 12 } = {}) {
  const candidates = getExampleCandidates(word, { userMaxLesson });
  if (candidates.length === 0) return null;
  const idx = exampleIndex % candidates.length;
  return candidates[idx >= 0 ? idx : 0];
}

import {
  USER_DICTIONARY_LIMITS,
  USER_DICTIONARY_SCHEMA_VERSION,
  UserDictionaryEntrySchema,
} from './schema.js';
import { katakanaToHiragana } from '../typing-capability.js';

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function createNamespacedId(namespace) {
  const random =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `${namespace}:${random}`;
}

export function assertSafeValue(value, { maxDepth = 20, depth = 0 } = {}) {
  if (depth > maxDepth) throw new Error(`JSON глубже допустимых ${maxDepth} уровней`);
  if (typeof value === 'string' && value.length > USER_DICTIONARY_LIMITS.notes * 5) {
    throw new Error('Обнаружена чрезмерно длинная строка');
  }
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) throw new Error(`Опасное поле: ${key}`);
    assertSafeValue(value[key], { maxDepth, depth: depth + 1 });
  }
}

export function stripUserHtml(value) {
  return String(value ?? '').replace(/<[^>]*>/gu, ' ');
}

function uniqueStrings(values, maxItems, maxLength) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    if (value !== null && value !== undefined && typeof value !== 'string') {
      throw new Error('Ожидалась строка');
    }
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) continue;
    if (text.length > maxLength) throw new Error(`Значение длиннее ${maxLength} символов`);
    seen.add(text);
    output.push(text);
    if (output.length > maxItems) throw new Error(`Допустимо не более ${maxItems} значений`);
  }
  return output;
}

export function normalizeMeanings(value, options = {}) {
  const separator = options.separator ?? ';';
  let values = value;
  if (value && !Array.isArray(value) && typeof value === 'object') {
    values = value.ru ?? value.meanings ?? value.translation ?? Object.values(value).flat();
  }
  if (!Array.isArray(values)) {
    values =
      typeof values === 'string' && separator
        ? values.split(separator)
        : values === undefined || values === null
          ? []
          : [values];
  }
  if (options.stripHtml) values = values.map(stripUserHtml);
  return uniqueStrings(
    values.flat(Infinity),
    USER_DICTIONARY_LIMITS.meanings,
    USER_DICTIONARY_LIMITS.meaning
  );
}

export function normalizeTags(value, options = {}) {
  const separator = options.separator ?? ',';
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(separator)
      : value == null
        ? []
        : [value];
  return uniqueStrings(
    values.flat(Infinity),
    USER_DICTIONARY_LIMITS.tags,
    USER_DICTIONARY_LIMITS.tag
  );
}

export function normalizeJapaneseForComparison(value) {
  return katakanaToHiragana(String(value ?? ''))
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/[\s\u3000・･、。,.!?！？「」『』（）()[\]{}]/gu, '');
}

export function getUserDictionaryEntryKey(entry) {
  const writing = normalizeJapaneseForComparison(entry.writing || entry.reading);
  const reading = normalizeJapaneseForComparison(entry.reading);
  return reading && reading !== writing ? `${writing}\u0000${reading}` : writing;
}

function normalizeExamples(value, stripHtml) {
  const examples = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = examples
    .map((example) => ({
      japanese: String(example?.japanese ?? '').trim(),
      translation: String(example?.translation ?? '').trim(),
    }))
    .map((example) =>
      stripHtml
        ? {
            japanese: stripUserHtml(example.japanese).trim(),
            translation: stripUserHtml(example.translation).trim(),
          }
        : example
    )
    .filter((example) => example.japanese || example.translation);
  return normalized.filter(
    (example, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.japanese === example.japanese && candidate.translation === example.translation
      ) === index
  );
}

export function normalizeUserDictionaryEntry(raw, options = {}) {
  assertSafeValue(raw, { maxDepth: options.maxDepth ?? USER_DICTIONARY_LIMITS.jsonDepth });
  const now = options.now || new Date().toISOString();
  const stripHtml = options.stripHtml === true;
  const text = (value) => {
    if (value !== null && value !== undefined && typeof value !== 'string') {
      throw new Error('Ожидалась строка');
    }
    const result = String(value ?? '').trim();
    return stripHtml ? stripUserHtml(result).trim() : result;
  };
  const sourceType = ['manual', 'import', 'ai'].includes(raw.source?.type)
    ? raw.source.type
    : ['manual', 'import', 'ai'].includes(options.sourceType)
      ? options.sourceType
      : 'import';
  const entry = {
    id: raw.id || createNamespacedId('user-word'),
    dictionaryId: options.dictionaryId || raw.dictionaryId,
    writing: text(raw.writing),
    reading: text(raw.reading),
    meanings: normalizeMeanings(raw.meanings, {
      separator: options.meaningSeparator,
      stripHtml,
    }),
    alternativeWritings: normalizeTags(raw.alternativeWritings, {
      separator: options.alternativeSeparator || ';',
    }),
    partOfSpeech: normalizeTags(raw.partOfSpeech, {
      separator: options.partOfSpeechSeparator || ',',
    }),
    tags: normalizeTags(raw.tags, { separator: options.tagSeparator }),
    examples: normalizeExamples(raw.examples, stripHtml),
    notes: text(raw.notes),
    source: {
      type: sourceType,
      label: text(raw.source?.label ?? options.sourceLabel ?? ''),
      externalId:
        raw.source?.externalId === null || raw.source?.externalId === undefined
          ? null
          : text(raw.source.externalId),
    },
    ...(raw.globalDictionaryId ? { globalDictionaryId: raw.globalDictionaryId } : {}),
    ...(raw.verbClass !== undefined ? { verbClass: raw.verbClass } : {}),
    ...(raw.adjectiveClass !== undefined ? { adjectiveClass: raw.adjectiveClass } : {}),
    ...(raw.transitivity !== undefined ? { transitivity: raw.transitivity } : {}),
    ...(raw.tokenForms ? { tokenForms: normalizeTags(raw.tokenForms, { separator: ';' }) } : {}),
    ...(Number.isFinite(raw.confidence) ? { confidence: raw.confidence } : {}),
    ...(raw.verified !== undefined ? { verified: raw.verified === true } : {}),
    ...(raw.productionTask ? { productionTask: raw.productionTask } : {}),
    learningEnabled: raw.learningEnabled === true,
    entryKey: '',
    searchText: '',
    createdAt: raw.createdAt || now,
    updatedAt: options.preserveUpdatedAt ? raw.updatedAt || now : now,
    schemaVersion: USER_DICTIONARY_SCHEMA_VERSION,
  };
  entry.entryKey = getUserDictionaryEntryKey(entry);
  entry.searchText = [
    entry.writing,
    entry.reading,
    ...entry.meanings,
    ...entry.alternativeWritings,
    ...entry.tags,
    entry.notes,
  ]
    .map((value) => normalizeJapaneseForComparison(value))
    .filter(Boolean)
    .join('\u0001');
  return UserDictionaryEntrySchema.parse(entry);
}

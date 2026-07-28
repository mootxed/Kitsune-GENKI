import {
  getUserDictionaryEntryKey,
  normalizeUserDictionaryEntry,
} from '../user-dictionaries/normalize.js';

export const PERSONAL_DICTIONARY_ID = 'user-dict:personal';
export const PERSONAL_DICTIONARY_NAME = 'Мой словарь';

function normalizeLookup(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .toLocaleLowerCase('ja');
}

export function findTokenLexemeMatches(token, catalogWords = [], userEntries = []) {
  const targets = new Set(
    [token.dictionaryForm, token.dictionaryReading, token.kanji, token.writing]
      .map(normalizeLookup)
      .filter(Boolean)
  );
  const matches = (entry) =>
    [entry.writing, entry.kanji, entry.reading, entry.kana]
      .map(normalizeLookup)
      .some((value) => value && targets.has(value));
  return {
    catalogMatch: catalogWords.find(matches) || null,
    userMatch: userEntries.find(matches) || null,
  };
}

export async function ensurePersonalDictionary(repository) {
  const dictionaries = await repository.listDictionaries();
  const existing = dictionaries.find(
    (dictionary) => dictionary.kind === 'personal' || dictionary.id === PERSONAL_DICTIONARY_ID
  );
  if (existing) {
    if (existing.kind !== 'personal') {
      return repository.saveDictionary({ ...existing, kind: 'personal' });
    }
    return existing;
  }
  return repository.saveDictionary({
    id: PERSONAL_DICTIONARY_ID,
    name: PERSONAL_DICTIONARY_NAME,
    description: 'Личный словарь для слов, добавленных вручную и из AI Сенсея.',
    kind: 'personal',
    sourceType: 'manual',
  });
}

function uniqueStrings(left = [], right = []) {
  return [...new Set([...left, ...right].map((value) => String(value).trim()).filter(Boolean))];
}

function uniqueExamples(left = [], right = []) {
  const seen = new Set();
  return [...left, ...right].filter((example) => {
    const key = `${example.japanese || ''}\u0001${example.translation || ''}`.normalize('NFKC');
    if (!key.replace('\u0001', '') || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function prepareTokenDictionaryDraft({
  token,
  sentence = '',
  sentenceTranslation = '',
  catalogMatch = null,
  userMatch = null,
  dictionaryId = PERSONAL_DICTIONARY_ID,
}) {
  const dictionaryForm =
    catalogMatch?.writing ||
    userMatch?.writing ||
    token.dictionaryForm ||
    token.kanji ||
    token.writing ||
    '';
  const dictionaryReading =
    catalogMatch?.reading || userMatch?.reading || token.dictionaryReading || token.writing || '';
  const meaning =
    catalogMatch?.meanings?.[0] ||
    userMatch?.meanings?.[0] ||
    token.dictionaryMeaning ||
    token.translation ||
    '';
  const uncertain =
    !catalogMatch && !userMatch && !token.dictionaryForm && Boolean(token.kanji || token.writing);
  return {
    dictionaryId,
    writing: dictionaryForm,
    reading: dictionaryReading,
    meanings: [meaning || 'Проверьте значение'],
    partOfSpeech: [token.type].filter(Boolean),
    tags: ['AI Сенсей'],
    notes: uncertain ? 'Словарная форма определена приблизительно — проверьте данные.' : '',
    examples:
      sentence || sentenceTranslation
        ? [{ japanese: sentence, translation: sentenceTranslation }]
        : [],
    source: { type: 'manual', label: 'AI Сенсей', externalId: null },
    learningEnabled: false,
    sourceContext: {
      surfaceForm: token.kanji || token.writing || '',
      sentence,
      sentenceTranslation,
      source: 'AI Сенсей',
    },
    uncertain,
  };
}

export async function findDuplicateEntries(repository, draft) {
  const dictionaries = await repository.listDictionaries();
  const probe = normalizeUserDictionaryEntry(
    {
      ...draft,
      id: 'user-word:duplicate-probe',
      dictionaryId: draft.dictionaryId || PERSONAL_DICTIONARY_ID,
    },
    { preserveUpdatedAt: true }
  );
  const groups = await Promise.all(
    dictionaries.map((dictionary) => repository.listEntries(dictionary.id))
  );
  return groups.flat().filter((entry) => entry.entryKey === getUserDictionaryEntryKey(probe));
}

export async function mergeSenseiDictionaryEntry(repository, existing, draft) {
  return repository.saveEntry({
    ...existing,
    meanings: uniqueStrings(existing.meanings, draft.meanings),
    alternativeWritings: uniqueStrings(existing.alternativeWritings, draft.alternativeWritings),
    partOfSpeech: uniqueStrings(existing.partOfSpeech, draft.partOfSpeech),
    tags: uniqueStrings(existing.tags, draft.tags),
    examples: uniqueExamples(existing.examples, draft.examples),
    notes: uniqueStrings([existing.notes], [draft.notes]).join('\n'),
    learningEnabled: existing.learningEnabled,
    source: existing.source,
  });
}

export async function saveSenseiDictionaryEntry({
  repository,
  draft,
  duplicateAction = 'cancel',
  duplicateEntry = null,
}) {
  const dictionary =
    draft.dictionaryId === PERSONAL_DICTIONARY_ID
      ? await ensurePersonalDictionary(repository)
      : await repository.getDictionary(draft.dictionaryId);
  if (!dictionary) throw new Error('Выбранный словарь был удалён. Выберите другой словарь.');
  const duplicates = duplicateEntry
    ? [duplicateEntry]
    : await findDuplicateEntries(repository, draft);
  if (duplicates.length && duplicateAction === 'cancel') {
    return { status: 'duplicate', duplicates };
  }
  if (duplicates.length && duplicateAction === 'open') {
    return { status: 'open', entry: duplicates[0] };
  }
  if (duplicates.length && duplicateAction === 'merge') {
    const entry = await mergeSenseiDictionaryEntry(repository, duplicates[0], draft);
    return { status: 'saved', entry, merged: true };
  }
  const separateId =
    duplicates.length && duplicateAction === 'separate'
      ? `user-word:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-separate`}`
      : draft.id;
  const entry = await repository.saveEntry({
    ...draft,
    ...(separateId ? { id: separateId } : {}),
    dictionaryId: dictionary.id,
    learningEnabled: false,
    source: { type: 'manual', label: 'AI Сенсей', externalId: null },
  });
  return { status: 'saved', entry, merged: false };
}

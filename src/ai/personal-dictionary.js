import {
  getUserDictionaryEntryKey,
  normalizeUserDictionaryEntry,
} from '../user-dictionaries/normalize.js';
import { dictionaryStore, ensureDictionaryLoaded } from '../dictionary/dictionary-store.js';
import { userDictionaryEntryId } from '../dictionary/dictionary-id.js';

export const PERSONAL_DICTIONARY_ID = 'user-dict:personal';
export const PERSONAL_DICTIONARY_NAME = 'Мой словарь';

function normalizeLookup(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .toLocaleLowerCase('ja');
}

function matchRank(token, entry) {
  const tokenWriting = normalizeLookup(token.dictionaryForm || token.kanji || token.writing);
  const tokenReading = normalizeLookup(token.dictionaryReading || token.writing);

  const entryWriting = normalizeLookup(entry.writing || entry.kanji);
  const entryReading = normalizeLookup(entry.reading || entry.kana);

  const writingMatch = Boolean(
    tokenWriting &&
    (tokenWriting === entryWriting ||
      tokenWriting === normalizeLookup(entry.kanji) ||
      tokenWriting === normalizeLookup(entry.writing))
  );
  const readingMatch = Boolean(
    tokenReading &&
    (tokenReading === entryReading ||
      tokenReading === normalizeLookup(entry.kana) ||
      tokenReading === normalizeLookup(entry.reading))
  );

  if (writingMatch && readingMatch) return 1;
  if (writingMatch && entryReading) return 2;
  if (writingMatch) return 3;
  if (readingMatch) return 4;
  return 999;
}

export function findBestEntryMatch(token, entries = []) {
  const ranked = entries
    .map((entry) => ({ entry, rank: matchRank(token, entry) }))
    .filter((item) => item.rank < 999);

  if (ranked.length === 0) return null;

  ranked.sort((a, b) => a.rank - b.rank);
  const topRank = ranked[0].rank;
  const topMatches = ranked.filter((item) => item.rank === topRank);

  if (topRank <= 3) return topMatches[0].entry;
  if (topRank === 4) {
    if (topMatches.length === 1) return topMatches[0].entry;
    return null;
  }

  return null;
}

export function findTokenLexemeMatches(token, catalogWords = [], userEntries = []) {
  return {
    catalogMatch: findBestEntryMatch(token, catalogWords),
    userMatch: findBestEntryMatch(token, userEntries),
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
  globalMatch = null,
  dictionaryId = PERSONAL_DICTIONARY_ID,
}) {
  const dictionaryForm =
    globalMatch?.dictionaryForm ||
    catalogMatch?.writing ||
    userMatch?.writing ||
    token.dictionaryForm ||
    token.kanji ||
    token.writing ||
    '';
  const dictionaryReading =
    globalMatch?.reading ||
    catalogMatch?.reading ||
    userMatch?.reading ||
    token.dictionaryReading ||
    token.writing ||
    '';
  const meaning =
    globalMatch?.meanings?.[0] ||
    catalogMatch?.meanings?.[0] ||
    userMatch?.meanings?.[0] ||
    token.dictionaryMeaning ||
    token.translation ||
    '';
  const uncertain =
    !globalMatch &&
    !catalogMatch &&
    !userMatch &&
    !token.dictionaryForm &&
    Boolean(token.kanji || token.writing);
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
    globalDictionaryId:
      globalMatch?.id ||
      userDictionaryEntryId({
        dictionaryForm,
        reading: dictionaryReading || dictionaryForm,
      }),
    source: {
      type: 'ai',
      label: 'AI Сенсей',
      externalId: globalMatch?.id || null,
    },
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

export async function resolveGlobalTokenMatch(token, options = {}) {
  await ensureDictionaryLoaded();
  if (token?.dictionaryId) {
    const direct = dictionaryStore.getDictionaryEntry(token.dictionaryId);
    if (direct) {
      return {
        status: 'resolved',
        dictionaryId: direct.id,
        candidates: [direct.id],
        source: direct.source === 'ai' ? 'user-ai' : 'builtin',
        entry: direct,
      };
    }
  }
  const surface = token?.kanji || token?.writing || token?.surface || '';
  const resolution = dictionaryStore.resolveToken(surface, options);
  return {
    ...resolution,
    entry: resolution.dictionaryId
      ? dictionaryStore.getDictionaryEntry(resolution.dictionaryId)
      : null,
  };
}

export async function findDuplicateEntries(repository, draft) {
  const dictionaries = await repository.listDictionaries();
  const probeDictionaryId =
    !draft.dictionaryId || draft.dictionaryId === '__new__'
      ? PERSONAL_DICTIONARY_ID
      : draft.dictionaryId;

  const probe = normalizeUserDictionaryEntry(
    {
      ...draft,
      id: 'user-word:duplicate-probe',
      dictionaryId: probeDictionaryId,
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
    globalDictionaryId: existing.globalDictionaryId || draft.globalDictionaryId,
  });
}

export async function saveSenseiDictionaryEntry({
  repository,
  draft,
  duplicateAction = 'cancel',
  duplicateEntry = null,
}) {
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
  const globalDictionaryId =
    draft.globalDictionaryId ||
    userDictionaryEntryId({
      dictionaryForm: draft.writing,
      reading: draft.reading || draft.writing,
    });
  const aiSource = {
    type: 'ai',
    label: 'AI Сенсей',
    externalId: globalDictionaryId,
  };

  if (draft.dictionaryId === '__new__') {
    const dictInput = {
      name: draft.newDictionaryName || 'Новый словарь',
      description: 'Создано из формы AI Сенсея',
      sourceType: 'manual',
    };
    const entryInput = {
      ...draft,
      ...(separateId ? { id: separateId } : {}),
      globalDictionaryId,
      learningEnabled: false,
      source: aiSource,
    };

    if (typeof repository.createDictionaryWithEntry === 'function') {
      const { entry } = await repository.createDictionaryWithEntry(dictInput, entryInput);
      return { status: 'saved', entry, merged: false };
    }

    const createdDict = await repository.saveDictionary(dictInput);
    try {
      const entry = await repository.saveEntry({ ...entryInput, dictionaryId: createdDict.id });
      return { status: 'saved', entry, merged: false };
    } catch (saveError) {
      if (repository.deleteDictionary) {
        await repository.deleteDictionary(createdDict.id).catch(() => {});
      }
      throw saveError;
    }
  }

  const dictionary =
    draft.dictionaryId === PERSONAL_DICTIONARY_ID
      ? await ensurePersonalDictionary(repository)
      : await repository.getDictionary(draft.dictionaryId);

  if (!dictionary) throw new Error('Выбранный словарь был удалён. Выберите другой словарь.');

  const entry = await repository.saveEntry({
    ...draft,
    ...(separateId ? { id: separateId } : {}),
    globalDictionaryId,
    dictionaryId: dictionary.id,
    learningEnabled: false,
    source: aiSource,
  });
  return { status: 'saved', entry, merged: false };
}

import { DictionaryLoader } from './dictionary-loader.js';
import { DictionaryEntrySchema, normalizeDictionaryEntry } from './dictionary-contract.js';
import { dictionaryEntryId, userDictionaryEntryId } from './dictionary-id.js';
import { resolveCourseVocabulary } from './dictionary-merge.js';
import { resolveGeneratedDictionaryAlias } from './generated-dictionary-aliases.js';
import {
  findReadingCandidates,
  findTokenCandidates,
  resolveTokenCandidates,
} from './token-index.js';
import {
  createUserDictionaryModel,
  UserDictionaryRepository,
} from '../user-dictionaries/repository.js';
import { clearDictionaryCatalogCache } from './dictionary-catalog-loader.js';

export const PERSONAL_DICTIONARY_ID = 'user-dict:personal';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function userRecordToEntry(record) {
  const id =
    record.globalDictionaryId ||
    record.source?.externalId ||
    userDictionaryEntryId({
      dictionaryForm: record.writing || record.reading,
      reading: record.reading || record.writing,
    });
  return normalizeDictionaryEntry({
    id,
    dictionaryForm: record.writing || record.reading,
    reading: record.reading || record.writing,
    meanings: record.meanings,
    partOfSpeech: Array.isArray(record.partOfSpeech) ? record.partOfSpeech[0] || null : null,
    verbClass: record.verbClass || null,
    adjectiveClass: record.adjectiveClass || null,
    transitivity: record.transitivity || null,
    tokenForms: unique([
      record.writing,
      record.reading,
      ...(record.alternativeWritings || []),
      ...(record.tokenForms || []),
    ]),
    semanticTags: record.tags || [],
    source: 'ai',
    confidence: record.confidence ?? 0.5,
    verified: record.verified === true,
    provenance: {
      sourceType: 'ai-user',
      sourceId: record.id,
    },
  });
}

export class DictionaryStore {
  constructor(options = {}) {
    this.loader = options.loader || new DictionaryLoader(options);
    this.userRepository =
      options.userRepository === null
        ? null
        : options.userRepository || new UserDictionaryRepository(options.databaseOverride);
    this.loadPromise = null;
    this.loaded = false;
    this.manifest = null;
    this.builtinEntries = new Map();
    this.userEntries = new Map();
    this.tokenIndex = {};
    this.aliases = new Map();
    this.courseAliases = new Map(); // courseId -> Map(localId -> dictionaryId)
    this.courseReferences = new Map();
    this.referencesByDictionaryId = new Map();
    this.userRevision = 0;
  }

  async ensureLoaded() {
    if (this.loaded) return this;
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const loaded = await this.loader.load();
        this.manifest = deepFreeze({ ...loaded.manifest });
        this.builtinEntries = new Map(
          loaded.entries.map((entry) => [entry.id, deepFreeze({ ...entry })])
        );
        this.tokenIndex = deepFreeze(
          Object.fromEntries(
            Object.entries(loaded.tokenIndex).map(([token, ids]) => [token, [...ids]])
          )
        );
        this.aliases = new Map(Object.entries(loaded.aliases));
        await this.loadUserEntries();
        this.loaded = true;
        return this;
      })().catch((error) => {
        this.loadPromise = null;
        this.loaded = false;
        throw error;
      });
    }
    return this.loadPromise;
  }

  async loadUserEntries() {
    this.userEntries.clear();
    if (!this.userRepository) return;
    const dictionaries = await this.userRepository.listDictionaries();
    for (const dictionary of dictionaries) {
      const records = await this.userRepository.listEntries(dictionary.id);
      for (const record of records) {
        const isAi =
          record.source?.type === 'ai' ||
          record.source?.label === 'AI Сенсей' ||
          Boolean(record.globalDictionaryId);
        if (!isAi) continue;
        try {
          const entry = deepFreeze(userRecordToEntry(record));
          const curatedId = dictionaryEntryId(entry, {
            disambiguator: entry.id.split(':')[3],
          });
          if (this.builtinEntries.has(curatedId)) {
            this.aliases.set(record.id, curatedId);
            this.aliases.set(entry.id, curatedId);
            continue;
          }
          this.userEntries.set(entry.id, entry);
          this.aliases.set(record.id, entry.id);
        } catch (error) {
          console.warn(`[Dictionary] Ignoring invalid user entry ${record.id}:`, error);
        }
      }
    }
    this.userRevision++;
    clearDictionaryCatalogCache();
  }

  getDictionaryEntry(id) {
    const resolved = this.resolveAlias(id);
    return this.builtinEntries.get(resolved) || this.userEntries.get(resolved) || null;
  }

  hasDictionaryEntry(id) {
    return Boolean(this.getDictionaryEntry(id));
  }

  resolveAlias(id, courseId = null) {
    let current = String(id || '');
    if (
      courseId &&
      this.courseAliases.has(courseId) &&
      this.courseAliases.get(courseId).has(current)
    ) {
      current = this.courseAliases.get(courseId).get(current);
    }
    const visited = new Set();
    while (this.aliases.has(current) && !visited.has(current)) {
      visited.add(current);
      current = this.aliases.get(current);
    }
    return resolveGeneratedDictionaryAlias(current);
  }

  getAllDictionaryEntries() {
    return [...this.builtinEntries.values(), ...this.userEntries.values()].sort((left, right) =>
      left.id.localeCompare(right.id, 'ja')
    );
  }

  registerCourseVocabularyReference(reference) {
    const entry = this.getDictionaryEntry(reference.dictionaryId);
    if (!entry) {
      throw new Error(
        `[Dictionary] Broken course vocabulary reference: courseId=${reference.courseId}, lessonId=${reference.lessonId || reference.introducedIn}, referenceId=${reference.id}, dictionaryId=${reference.dictionaryId}`
      );
    }
    this.courseReferences.set(reference.id, deepFreeze({ ...reference }));
    if (!this.referencesByDictionaryId.has(entry.id)) {
      this.referencesByDictionaryId.set(entry.id, new Map());
    }
    this.referencesByDictionaryId.get(entry.id).set(reference.id, reference);
    this.aliases.set(reference.id, entry.id);
    if (reference.courseId && reference.localId) {
      if (!this.courseAliases.has(reference.courseId)) {
        this.courseAliases.set(reference.courseId, new Map());
      }
      this.courseAliases.get(reference.courseId).set(reference.localId, entry.id);
      this.aliases.set(`${reference.courseId}:vocabulary:${reference.localId}`, entry.id);
    }
    return resolveCourseVocabulary(reference, entry);
  }

  resolveCourseVocabularyReference(reference) {
    return this.registerCourseVocabularyReference(reference);
  }

  getCourseVocabularyReference(referenceId) {
    return this.courseReferences.get(String(referenceId || '')) || null;
  }

  findCourseReferencesForDictionary(dictionaryId) {
    const resolved = this.resolveAlias(dictionaryId);
    return [...(this.referencesByDictionaryId.get(resolved)?.values() || [])];
  }

  resolveVocabularyRuntimeItem(id) {
    const raw = String(id || '');
    const separatorIndex = raw.lastIndexOf('::');
    const base = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
    const reference = this.getCourseVocabularyReference(base);
    if (reference) return this.resolveCourseVocabularyReference(reference);
    const dictionaryId = this.resolveAlias(base);
    const preferredReference = this.findCourseReferencesForDictionary(dictionaryId)[0];
    return preferredReference
      ? this.resolveCourseVocabularyReference(preferredReference)
      : this.getDictionaryEntry(dictionaryId);
  }

  getIntroducedLesson(dictionaryId, courseId) {
    const references = this.findCourseReferencesForDictionary(dictionaryId).filter(
      (reference) => reference.courseId === courseId
    );
    return references[0]?.introducedIn || null;
  }

  findDictionaryCandidatesByToken(token, options = {}) {
    const builtin = findTokenCandidates(this.tokenIndex, token, options);
    const userIndex = {};
    for (const entry of this.userEntries.values()) {
      for (const form of entry.tokenForms) {
        userIndex[form] ||= [];
        userIndex[form].push(entry.id);
      }
    }
    const user = findTokenCandidates(userIndex, token, options);
    const candidates = unique([...builtin.candidates, ...user.candidates]);
    return {
      normalizedToken: builtin.normalizedToken,
      candidates,
      exact: candidates.length > 0,
      ambiguous: candidates.length > 1,
    };
  }

  findDictionaryCandidatesByReading(reading) {
    return findReadingCandidates(this.getAllDictionaryEntries(), reading);
  }

  resolveToken(token, options = {}) {
    const combined = this.findDictionaryCandidatesByToken(token, options);
    const resolved = resolveTokenCandidates(
      { [combined.normalizedToken]: combined.candidates },
      combined.normalizedToken,
      options
    );
    const source =
      resolved.dictionaryId && this.builtinEntries.has(resolved.dictionaryId)
        ? 'builtin'
        : resolved.dictionaryId && this.userEntries.has(resolved.dictionaryId)
          ? 'user-ai'
          : resolved.status === 'missing' && options.aiHint
            ? 'ai-context'
            : null;
    return { ...resolved, source };
  }

  async registerUserDictionaryEntry(input) {
    await this.ensureLoaded();
    const curatedId = dictionaryEntryId(input, {
      disambiguator: input.disambiguator || input.senseId,
    });
    const curated = this.builtinEntries.get(curatedId);
    if (curated) {
      return { entry: curated, created: false, conflict: 'curated-wins' };
    }

    const id = input.id?.startsWith('user-word:')
      ? input.id
      : userDictionaryEntryId(input, {
          disambiguator: input.disambiguator || input.senseId,
        });
    const targetDictId = input.targetDictionaryId || PERSONAL_DICTIONARY_ID;
    const candidate = normalizeDictionaryEntry({
      ...input,
      id,
      tokenForms: unique([input.dictionaryForm, input.reading, ...(input.tokenForms || [])]),
      source: 'ai',
      confidence: input.confidence ?? 0.5,
      verified: input.verified === true,
      provenance: input.provenance || { sourceType: 'ai-user' },
    });
    const current = this.userEntries.get(id);
    const entry = deepFreeze(
      DictionaryEntrySchema.parse(
        current
          ? {
              ...current,
              meanings: unique([...current.meanings, ...candidate.meanings]),
              tokenForms: unique([...current.tokenForms, ...candidate.tokenForms]),
              confidence: Math.max(current.confidence, candidate.confidence),
              verified: current.verified === true || candidate.verified === true,
            }
          : candidate
      )
    );

    if (this.userRepository) {
      let dictionary = await this.userRepository.getDictionary(targetDictId);
      if (!dictionary) {
        dictionary = createUserDictionaryModel({
          id: targetDictId,
          name: targetDictId === 'user-dict:ai-cache' ? 'AI Кэш словаря' : 'Личный словарь',
          description:
            targetDictId === 'user-dict:ai-cache'
              ? 'Системный кэш токенизации историй'
              : 'Слова, добавленные пользователем и AI Сенсеем',
          kind: targetDictId === 'user-dict:ai-cache' ? 'ai-cache' : 'personal',
          sourceType: 'ai',
          hidden: targetDictId === 'user-dict:ai-cache',
        });
        await this.userRepository.saveDictionary(dictionary);
      }
      const records = await this.userRepository.listEntries(dictionary.id);
      const existingRecord = records.find(
        (record) => record.globalDictionaryId === id || record.source?.externalId === id
      );
      const saved = await this.userRepository.saveEntry(
        {
          ...existingRecord,
          id: existingRecord?.id,
          dictionaryId: dictionary.id,
          globalDictionaryId: id,
          writing: entry.dictionaryForm,
          reading: entry.reading,
          meanings: entry.meanings,
          alternativeWritings: entry.tokenForms.filter(
            (form) => form !== entry.dictionaryForm && form !== entry.reading
          ),
          partOfSpeech: entry.partOfSpeech ? [entry.partOfSpeech] : [],
          tags: entry.semanticTags,
          source: { type: 'ai', label: 'AI Сенсей', externalId: id },
          learningEnabled: false,
          verbClass: entry.verbClass,
          adjectiveClass: entry.adjectiveClass,
          transitivity: entry.transitivity,
          tokenForms: entry.tokenForms,
          confidence: entry.confidence,
          verified: entry.verified === true,
        },
        { sourceType: 'ai' }
      );
      this.aliases.set(saved.id, id);
    }
    this.userEntries.set(id, entry);
    this.userRevision++;
    clearDictionaryCatalogCache();
    return { entry, created: !current, conflict: null };
  }
}

export const dictionaryStore = new DictionaryStore();

export const ensureDictionaryLoaded = () => dictionaryStore.ensureLoaded();
export const getDictionaryEntry = (id) => dictionaryStore.getDictionaryEntry(id);
export const hasDictionaryEntry = (id) => dictionaryStore.hasDictionaryEntry(id);
export const resolveDictionaryAlias = (id) => dictionaryStore.resolveAlias(id);
export const findDictionaryCandidatesByToken = (token, options) =>
  dictionaryStore.findDictionaryCandidatesByToken(token, options);
export const findDictionaryCandidatesByReading = (reading) =>
  dictionaryStore.findDictionaryCandidatesByReading(reading);
export const getAllDictionaryEntries = () => dictionaryStore.getAllDictionaryEntries();
export const resolveCourseVocabularyReference = (reference) =>
  dictionaryStore.resolveCourseVocabularyReference(reference);
export const registerUserDictionaryEntry = (entry) =>
  dictionaryStore.registerUserDictionaryEntry(entry);

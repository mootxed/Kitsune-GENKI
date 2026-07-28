import { db as sharedDb, initializeDB, STORES } from '../db.js';
import {
  ImportProfileSchema,
  USER_DICTIONARY_SCHEMA_VERSION,
  UserDictionaryEntrySchema,
  UserDictionarySchema,
} from './schema.js';
import { createNamespacedId, normalizeUserDictionaryEntry } from './normalize.js';

async function database(override) {
  return override || sharedDb || initializeDB();
}

export function createUserDictionaryModel(input = {}, now = new Date().toISOString()) {
  return UserDictionarySchema.parse({
    id: input.id || createNamespacedId('user-dict'),
    name: String(input.name || '').trim(),
    description: String(input.description || '').trim(),
    createdAt: input.createdAt || now,
    updatedAt: now,
    sourceType: input.sourceType === 'import' ? 'import' : 'manual',
    kind: input.kind === 'personal' ? 'personal' : 'regular',
    schemaVersion: USER_DICTIONARY_SCHEMA_VERSION,
  });
}

export class UserDictionaryRepository {
  constructor(databaseOverride = null) {
    this.databaseOverride = databaseOverride;
  }

  async db() {
    return database(this.databaseOverride);
  }

  async listDictionaries() {
    return (await (await this.db()).getAll(STORES.USER_DICTIONARIES))
      .map((value) => UserDictionarySchema.parse(value))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getDictionary(id) {
    const value = await (await this.db()).get(STORES.USER_DICTIONARIES, id);
    return value ? UserDictionarySchema.parse(value) : null;
  }

  async saveDictionary(input) {
    const current = input.id ? await this.getDictionary(input.id) : null;
    const value = createUserDictionaryModel(
      { ...current, ...input, createdAt: current?.createdAt || input.createdAt },
      new Date().toISOString()
    );
    await (await this.db()).putRecord(STORES.USER_DICTIONARIES, value);
    return value;
  }

  async listEntries(dictionaryId) {
    const values = await (
      await this.db()
    ).getAllByIndex(STORES.USER_DICTIONARY_ENTRIES, 'dictionaryId', dictionaryId);
    return values.map((value) => UserDictionaryEntrySchema.parse(value));
  }

  async getEntry(id) {
    const value = await (await this.db()).get(STORES.USER_DICTIONARY_ENTRIES, id);
    return value ? UserDictionaryEntrySchema.parse(value) : null;
  }

  async saveEntry(raw, options = {}) {
    const current = raw.id ? await this.getEntry(raw.id) : null;
    const entry = normalizeUserDictionaryEntry(
      {
        ...current,
        ...raw,
        id: current?.id || raw.id,
        createdAt: current?.createdAt || raw.createdAt,
      },
      {
        dictionaryId: raw.dictionaryId || current?.dictionaryId,
        sourceType: raw.source?.type || 'manual',
        ...options,
      }
    );
    const databaseInstance = await this.db();
    await databaseInstance.putRecord(STORES.USER_DICTIONARY_ENTRIES, entry);
    const dictionary = await this.getDictionary(entry.dictionaryId);
    if (dictionary) {
      await databaseInstance.putRecord(STORES.USER_DICTIONARIES, {
        ...dictionary,
        updatedAt: entry.updatedAt,
      });
    }
    return entry;
  }

  async saveEntries(entries) {
    const databaseInstance = await this.db();
    for (const entry of entries) {
      await databaseInstance.putRecord(
        STORES.USER_DICTIONARY_ENTRIES,
        UserDictionaryEntrySchema.parse(entry)
      );
    }
  }

  async deleteEntry(id) {
    await (await this.db()).delete(STORES.USER_DICTIONARY_ENTRIES, id);
  }

  async deleteDictionary(id) {
    const databaseInstance = await this.db();
    const entries = await this.listEntries(id);
    for (const entry of entries)
      await databaseInstance.delete(STORES.USER_DICTIONARY_ENTRIES, entry.id);
    await databaseInstance.delete(STORES.USER_DICTIONARIES, id);
    return entries;
  }

  async listProfiles() {
    const profiles = await (await this.db()).getAll(STORES.USER_DICTIONARY_IMPORT_PROFILES);
    return profiles.map((profile) => ImportProfileSchema.parse(profile));
  }

  async saveProfile(profile) {
    const parsed = ImportProfileSchema.parse(profile);
    await (await this.db()).putRecord(STORES.USER_DICTIONARY_IMPORT_PROFILES, parsed);
    return parsed;
  }

  async deleteProfile(id) {
    await (await this.db()).delete(STORES.USER_DICTIONARY_IMPORT_PROFILES, id);
  }
}

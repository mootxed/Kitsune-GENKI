import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateImportData,
  importFullProgress,
  exportFullProgress,
} from '../src/backup-manager.js';
import { db, initializeDB, STORES } from '../src/db.js';
import { UserDictionaryRepository } from '../src/user-dictionaries/index.js';

describe('Backup Manager Validation & Security', () => {
  beforeEach(async () => {
    localStorage.clear();
    const database = await initializeDB();
    await database.clear(STORES.APP_STATE);
    await database.clear(STORES.CONTENT_CACHE);
    await database.clear(STORES.UI_PREFERENCES);
    await database.clear(STORES.REVIEW_LOG);
    await database.clear(STORES.USER_DICTIONARIES);
    await database.clear(STORES.USER_DICTIONARY_ENTRIES);
    await database.clear(STORES.USER_DICTIONARY_IMPORT_PROFILES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validState = {
    version: 9,
    level: 5,
    xp: 250,
    coins: 100,
    streak: { count: 3, lastActive: '2026-07-26' },
    settings: {
      openrouterKey: 'sk-or-v1-testkey',
      model: 'deepseek/deepseek-v4-flash',
    },
    savedNotes: [{ id: '1', title: 'Note 1', content: 'Test note' }],
  };

  const validBackup = {
    app: 'kotokitsu',
    exportType: 'full_indexeddb',
    schemaVersion: '5.0',
    timestamp: '2026-07-26T12:00:00.000Z',
    data: {
      state: validState,
      lessonVersion: '1.2.0',
      lastActivityDay: '2026-07-26',
      theme: 'dark',
      reviewLog: [
        {
          cardId: 'card-1',
          mode: 'flashcard',
          quality: 5,
          timestamp: 1700000000,
          previousStability: 1,
          previousDifficulty: 5,
          previousState: 0,
        },
      ],
    },
  };

  it('exportFullProgress unconditionally strips API key and tags with kotokitsu', async () => {
    const database = await initializeDB();
    await database.set(STORES.APP_STATE, 'state', validState);

    const exported = await exportFullProgress();
    expect(exported.app).toBe('kotokitsu');
    expect(exported.data.state.settings.openrouterKey).toBe('');
  });

  it('includes user dictionaries and entries in full backup and restores them', async () => {
    const database = await initializeDB();
    await database.set(STORES.APP_STATE, 'state', validState);
    const repository = new UserDictionaryRepository(database);
    const dictionary = await repository.saveDictionary({ name: 'Backup dictionary' });
    const entry = await repository.saveEntry({
      dictionaryId: dictionary.id,
      writing: '猫',
      reading: 'ねこ',
      meanings: ['кошка'],
      learningEnabled: true,
      source: { type: 'manual', label: '', externalId: null },
    });

    const exported = await exportFullProgress();
    expect(exported.schemaVersion).toBe('6.0');
    expect(exported.data.userDictionaries).toHaveLength(1);
    expect(exported.data.userDictionaryEntries[0].learningEnabled).toBe(true);

    await database.clear(STORES.USER_DICTIONARIES);
    await database.clear(STORES.USER_DICTIONARY_ENTRIES);
    const restored = await importFullProgress(exported, false);
    expect(restored.success).toBe(true);
    expect((await repository.listDictionaries())[0].id).toBe(dictionary.id);
    expect((await repository.listEntries(dictionary.id))[0].id).toBe(entry.id);
  });

  it('validates a correct current schema version backup', () => {
    const res = validateImportData(validBackup);
    expect(res.valid).toBe(true);
    expect(res.isLegacy).toBe(false);
    expect(res.data).toBeDefined();
  });

  it('validates legacy schema versions (4.0, 3.0, 2.0)', () => {
    for (const ver of ['4.0', '3.0', '2.0']) {
      const legacyBackup = {
        ...validBackup,
        exportType: 'full_localstorage',
        schemaVersion: ver,
      };
      const res = validateImportData(legacyBackup);
      expect(res.valid).toBe(true);
      expect(res.isLegacy).toBe(true);
    }
  });

  it('rejects backup with invalid exportType', () => {
    const invalid = { ...validBackup, exportType: 'invalid_type' };
    const res = validateImportData(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('exportType');
  });

  it('rejects backup with unsupported schemaVersion', () => {
    const invalid = { ...validBackup, schemaVersion: '1.0' };
    const res = validateImportData(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Несовместимая версия схемы');
  });

  it('rejects backup with non-numeric level or malicious string payload', () => {
    const malicious = {
      ...validBackup,
      data: {
        ...validBackup.data,
        state: {
          ...validState,
          level: '<script>alert(1)</script>',
        },
      },
    };
    const res = validateImportData(malicious);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('data.state.level');
  });

  it('rejects backup with negative xp or negative level', () => {
    const invalid = {
      ...validBackup,
      data: {
        ...validBackup.data,
        state: {
          ...validState,
          xp: -10,
        },
      },
    };
    const res = validateImportData(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('data.state.xp');
  });

  it('rejects backup exceeding array bounds (e.g. savedNotes > 1000 items)', () => {
    const tooManyNotes = Array.from({ length: 1001 }, (_, i) => ({
      id: String(i),
      title: `Note ${i}`,
      content: 'Content',
    }));
    const invalid = {
      ...validBackup,
      data: {
        ...validBackup.data,
        state: {
          ...validState,
          savedNotes: tooManyNotes,
        },
      },
    };
    const res = validateImportData(invalid);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('savedNotes');
  });

  it('performs atomic import successfully', async () => {
    const res = await importFullProgress(validBackup, false);
    expect(res.success).toBe(true);

    const importedState = await db.get(STORES.APP_STATE, 'state');
    expect(importedState.level).toBe(5);
    expect(importedState.xp).toBe(250);

    const importedVersion = await db.get(STORES.CONTENT_CACHE, 'lesson_version');
    expect(importedVersion).toBe('1.2.0');

    const importedTheme = await db.get(STORES.UI_PREFERENCES, 'theme');
    expect(importedTheme).toBe('dark');

    const logs = await db.getAll(STORES.REVIEW_LOG);
    expect(logs.length).toBe(1);
    expect(logs[0].cardId).toBe('card-1');
  });

  it('preserves existing API key when preserveApiKey is true', async () => {
    // Save existing state with custom key
    const initial = { ...validState, settings: { openrouterKey: 'sk-existing-secret-key' } };
    await db.set(STORES.APP_STATE, 'state', initial);

    // Backup to import has a different key
    const backupToImport = {
      ...validBackup,
      data: {
        ...validBackup.data,
        state: {
          ...validState,
          settings: { openrouterKey: 'sk-imported-key' },
        },
      },
    };

    const res = await importFullProgress(backupToImport, true);
    expect(res.success).toBe(true);

    const updatedState = await db.get(STORES.APP_STATE, 'state');
    expect(updatedState.settings.openrouterKey).toBe('sk-existing-secret-key');
  });

  it('always ignores imported openrouterKey from backup payload if preserveApiKey is false', async () => {
    // Current state has a key
    const initial = { ...validState, settings: { openrouterKey: 'sk-existing-secret-key' } };
    await db.set(STORES.APP_STATE, 'state', initial);

    // Backup to import has an old key
    const backupToImport = {
      ...validBackup,
      data: {
        ...validBackup.data,
        state: {
          ...validState,
          settings: { openrouterKey: 'sk-imported-old-key' },
        },
      },
    };

    const res = await importFullProgress(backupToImport, false);
    expect(res.success).toBe(true);

    const updatedState = await db.get(STORES.APP_STATE, 'state');
    expect(updatedState.settings.openrouterKey).toBe('');
  });

  it('clears openrouterKey if current state has no key even if imported backup contains one', async () => {
    // Current state has NO key
    const initial = { ...validState, settings: { openrouterKey: '' } };
    await db.set(STORES.APP_STATE, 'state', initial);

    // Backup to import has an old key from prior version
    const backupToImport = {
      ...validBackup,
      data: {
        ...validBackup.data,
        state: {
          ...validState,
          settings: { openrouterKey: 'sk-imported-old-key' },
        },
      },
    };

    const res = await importFullProgress(backupToImport, true);
    expect(res.success).toBe(true);

    const updatedState = await db.get(STORES.APP_STATE, 'state');
    expect(updatedState.settings.openrouterKey).toBe('');
  });

  it('performs rollback to snapshot if atomic transaction fails', async () => {
    // Set initial state
    const initialState = { ...validState, level: 99, xp: 9999 };
    await db.set(STORES.APP_STATE, 'state', initialState);
    await db.set(STORES.CONTENT_CACHE, 'lesson_version', 'initial-1.0');

    // Mock atomicImport to fail on first call and succeed on rollback
    const spy = vi
      .spyOn(db, 'atomicImport')
      .mockRejectedValueOnce(new Error('IndexedDB Transaction Failed'));

    const res = await importFullProgress(validBackup, false);
    expect(res.success).toBe(false);
    expect(res.error).toContain('IndexedDB Transaction Failed');

    // Verify rollback called
    expect(spy).toHaveBeenCalledTimes(2);

    const currentState = await db.get(STORES.APP_STATE, 'state');
    expect(currentState.level).toBe(99);
    expect(currentState.xp).toBe(9999);
  });
});

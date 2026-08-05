import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOpenRouterKey,
  setOpenRouterKey,
  clearOpenRouterKey,
  migrateLegacyOpenRouterKey,
  purgeLegacyOpenRouterKeys,
} from '../src/openrouter-key.js';
import { createPersistableState, defaultState, resetApplicationData } from '../state/store.js';
import { exportFullProgress, importFullProgress } from '../src/backup-manager.js';
import { initializeDB, db, STORES } from '../src/db.js';

describe('OpenRouter API Key Memory-Only Lifetime & Security', () => {
  const TEST_KEY = 'sk-or-v1-test-secret-key-1234567890abcdef';

  beforeEach(async () => {
    await initializeDB();
    await clearOpenRouterKey();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  });

  it('API key is completely absent from localStorage and IndexedDB after setting key', async () => {
    await setOpenRouterKey(TEST_KEY);
    expect(getOpenRouterKey()).toBe(TEST_KEY);

    // Verify localStorage does not contain key
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('kitsune_openrouter_key')).toBeNull();
      expect(localStorage.getItem('openrouter_api_key')).toBeNull();
    }

    // Verify IndexedDB UI_PREFERENCES does not contain key
    const dbVal = await db.get(STORES.UI_PREFERENCES, 'openrouter_api_key');
    expect(dbVal).toBeUndefined();
  });

  it('purgeLegacyOpenRouterKeys removes legacy copies from localStorage, IndexedDB, and state', async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('kitsune_openrouter_key', TEST_KEY);
    }
    await db.set(STORES.UI_PREFERENCES, 'openrouter_api_key', TEST_KEY);

    const legacyState = defaultState();
    legacyState.settings.openrouterKey = TEST_KEY;

    await purgeLegacyOpenRouterKeys(legacyState);

    expect(legacyState.settings).not.toHaveProperty('openrouterKey');
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('kitsune_openrouter_key')).toBeNull();
    }
    const dbVal = await db.get(STORES.UI_PREFERENCES, 'openrouter_api_key');
    expect(dbVal).toBeUndefined();
  });

  it('migrateLegacyOpenRouterKey purges legacy key from state without saving to persistent storage', async () => {
    const legacyState = defaultState();
    legacyState.settings.openrouterKey = TEST_KEY;

    const result = migrateLegacyOpenRouterKey(legacyState);
    expect(result).toBe(true);
    expect(legacyState.settings).not.toHaveProperty('openrouterKey');

    // Confirm absent from persistent stores
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('kitsune_openrouter_key')).toBeNull();
    }
    const dbVal = await db.get(STORES.UI_PREFERENCES, 'openrouter_api_key');
    expect(dbVal).toBeUndefined();
  });

  it('createPersistableState strips openrouterKey from settings', () => {
    const rawState = defaultState();
    rawState.settings.openrouterKey = TEST_KEY;

    const snapshot = createPersistableState(rawState);
    expect(snapshot.settings).not.toHaveProperty('openrouterKey');
    expect(JSON.stringify(snapshot)).not.toContain('sk-or-v1-');
  });

  it('exportFullProgress does not include the OpenRouter key in backup/export JSON', async () => {
    await setOpenRouterKey(TEST_KEY);
    const mockState = defaultState();
    await db.set(STORES.APP_STATE, 'state', mockState);

    const exportData = await exportFullProgress();
    const exportJson = JSON.stringify(exportData);

    expect(exportJson).not.toContain('sk-or-v1-');
    expect(exportData.data.state.settings).not.toHaveProperty('openrouterKey');
  });

  it('importFullProgress preserves existing in-memory key when preserveApiKey = true', async () => {
    await setOpenRouterKey(TEST_KEY);

    const backupData = {
      app: 'kotokitsu',
      exportType: 'full_indexeddb',
      schemaVersion: '6.0',
      data: {
        state: defaultState(),
      },
    };

    const res = await importFullProgress(backupData, true);
    expect(res.success).toBe(true);
    expect(getOpenRouterKey()).toBe(TEST_KEY);
  });

  it('importFullProgress clears in-memory key when preserveApiKey = false', async () => {
    await setOpenRouterKey(TEST_KEY);

    const backupData = {
      app: 'kotokitsu',
      exportType: 'full_indexeddb',
      schemaVersion: '6.0',
      data: {
        state: defaultState(),
      },
    };

    const res = await importFullProgress(backupData, false);
    expect(res.success).toBe(true);
    expect(getOpenRouterKey()).toBe('');
  });

  it('resetApplicationData clears OpenRouter key', async () => {
    await setOpenRouterKey(TEST_KEY);
    expect(getOpenRouterKey()).toBe(TEST_KEY);

    await resetApplicationData({ skipReload: true });
    expect(getOpenRouterKey()).toBe('');
  });
});

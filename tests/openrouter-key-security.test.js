import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOpenRouterKey,
  setOpenRouterKey,
  clearOpenRouterKey,
  migrateLegacyOpenRouterKey,
} from '../src/openrouter-key.js';
import { createPersistableState, defaultState, resetApplicationData } from '../state/store.js';
import { exportFullProgress, importFullProgress } from '../src/backup-manager.js';
import { renderSettings } from '../ui/settings.js';
import { initializeDB, db, STORES } from '../src/db.js';

describe('OpenRouter API Key Isolation & Security', () => {
  const TEST_KEY = 'sk-or-v1-test-secret-key-1234567890abcdef';

  beforeEach(async () => {
    await initializeDB();
    await clearOpenRouterKey();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('createPersistableState strips openrouterKey from settings', () => {
    const rawState = defaultState();
    rawState.settings.openrouterKey = TEST_KEY;

    const snapshot = createPersistableState(rawState);
    expect(snapshot.settings).not.toHaveProperty('openrouterKey');
    expect(JSON.stringify(snapshot)).not.toContain('sk-or-v1-');
  });

  it('migrateLegacyOpenRouterKey moves legacy key to isolated storage and deletes field from state', () => {
    const legacyState = defaultState();
    legacyState.settings.openrouterKey = TEST_KEY;

    const result = migrateLegacyOpenRouterKey(legacyState);
    expect(result).toBe(true);
    expect(legacyState.settings).not.toHaveProperty('openrouterKey');
    expect(getOpenRouterKey()).toBe(TEST_KEY);
  });

  it('exportFullProgress does not include the OpenRouter key', async () => {
    await setOpenRouterKey(TEST_KEY);
    const mockState = defaultState();
    await db.set(STORES.APP_STATE, 'state', mockState);

    const exportData = await exportFullProgress();
    const exportJson = JSON.stringify(exportData);

    expect(exportJson).not.toContain('sk-or-v1-');
    expect(exportData.data.state.settings).not.toHaveProperty('openrouterKey');
  });

  it('importFullProgress preserves existing key when preserveApiKey = true', async () => {
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

  it('importFullProgress clears key when preserveApiKey = false', async () => {
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

  it('safely renders input in settings via DOM property assignment', async () => {
    await setOpenRouterKey(TEST_KEY);

    document.body.innerHTML = '<div id="settings-body"></div>';
    const stateMock = defaultState();
    const depsMock = { save: () => {}, nav: () => {} };

    renderSettings(stateMock, depsMock);

    const input = document.getElementById('set-key');
    expect(input).not.toBeNull();
    // HTML attribute value should NOT contain the secret
    expect(input.getAttribute('value')).toBe('');
    // DOM property .value contains the secret
    expect(input.value).toBe(TEST_KEY);
  });

  it('resetApplicationData clears OpenRouter key', async () => {
    await setOpenRouterKey(TEST_KEY);
    expect(getOpenRouterKey()).toBe(TEST_KEY);

    await resetApplicationData({ skipReload: true });
    expect(getOpenRouterKey()).toBe('');
  });
});

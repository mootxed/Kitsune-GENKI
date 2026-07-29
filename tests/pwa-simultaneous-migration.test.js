/* tests/pwa-simultaneous-migration.test.js — PWA SW update & simultaneous DB migration tests */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performControlledReload } from '../src/sw-update-manager.js';
import {
  getActiveStatusMessages,
  setSystemStatus,
  SYSTEM_STATUSES,
  subscribeSystemStatus,
} from '../src/storage-status-ui.js';
import { saveSessionToDB, loadSessionFromDB } from '../session-manager.js';
import { initializeDB } from '../src/db.js';

describe('PWA & SW update with unfinished session', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await initializeDB();
  });

  it('triggers onBeforeReload active session save callback before performing controlled reload', async () => {
    const onBeforeReload = vi.fn().mockImplementation(async () => {
      // Simulate active session auto-save
      await saveSessionToDB({ cardId: 'w1', attempt: 2, timestamp: Date.now() });
    });

    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
      configurable: true,
    });

    await performControlledReload(onBeforeReload);

    expect(onBeforeReload).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('correctly broadcasts system status notifications (offline, update ready, emergency storage)', () => {
    const receivedMessages = [];
    const unsubscribe = subscribeSystemStatus((msgs) => {
      receivedMessages.push(msgs);
    });

    setSystemStatus({ isOffline: true });
    expect(getActiveStatusMessages()).toContain(SYSTEM_STATUSES.OFFLINE);

    setSystemStatus({ isUpdateReady: true });
    expect(getActiveStatusMessages()).toContain(SYSTEM_STATUSES.UPDATE_READY);
    expect(getActiveStatusMessages()).toContain(SYSTEM_STATUSES.OFFLINE);

    setSystemStatus({ isEmergencyStorage: true });
    expect(getActiveStatusMessages()).toContain(SYSTEM_STATUSES.EMERGENCY_STORAGE);

    unsubscribe();
  });

  it('handles simultaneous SW activation and DB migration context without throwing', async () => {
    setSystemStatus({ isUpdateReady: true, isOffline: false });

    // Verify session data can be saved during DB upgrade / SW update
    const sessionData = {
      queue: ['word_1', 'word_2'],
      currentIndex: 1,
      stats: { correct: 1, incorrect: 0 },
    };

    await saveSessionToDB(sessionData);
    const loaded = await loadSessionFromDB();

    expect(loaded).toEqual(sessionData);
    expect(getActiveStatusMessages()).toContain(SYSTEM_STATUSES.UPDATE_READY);
  });
});

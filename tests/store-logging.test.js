import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { save, loadState } from '../state/store.js';
import { initializeDB } from '../src/db.js';

describe('Store Logging & Save Debounce Safeguards', () => {
  let logSpy;

  beforeEach(async () => {
    await initializeDB();
    await loadState();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    delete globalThis.__DEV__;
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('does not log success save message to console by default when __DEV__ is false/undefined', async () => {
    await save(true);
    const storeSaveLogs = logSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[Store] ✅ Состояние сохранено')
    );
    expect(storeSaveLogs.length).toBe(0);
  });

  it('logs success save message when __DEV__ is true', async () => {
    globalThis.__DEV__ = true;
    await save(true);
    const storeSaveLogs = logSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[Store] ✅ Состояние сохранено')
    );
    expect(storeSaveLogs.length).toBe(1);
  });
});

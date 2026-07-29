import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionManager,
  saveSessionToDB,
  loadSessionFromDB,
  clearSessionFromDB,
} from '../session-manager.js';
import { SessionBatcher } from '../src/session-batcher.js';
import { restoreActiveSessionRecord, saveActiveSessionState } from '../ui/flashcards/session.js';
import {
  setSessionManager,
  setSessionBatcher,
  setFlashQueue,
  setFlashIdx,
  getSessionManager,
} from '../ui/flashcards/state.js';
import { initializeDB, db, STORES } from '../src/db.js';

describe('SRS Active Session Recovery & Batching', () => {
  beforeEach(async () => {
    await initializeDB();
    if (db && typeof db.clear === 'function') {
      await db.clear(STORES.ACTIVE_SESSION);
    }
    setSessionManager(null);
    setSessionBatcher(null);
    setFlashQueue([]);
    setFlashIdx(0);
  });

  const mockCards = Array.from({ length: 45 }, (_, i) => ({
    id: `card-${i + 1}`,
    word: { id: `card-${i + 1}`, kanji: `漢字${i + 1}`, writing: `かんじ${i + 1}` },
  }));

  it('serializes and restores SessionBatcher state accurately', () => {
    const batcher = new SessionBatcher(mockCards, 20);
    expect(batcher.getTotalBatches()).toBe(3);
    expect(batcher.getCurrentBatchIndex()).toBe(0);

    const serialized = batcher.toSerializableState();
    expect(serialized.batches.length).toBe(3);
    expect(serialized.batches[0].cards.length).toBe(20);
    expect(serialized.batches[2].cards.length).toBe(5);

    const restoredBatcher = new SessionBatcher([]);
    restoredBatcher.restoreFromSerializableState(serialized);
    expect(restoredBatcher.getTotalBatches()).toBe(3);
    expect(restoredBatcher.getCurrentBatch().cards.length).toBe(20);
  });

  it('saves active session immediately after start and round-trips via DB', async () => {
    const batcher = new SessionBatcher(mockCards.slice(0, 5), 20);
    const organized = batcher.organizeBatch(batcher.getCurrentBatch().cards);
    const manager = new SessionManager(organized);

    setSessionBatcher(batcher);
    setSessionManager(manager);
    setFlashQueue(organized);
    setFlashIdx(0);

    await saveActiveSessionState();

    const saved = await loadSessionFromDB();
    expect(saved).not.toBeNull();
    expect(saved.schemaVersion).toBe(1);
    expect(saved.managerState.queue.length).toBe(5);
  });

  it('restores a multi-batch session (20 + 20 + 5) at batch 2 without losing unstarted batches', async () => {
    const batcher = new SessionBatcher(mockCards, 20);
    batcher.moveToNextBatch(); // move to batch 1 (cards 20-39)

    const batchCards = batcher.getCurrentBatch().cards;
    const organized = batcher.organizeBatch(batchCards);
    const manager = new SessionManager(organized);

    setSessionBatcher(batcher);
    setSessionManager(manager);
    setFlashQueue(organized);
    setFlashIdx(2);

    await saveActiveSessionState();

    const savedData = await loadSessionFromDB();
    expect(savedData.currentBatchIndex).toBe(1);
    expect(savedData.totalBatches).toBe(3);

    setSessionManager(null);
    setSessionBatcher(null);

    const stateMock = {
      srs: Object.fromEntries(mockCards.map((c) => [c.id, { id: c.id, state: 0, reps: 0 }])),
    };
    const depsMock = { LESSONS: [] };

    const restored = await restoreActiveSessionRecord(savedData, stateMock, depsMock);
    expect(restored).toBe(true);

    const activeManager = getSessionManager();
    expect(activeManager).not.toBeNull();
    expect(activeManager.queue.length).toBe(20);
  });

  it('Refinement #8: pending save -> clearSessionFromDB() -> pending save completes (record remains cleared)', async () => {
    const manager = new SessionManager(mockCards.slice(0, 3));
    setSessionManager(manager);

    const savePromise = saveSessionToDB({
      schemaVersion: 1,
      managerState: manager.toSerializableState(),
    });

    await clearSessionFromDB();
    await savePromise;

    const record = await loadSessionFromDB();
    expect(record).toBeNull();
  });

  it('skips missing cards and recalculates stats cleanly (Refinement #2)', async () => {
    const manager = new SessionManager(mockCards.slice(0, 5));
    const serialized = manager.toSerializableState();

    // Available cards map has only 3 cards out of 5
    const cardsMap = new Map([
      ['card-1', mockCards[0]],
      ['card-2', mockCards[1]],
      ['card-3', mockCards[2]],
    ]);

    const restoredManager = new SessionManager([]);
    const success = restoredManager.restoreFromSerializableState(serialized, cardsMap);

    expect(success).toBe(true);
    expect(restoredManager.queue.length).toBe(3);
    expect(restoredManager.stats.total).toBe(3);
    expect(restoredManager.stats.remaining).toBe(3);
  });

  it('rejects completely invalid/empty session record without crash', async () => {
    const stateMock = { srs: {} };
    const depsMock = { LESSONS: [] };

    const success = await restoreActiveSessionRecord(
      { managerState: { queue: [] } },
      stateMock,
      depsMock
    );
    expect(success).toBe(false);

    const cleared = await loadSessionFromDB();
    expect(cleared).toBeNull();
  });
});

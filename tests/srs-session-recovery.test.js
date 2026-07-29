import { describe, it, expect, beforeEach } from 'vitest';
import {
  SessionManager,
  saveSessionToDB,
  loadSessionFromDB,
  clearSessionFromDB,
  validateSessionRecord,
} from '../session-manager.js';
import { SessionBatcher } from '../src/session-batcher.js';
import {
  restoreActiveSessionRecord,
  saveActiveSessionState,
  startNextBatchIfAny,
  abandonActiveSession,
} from '../ui/flashcards/session.js';
import { getSessionRecoverySummary } from '../ui/session-recovery-modal.js';
import {
  setSessionManager,
  setSessionBatcher,
  setFlashQueue,
  setFlashIdx,
  getSessionManager,
  sessionBatcher,
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

  it('calculates getSessionRecoverySummary accurately for multi-batch 20+20+5', () => {
    const batcher = new SessionBatcher(mockCards, 20);
    const batch1Cards = batcher.organizeBatch(batcher.batches[1].cards);
    const manager = new SessionManager(batch1Cards);

    // Answer 2 cards in current batch
    manager.answerCard('card-21', 3, {});
    manager.answerCard('card-22', 3, {});

    const sessionRecord = {
      managerState: manager.toSerializableState(),
      batcherState: batcher.toSerializableState(),
      currentBatchIndex: 1,
      totalBatches: 3,
      sessionType: 'srs',
    };

    const summary = getSessionRecoverySummary(sessionRecord);
    expect(summary.reviewed).toBe(22); // 20 from batch 0 + 2 from batch 1
    expect(summary.remaining).toBe(23); // 18 left in batch 1 + 5 from batch 2
    expect(summary.total).toBe(45);
  });

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

  it('restores a multi-batch session (20 + 20 + 5) at batch 2, completes it, advances to batch 3, finishes and cleans up DB', async () => {
    const batcher = new SessionBatcher(mockCards, 20);
    batcher.moveToNextBatch(); // move to batch 1 (cards 20-39)

    const batchCards = batcher.getCurrentBatch().cards;
    const organized = batcher.organizeBatch(batchCards);
    const manager = new SessionManager(organized);

    setSessionBatcher(batcher);
    setSessionManager(manager);
    setFlashQueue(organized);
    setFlashIdx(0);

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

    // Complete batch 2 (all 20 cards)
    for (const item of activeManager.queue) {
      activeManager.answerCard(item.card.id, 3, stateMock.srs);
    }
    expect(activeManager.isSessionComplete()).toBe(true);

    // Advance to next batch (batch 3)
    const hasNext = startNextBatchIfAny(stateMock, depsMock);
    expect(hasNext).toBe(true);

    const batch3Manager = getSessionManager();
    expect(batch3Manager).not.toBeNull();
    expect(batch3Manager.queue.length).toBe(5);
    expect(sessionBatcher.getCurrentBatchIndex()).toBe(2);

    // Complete batch 3 (all 5 cards)
    for (const item of batch3Manager.queue) {
      batch3Manager.answerCard(item.card.id, 3, stateMock.srs);
    }
    expect(batch3Manager.isSessionComplete()).toBe(true);

    // Save state after finishing final batch
    await saveActiveSessionState();

    // Verify DB cleared
    const record = await loadSessionFromDB();
    expect(record).toBeNull();
  });

  it('abandonActiveSession clears state and IndexedDB record', async () => {
    const manager = new SessionManager(mockCards.slice(0, 3));
    setSessionManager(manager);
    await saveActiveSessionState();

    const saved = await loadSessionFromDB();
    expect(saved).not.toBeNull();

    await abandonActiveSession();

    expect(getSessionManager()).toBeNull();
    const record = await loadSessionFromDB();
    expect(record).toBeNull();
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

  it('validates session record schema and structure using validateSessionRecord', () => {
    expect(validateSessionRecord(null)).toBe(false);
    expect(validateSessionRecord({})).toBe(false);
    expect(validateSessionRecord({ schemaVersion: 2 })).toBe(false);

    // Valid record
    const valid = {
      schemaVersion: 1,
      managerState: { queue: [{ cardId: 'c1' }], stats: { reviewed: 1, remaining: 2, total: 3 } },
      batcherState: { batches: [{ cards: ['c1'] }] },
      currentBatchIndex: 0,
    };
    expect(validateSessionRecord(valid)).toBe(true);

    // Invalid batch index out of bounds
    const invalidIndex = { ...valid, currentBatchIndex: 5 };
    expect(validateSessionRecord(invalidIndex)).toBe(false);

    // Negative stats
    const invalidStats = {
      ...valid,
      managerState: { queue: [{ cardId: 'c1' }], stats: { reviewed: -1 } },
    };
    expect(validateSessionRecord(invalidStats)).toBe(false);
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

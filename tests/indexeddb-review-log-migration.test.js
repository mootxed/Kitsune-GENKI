import { beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, STORES } from '../src/db.js';
import { clearReviewLogs, getReviewLogsForCard } from '../src/review-log.js';

describe('IndexedDB review_log migration v16', () => {
  beforeEach(async () => {
    await clearReviewLogs();
  });

  it('migrates legacy card and item references in review_log idempotently', async () => {
    const database = await initializeDB();

    const legacyEvents = [
      {
        id: 101,
        eventId: 'evt-001',
        cardId: 'L1_V023',
        itemId: 'L1_V023',
        skill: 'recognition',
        mode: 'recognition',
        firstAttemptCorrect: true,
        mistakes: 0,
        hintUsed: false,
        responseTimeMs: 1200,
        rawRating: 5,
        effectiveRating: 5,
        reviewedAt: 1700000000000,
        fsrs: { rating: 4, state: 2, stability: 5.0, difficulty: 3.0, review: 1700000000000 },
        undoneAt: null,
      },
      {
        id: 102,
        eventId: 'evt-002',
        cardId: 'L1_V023::recall',
        itemId: 'L1_V023',
        skill: 'recall',
        mode: 'recall',
        firstAttemptCorrect: true,
        mistakes: 0,
        hintUsed: false,
        responseTimeMs: 900,
        rawRating: 4,
        effectiveRating: 4,
        reviewedAt: 1700000010000,
        fsrs: { rating: 3, state: 2, stability: 5.5, difficulty: 3.0, review: 1700000010000 },
        undoneAt: null,
      },
      {
        id: 103,
        eventId: 'evt-003',
        cardId: 'L1_V023::reading-writing',
        itemId: 'L1_V023',
        skill: 'writing',
        mode: 'reading-writing',
        firstAttemptCorrect: false,
        mistakes: 1,
        hintUsed: true,
        responseTimeMs: 3500,
        rawRating: 3,
        effectiveRating: 3,
        reviewedAt: 1700000020000,
        fsrs: { rating: 2, state: 1, stability: 1.0, difficulty: 6.0, review: 1700000020000 },
        undoneAt: null,
      },
      {
        id: 104,
        eventId: 'evt-004',
        cardId: 'L1_V023::context-production',
        itemId: 'L1_V023',
        skill: 'production',
        mode: 'context-production',
        firstAttemptCorrect: true,
        mistakes: 0,
        hintUsed: false,
        responseTimeMs: 2100,
        rawRating: 4,
        effectiveRating: 4,
        reviewedAt: 1700000030000,
        fsrs: { rating: 3, state: 2, stability: 6.0, difficulty: 3.0, review: 1700000030000 },
        undoneAt: null,
      },
      {
        id: 105,
        eventId: 'evt-005',
        eventType: 'undo',
        targetEventId: 'evt-003',
        cardId: 'L1_V023::reading-writing',
        itemId: 'L1_V023',
        skill: 'writing',
        mode: 'reading-writing',
        firstAttemptCorrect: false,
        mistakes: 1,
        hintUsed: true,
        responseTimeMs: 3500,
        rawRating: 3,
        effectiveRating: 3,
        reviewedAt: 1700000040000,
        fsrs: { rating: 2, state: 1, stability: 1.0, difficulty: 6.0, review: 1700000040000 },
        undoneAt: null,
      },
    ];

    if (typeof database.putRecord === 'function') {
      for (const legacy of legacyEvents) {
        await database.putRecord(STORES.REVIEW_LOG, legacy);
      }
      await database.delete(STORES.APP_STATE, 'review_log_migration_v16');
      await database.runReviewLogMigration();
    }

    const globalId = 'jp-word:学生:がくせい';
    const logs = await getReviewLogsForCard(globalId);

    expect(logs.length).toBe(1);
    expect(logs[0].cardId).toBe(globalId);
    expect(logs[0].itemId).toBe(globalId);
    expect(logs[0].eventId).toBe('evt-001');

    const recallLogs = await getReviewLogsForCard(`${globalId}::recall`);
    expect(recallLogs.length).toBe(1);
    expect(recallLogs[0].cardId).toBe(`${globalId}::recall`);

    if (typeof database.runReviewLogMigration === 'function') {
      await database.runReviewLogMigration();
    }
    const secondRunLogs = await getReviewLogsForCard(globalId);
    expect(secondRunLogs.length).toBe(1);
  });
});

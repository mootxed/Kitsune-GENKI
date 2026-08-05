/* src/schemas/active-session.js — Unified active session parsing & migration pipeline */

import { ACTIVE_SESSION_SCHEMA_VERSION } from '../app-metadata.js';
import { canonicalizeCardId, canonicalLessonId } from '../courses/course-context.js';
import { ActiveSessionV1Schema } from './active-session-v1.js';
import { ActiveSessionV2Schema } from './active-session-v2.js';

export { ACTIVE_SESSION_SCHEMA_VERSION };

/**
 * Парсит и при необходимости мигрирует запись активной сессии.
 *
 * @param {unknown} rawSession Исходный объект сессии из IndexedDB
 * @returns {{
 *   success: boolean,
 *   data?: object,
 *   sourceVersion?: number,
 *   targetVersion?: number,
 *   warnings?: string[],
 *   code?: string,
 *   issues?: object[],
 *   recoverable?: boolean
 * }}
 */
export function parseAndMigrateActiveSession(rawSession) {
  if (!rawSession || typeof rawSession !== 'object') {
    return {
      success: false,
      code: 'INVALID_ACTIVE_SESSION',
      issues: [{ message: 'Raw session record must be a non-null object' }],
      recoverable: false,
    };
  }

  const hasQueue =
    Array.isArray(rawSession.queue) ||
    Array.isArray(rawSession.managerState?.queue) ||
    Array.isArray(rawSession.sessionOrigin?.initialCardIds);

  if (!hasQueue) {
    return {
      success: false,
      code: 'INVALID_ACTIVE_SESSION',
      issues: [{ message: 'Active session record must contain a card queue' }],
      recoverable: false,
    };
  }

  const inputVersion = rawSession.schemaVersion ?? 1;

  // Если сессия уже схемы v2
  if (inputVersion === 2) {
    const parseResult = ActiveSessionV2Schema.safeParse(rawSession);
    if (parseResult.success) {
      return {
        success: true,
        data: parseResult.data,
        sourceVersion: 2,
        targetVersion: 2,
        warnings: [],
      };
    }
    return {
      success: false,
      code: 'INVALID_ACTIVE_SESSION',
      issues: parseResult.error.issues,
      recoverable: false,
    };
  }

  // Если сессия v1 (или без указания версии)
  const v1ParseResult = ActiveSessionV1Schema.safeParse(rawSession);
  if (!v1ParseResult.success) {
    return {
      success: false,
      code: 'INVALID_ACTIVE_SESSION',
      issues: v1ParseResult.error.issues,
      recoverable: false,
    };
  }

  // Миграция v1 → v2
  try {
    const warnings = [];
    const v1Data = v1ParseResult.data;

    const createdAt =
      typeof v1Data.createdAt === 'string'
        ? Date.parse(v1Data.createdAt) || Date.now()
        : Number(v1Data.createdAt) || Date.now();

    const updatedAt =
      typeof v1Data.updatedAt === 'string'
        ? Date.parse(v1Data.updatedAt) || createdAt
        : Number(v1Data.updatedAt) || createdAt;

    const rawQueue = Array.isArray(v1Data.managerState?.queue)
      ? v1Data.managerState.queue
      : Array.isArray(v1Data.queue)
        ? v1Data.queue
        : [];

    const migratedQueue = rawQueue.map((item) => {
      if (typeof item === 'string') {
        const cardId = canonicalizeCardId(item);
        return {
          cardId,
          sessionLapses: 0,
          isFirstAttempt: true,
          completed: false,
          forcedMode: null,
        };
      }
      const cardId = canonicalizeCardId(item.cardId || item.card?.id || 'unknown_card');
      const cardObj = item.card && typeof item.card === 'object' ? { ...item.card } : undefined;
      if (cardObj?.id) cardObj.id = canonicalizeCardId(cardObj.id);

      return {
        cardId,
        card: cardObj,
        sessionLapses: Number(item.sessionLapses) || 0,
        isFirstAttempt: item.isFirstAttempt !== false,
        completed: Boolean(item.completed),
        forcedMode: item.forcedMode || null,
      };
    });

    const rawStats = v1Data.managerState?.stats || v1Data.stats || {};

    const totalCount = rawStats.total != null ? Number(rawStats.total) : migratedQueue.length;
    const reviewedCount = rawStats.reviewed != null ? Number(rawStats.reviewed) : 0;
    const attemptedCount = rawStats.attempted != null ? Number(rawStats.attempted) : reviewedCount;
    const perfectCount = rawStats.perfect != null ? Number(rawStats.perfect) : 0;
    const relearnedCount = rawStats.relearned != null ? Number(rawStats.relearned) : 0;
    const remainingCount =
      rawStats.remaining != null
        ? Number(rawStats.remaining)
        : Math.max(0, totalCount - reviewedCount);

    const chapterId = v1Data.chapterId != null ? canonicalLessonId(v1Data.chapterId) : null;
    const originChapterId =
      v1Data.sessionOrigin?.chapterId != null
        ? canonicalLessonId(v1Data.sessionOrigin.chapterId)
        : null;

    const initialCardIds = Array.isArray(v1Data.sessionOrigin?.initialCardIds)
      ? v1Data.sessionOrigin.initialCardIds.map(canonicalizeCardId)
      : migratedQueue.map((q) => q.cardId);

    const currentIndex =
      v1Data.managerState?.currentIndex != null
        ? Number(v1Data.managerState.currentIndex)
        : v1Data.currentIndex != null
          ? Number(v1Data.currentIndex)
          : 0;

    const v2Candidate = {
      schemaVersion: 2,
      sessionId: v1Data.sessionId || `session_${createdAt}`,
      sessionType: v1Data.sessionType || (chapterId ? 'chapter' : 'srs'),
      chapterId,
      sessionOrigin: {
        type: v1Data.sessionOrigin?.type || (chapterId ? 'chapter' : 'srs'),
        chapterId: originChapterId,
        initialCardIds,
      },
      createdAt,
      updatedAt: Math.max(updatedAt, createdAt),
      managerState: {
        queue: migratedQueue,
        stats: {
          total: totalCount,
          reviewed: reviewedCount,
          attempted: attemptedCount,
          perfect: perfectCount,
          relearned: relearnedCount,
          remaining: remainingCount,
        },
        currentIndex,
        backtrackSteps: v1Data.managerState?.backtrackSteps || { 0: 10 },
      },
      batcherState: v1Data.batcherState || null,
      currentBatchIndex: Number(v1Data.currentBatchIndex) || 0,
      totalBatches: Number(v1Data.totalBatches) || 1,
      flashState: v1Data.flashState || null,
    };

    // Copy through any additional fields for custom legacy objects (e.g. test: 123)
    Object.keys(v1Data).forEach((key) => {
      if (!(key in v2Candidate)) {
        v2Candidate[key] = v1Data[key];
      }
    });

    const v2ParseResult = ActiveSessionV2Schema.safeParse(v2Candidate);
    if (v2ParseResult.success) {
      return {
        success: true,
        data: v2Candidate,
        sourceVersion: inputVersion,
        targetVersion: 2,
        warnings,
      };
    }

    return {
      success: false,
      code: 'INVALID_ACTIVE_SESSION',
      issues: v2ParseResult.error.issues,
      recoverable: false,
    };
  } catch (err) {
    return {
      success: false,
      code: 'INVALID_ACTIVE_SESSION',
      issues: [{ message: `Migration error: ${err?.message || err}` }],
      recoverable: false,
    };
  }
}

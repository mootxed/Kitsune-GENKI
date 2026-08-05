/* src/schemas/active-session-v2.js — Zod validation schema for Active Session v2 */

import { z } from 'zod';

const NonNegativeInt = z.number().int().min(0);

export const ActiveSessionV2QueueItemSchema = z
  .object({
    cardId: z.string().min(1),
    card: z.record(z.string(), z.any()).nullable().optional(),
    sessionLapses: NonNegativeInt.default(0),
    isFirstAttempt: z.boolean().default(true),
    completed: z.boolean().default(false),
    skipped: z.boolean().default(false).optional(),
    forcedMode: z.string().nullable().optional(),
  })
  .passthrough();

export const ActiveSessionV2StatsSchema = z
  .object({
    total: NonNegativeInt,
    reviewed: NonNegativeInt.default(0),
    attempted: NonNegativeInt.default(0),
    perfect: NonNegativeInt.default(0),
    relearned: NonNegativeInt.default(0),
    remaining: NonNegativeInt.default(0),
  })
  .passthrough();

export const ActiveSessionV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    sessionId: z.string().min(1).default('session_default'),
    sessionType: z.enum(['srs', 'chapter', 'custom', 'practice']).or(z.string()).default('srs'),
    chapterId: z.union([z.string(), z.number()]).nullable().optional(),
    sessionOrigin: z
      .object({
        type: z.string(),
        chapterId: z.union([z.string(), z.number()]).nullable().optional(),
        initialCardIds: z.array(z.string()),
      })
      .optional(),
    createdAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
    managerState: z.object({
      queue: z.array(ActiveSessionV2QueueItemSchema),
      stats: ActiveSessionV2StatsSchema,
      currentIndex: NonNegativeInt.default(0),
      backtrackSteps: z.record(z.string(), z.number()).optional(),
    }),
    batcherState: z
      .object({
        batches: z.array(z.any()),
        totalCards: z.array(z.any()).optional(),
        currentBatchIndex: NonNegativeInt.optional(),
        batchSize: NonNegativeInt.optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    currentBatchIndex: NonNegativeInt.default(0),
    totalBatches: z.number().int().min(1).default(1),
    flashState: z
      .object({
        flashIdx: NonNegativeInt.default(0),
        flashRevealed: z.boolean().default(false),
        activePracticeMode: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    // 1. currentIndex within queue bounds
    const queueLen = data.managerState.queue.length;
    if (queueLen > 0 && data.managerState.currentIndex > queueLen) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `currentIndex (${data.managerState.currentIndex}) exceeds queue length (${queueLen})`,
        path: ['managerState', 'currentIndex'],
      });
    }

    // 2. Timestamps logical order
    if (data.updatedAt < data.createdAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `updatedAt (${data.updatedAt}) is earlier than createdAt (${data.createdAt})`,
        path: ['updatedAt'],
      });
    }

    // 3. Stats sum checks
    const { total, perfect, relearned } = data.managerState.stats;
    if (perfect + relearned > total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `perfect (${perfect}) + relearned (${relearned}) exceeds total (${total})`,
        path: ['managerState', 'stats'],
      });
    }

    // 4. Batcher index bounds
    if (data.batcherState && Array.isArray(data.batcherState.batches)) {
      const numBatches = data.batcherState.batches.length;
      if (numBatches > 0 && data.currentBatchIndex >= numBatches) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `currentBatchIndex (${data.currentBatchIndex}) is out of bounds for batches (${numBatches})`,
          path: ['currentBatchIndex'],
        });
      }
    }
  });

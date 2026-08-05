/* src/schemas/active-session-v1.js — Zod validation schema for Active Session v1 */

import { z } from 'zod';

const NonNegativeNumber = z.number().min(0);

export const ActiveSessionV1Schema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]).optional(),
    sessionType: z.string().optional(),
    chapterId: z.union([z.string(), z.number()]).nullable().optional(),
    sessionOrigin: z
      .object({
        type: z.string().optional(),
        chapterId: z.union([z.string(), z.number()]).nullable().optional(),
        initialCardIds: z.array(z.string()).optional(),
      })
      .optional(),
    createdAt: z.union([z.number(), z.string()]).optional(),
    updatedAt: z.union([z.number(), z.string()]).optional(),
    managerState: z
      .object({
        queue: z.array(z.any()).optional(),
        stats: z
          .object({
            total: NonNegativeNumber.optional(),
            reviewed: NonNegativeNumber.optional(),
            attempted: NonNegativeNumber.optional(),
            perfect: NonNegativeNumber.optional(),
            relearned: NonNegativeNumber.optional(),
            remaining: NonNegativeNumber.optional(),
            correct: NonNegativeNumber.optional(),
            incorrect: NonNegativeNumber.optional(),
          })
          .passthrough()
          .optional(),
        currentIndex: z.number().optional(),
        backtrackSteps: z.record(z.string(), z.number()).optional(),
      })
      .optional(),
    queue: z.array(z.any()).optional(),
    stats: z
      .object({
        total: NonNegativeNumber.optional(),
        reviewed: NonNegativeNumber.optional(),
        attempted: NonNegativeNumber.optional(),
        perfect: NonNegativeNumber.optional(),
        relearned: NonNegativeNumber.optional(),
        remaining: NonNegativeNumber.optional(),
        correct: NonNegativeNumber.optional(),
        incorrect: NonNegativeNumber.optional(),
      })
      .passthrough()
      .optional(),
    currentIndex: z.number().optional(),
    batcherState: z
      .object({
        batches: z.array(z.any()),
        totalCards: z.array(z.any()).optional(),
      })
      .nullable()
      .optional(),
    currentBatchIndex: z.number().optional(),
    totalBatches: z.number().optional(),
    flashState: z
      .object({
        flashIdx: z.number().optional(),
        flashRevealed: z.boolean().optional(),
        activePracticeMode: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

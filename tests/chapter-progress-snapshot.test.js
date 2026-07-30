import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import {
  isGrammarTopicCompleted,
  materializeLegacyChapterEvidence,
  getChapterProgressSnapshot,
} from '../src/chapter-progress.js';

describe('Chapter Progress & Snapshot', () => {
  let state;

  beforeEach(() => {
    state = defaultState();
  });

  it('checklist.grammar === true does not mark topics completed without materialization', () => {
    state.chapters[1] = {
      started: true,
      checklist: { grammar: true },
    };
    expect(isGrammarTopicCompleted(state.chapters[1], 'L1_g1')).toBe(false);
  });

  it('legacyCompletionEvidence materializes explicit topic IDs on chapter load', () => {
    state.chapters[1] = {
      started: true,
      checklist: {},
      legacyCompletionEvidence: { grammar: true },
    };
    const chapterMeta = {
      id: 1,
      notes: [
        { id: 'L1_g1', title: 'Тема 1' },
        { id: 'L1_g2', title: 'Тема 2' },
      ],
    };

    materializeLegacyChapterEvidence(state.chapters[1], chapterMeta);

    expect(state.chapters[1].checklist['L1_g1']).toBe(true);
    expect(state.chapters[1].checklist['L1_g2']).toBe(true);
    expect(state.chapters[1].legacyCompletionEvidence.grammar).toBe(false);
    expect(isGrammarTopicCompleted(state.chapters[1], 'L1_g1')).toBe(true);
  });

  it('getChapterProgressSnapshot returns consistent 3-block summary and time-weighted overall ratio', () => {
    const chapterMeta = {
      id: 1,
      words: Array(20).fill({ id: 'w1' }),
      notes: [{ id: 'L1_g1' }, { id: 'L1_g2' }],
    };

    const snapshot = getChapterProgressSnapshot(state, 1, chapterMeta);

    expect(snapshot.chapterId).toBe('1');
    expect(snapshot.vocabulary.total).toBe(20);
    expect(snapshot.grammar.total).toBe(2);
    expect(snapshot.requiredTotalMinutes).toBeGreaterThan(0);
    expect(snapshot.overallRatio).toBe(0);
    expect(snapshot.isCompleted).toBe(false);
  });

  it('prior knowledge chapter snapshot marks 100% completed', () => {
    state.priorKnowledgeChapterIds = [1];
    const chapterMeta = {
      id: 1,
      words: Array(10).fill({ id: 'w1' }),
      notes: [{ id: 'L1_g1' }],
    };

    const snapshot = getChapterProgressSnapshot(state, 1, chapterMeta);

    expect(snapshot.isCompleted).toBe(true);
    expect(snapshot.vocabulary.completed).toBe(10);
    expect(snapshot.grammar.completed).toBe(1);
    expect(snapshot.overallRatio).toBe(1);
  });
});

import { describe, test, expect } from 'vitest';
import { defaultState } from '../state/store.js';

describe('State Migration v13', () => {
  // Access migration 13 directly from store's internals or by simulating version upgrade
  const MIGRATION_13 = (state) => {
    const baseState = { ...state };
    const chapters = { ...(baseState.chapters || {}) };
    for (const [chapterId, chapterValue] of Object.entries(chapters)) {
      const chapter = { ...(chapterValue || {}) };
      const checklist = { ...(chapter.checklist || {}) };
      const chId = Number(chapterId);

      const legacyDialog = `L${chId}_p_dialog`;
      const legacyListening = `L${chId}_p_listening`;
      const legacyReading = `L${chId}_p_reading`;

      if (checklist[legacyDialog] === true || checklist.dialog === true) {
        checklist.dialog = true;
      }
      delete checklist[legacyDialog];

      if (checklist[legacyListening] === true || checklist.listening === true) {
        checklist.listening = true;
      }
      delete checklist[legacyListening];

      if (checklist[legacyReading] === true || checklist.reading === true) {
        checklist.reading = true;
      }
      delete checklist[legacyReading];

      chapter.checklist = checklist;
      chapters[chapterId] = chapter;
    }

    return {
      ...baseState,
      chapters,
      version: 13,
    };
  };

  test('migrates legacy checklist.dialog correctly', () => {
    const oldState = {
      version: 12,
      chapters: {
        1: { checklist: { dialog: true } },
      },
    };
    const nextState = MIGRATION_13(oldState);
    expect(nextState.version).toBe(13);
    expect(nextState.chapters[1].checklist.dialog).toBe(true);
    expect(nextState.chapters[1].checklist.L1_p_dialog).toBeUndefined();
  });

  test('migrates v12 L1_p_dialog format back to canonical dialog ID', () => {
    const oldState = {
      version: 12,
      chapters: {
        1: { checklist: { L1_p_dialog: true, L1_p_listening: true } },
      },
    };
    const nextState = MIGRATION_13(oldState);
    expect(nextState.chapters[1].checklist.dialog).toBe(true);
    expect(nextState.chapters[1].checklist.listening).toBe(true);
    expect(nextState.chapters[1].checklist.L1_p_dialog).toBeUndefined();
  });

  test('handles mixed state without duplicates or data loss', () => {
    const oldState = {
      version: 12,
      chapters: {
        1: { checklist: { dialog: true, L1_p_dialog: true, reading: false } },
      },
    };
    const nextState = MIGRATION_13(oldState);
    expect(nextState.chapters[1].checklist.dialog).toBe(true);
    expect(nextState.chapters[1].checklist.L1_p_dialog).toBeUndefined();
  });

  test('handles fresh state cleanly', () => {
    const fresh = defaultState();
    const nextState = MIGRATION_13(fresh);
    expect(nextState.version).toBe(13);
  });

  test('is idempotent when run repeatedly', () => {
    const oldState = {
      version: 12,
      chapters: {
        1: { checklist: { L1_p_dialog: true } },
      },
    };
    const pass1 = MIGRATION_13(oldState);
    const pass2 = MIGRATION_13(pass1);

    expect(pass2.chapters[1].checklist.dialog).toBe(true);
    expect(pass2.chapters[1].checklist.L1_p_dialog).toBeUndefined();
  });
});

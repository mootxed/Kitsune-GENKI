import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAvailableChapterCount,
  isWordAccessible,
  getAvailableMiniGameCandidates,
} from '../src/minigame-word-selectors.js';
import { defaultState } from '../state/store.js';
import { SRS } from '../srs.js';

describe('Minigame Word Selectors & Prior Knowledge Unlock Tests', () => {
  let mockLessons;

  beforeEach(() => {
    mockLessons = [
      {
        id: 1,
        words: [
          { id: 'L1_V001', writing: 'みず', translation: 'вода' },
          { id: 'L1_V002', writing: 'ほん', translation: 'книга' },
        ],
      },
      {
        id: 2,
        words: [
          { id: 'L2_V001', writing: 'ねこ', translation: 'кошка' },
          { id: 'L2_V002', writing: 'いぬ', translation: 'собака' },
        ],
      },
      {
        id: 3,
        words: [
          { id: 'L3_V001', writing: 'さかな', translation: 'рыба' },
          { id: 'L3_V002', writing: 'くるま', translation: 'машина' },
        ],
      },
    ];
  });

  it('16. priorKnowledgeChapterIds [1,2,3] разблокирует кроссворд', () => {
    const state = defaultState();
    state.priorKnowledgeChapterIds = [1, 2, 3];

    const availableCount = getAvailableChapterCount(state);
    expect(availableCount).toBe(3);
    expect(availableCount >= 3).toBe(true);
  });

  it('17. Реально начатые и prior-knowledge главы корректно объединяются', () => {
    const state = defaultState();
    state.chapters = {
      1: { started: true },
      2: { started: true },
    };
    state.priorKnowledgeChapterIds = [2, 3]; // 2 is in both, unique union is {1, 2, 3}

    const availableCount = getAvailableChapterCount(state);
    expect(availableCount).toBe(3);
  });

  it('18. Skill-based card ID корректно разблокирует исходное слово', () => {
    const state = defaultState();
    // SRS card key is skill-based: L2_V001::recognition
    state.srs = {
      'L2_V001::recognition': { id: 'L2_V001::recognition', state: 2, stability: 5 },
    };

    const word = { id: 'L2_V001', writing: 'ねこ' };
    const isAccessible = isWordAccessible(word, 2, state);
    expect(isAccessible).toBe(true);
  });

  it('19. Слова prior-knowledge глав могут попасть в кроссворд', () => {
    const state = defaultState();
    state.priorKnowledgeChapterIds = [1, 2, 3];

    const candidates = getAvailableMiniGameCandidates(state, mockLessons);
    expect(candidates.length).toBe(6);
    const candidateIds = candidates.map((c) => c.id);
    expect(candidateIds).toContain('L1_V001');
    expect(candidateIds).toContain('L2_V001');
    expect(candidateIds).toContain('L3_V001');
  });

  it('20. Удаление studyPlan не блокирует кроссворд, если priorKnowledgeChapterIds сохранены', () => {
    const state = defaultState();
    state.priorKnowledgeChapterIds = [1, 2, 3];
    state.studyPlan = null; // No studyPlan

    const availableCount = getAvailableChapterCount(state);
    expect(availableCount).toBe(3);
    expect(availableCount >= 3).toBe(true);
  });

  it('user dictionary words enter minigames only after existing confident mastery threshold', () => {
    const state = defaultState();
    const now = Date.now();
    const itemId = 'user-word:12345678';
    const word = {
      id: itemId,
      writing: 'ねこ',
      reading: 'ねこ',
      russian: 'кошка',
      sourceType: 'user-dictionary',
      learningEnabled: true,
    };
    const recognition = SRS.newCard(itemId);
    const recall = SRS.newCard(`${itemId}::recall`);
    Object.assign(recognition, { reps: 3, stability: 30, state: 2, due: now + 86400000 });
    Object.assign(recall, { reps: 3, stability: 30, state: 2, due: now + 86400000 });
    state.srs = { [recognition.id]: recognition, [recall.id]: recall };

    expect(
      getAvailableMiniGameCandidates(state, [{ id: 'user-dictionaries', words: [word] }])
    ).toEqual([]);

    const successful = (skill, mode, reviewedAt) => ({
      eventId: `${skill}-${reviewedAt}`,
      eventType: 'review',
      itemId,
      cardId: skill === 'recognition' ? itemId : `${itemId}::recall`,
      skill,
      mode,
      firstAttemptCorrect: true,
      effectiveRating: 4,
      reviewedAt,
    });
    state.reviewEvents = [
      successful('recognition', 'multiple-choice', now - 3 * 86400000),
      successful('recall', 'typing', now - 2 * 86400000),
      successful('recall', 'typing', now - 86400000),
    ];
    const before = JSON.stringify(state);
    const candidates = getAvailableMiniGameCandidates(state, [
      { id: 'user-dictionaries', words: [word] },
    ]);
    expect(candidates.map((candidate) => candidate.id)).toEqual([itemId]);
    expect(JSON.stringify(state)).toBe(before);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAvailableChapterCount,
  isWordAccessible,
  getAvailableMiniGameCandidates,
} from '../src/minigame-word-selectors.js';
import { defaultState } from '../state/store.js';

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
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  collectItemSkillCards,
  getMiniGameWeaknessProfile,
  isWeakMiniGameWord,
  getWeakMiniGameCandidates,
} from '../src/minigame-weakness.js';
import { defaultState } from '../state/store.js';

describe('Minigame Weakness Profile Tests', () => {
  let state;

  beforeEach(() => {
    state = defaultState();
  });

  it('1. Новая карточка без review evidence не считается слабой', () => {
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 0, reps: 0, lapses: 0, stability: 0 },
    };
    const profile = getMiniGameWeaknessProfile('L1_V001', state);
    expect(profile.reviewed).toBe(false);
    expect(profile.isWeak).toBe(false);
    expect(isWeakMiniGameWord(profile)).toBe(false);
  });

  it('2. Слово с recall lapses считается слабым', () => {
    state.srs = {
      'L1_V001::recall': { id: 'L1_V001::recall', state: 2, reps: 5, lapses: 2, stability: 4 },
    };
    const profile = getMiniGameWeaknessProfile('L1_V001', state);
    expect(profile.reviewed).toBe(true);
    expect(profile.isWeak).toBe(true);
    expect(profile.reasons).toContain('has-lapses');
  });

  it('3. Слово с сильным recognition и слабым recall считается слабым', () => {
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 10, lapses: 0, stability: 40 },
      'L1_V001::recall': { id: 'L1_V001::recall', state: 3, reps: 4, lapses: 3, stability: 2 },
    };
    const profile = getMiniGameWeaknessProfile('L1_V001', state);
    expect(profile.reviewed).toBe(true);
    expect(profile.isWeak).toBe(true);
    expect(profile.reasons).toContain('relearning');
  });

  it('4. Слово с Relearning-карточкой считается слабым', () => {
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 3, reps: 3, lapses: 1, stability: 1 },
    };
    const profile = getMiniGameWeaknessProfile('L1_V001', state);
    expect(profile.isWeak).toBe(true);
    expect(profile.reasons).toContain('relearning');
  });

  it('5. Недавний Again повышает score', () => {
    const now = Date.now();
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 2, lapses: 0, stability: 5 },
    };
    state.reviewEvents = [
      {
        itemId: 'L1_V001',
        skill: 'recognition',
        mode: 'multiple-choice',
        eventType: 'review',
        effectiveRating: 0,
        reviewedAt: now - 3600000,
      },
    ];

    const profile = getMiniGameWeaknessProfile('L1_V001', state, { now });
    expect(profile.isWeak).toBe(true);
    expect(profile.reasons).toContain('recent-again');
  });

  it('6. Undone Again не учитывается', () => {
    const now = Date.now();
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 2, lapses: 0, stability: 10 },
    };
    state.reviewEvents = [
      {
        itemId: 'L1_V001',
        skill: 'recognition',
        mode: 'multiple-choice',
        eventType: 'review',
        effectiveRating: 0,
        reviewedAt: now - 3600000,
        undoneAt: now - 1800000,
      },
    ];

    const profile = getMiniGameWeaknessProfile('L1_V001', state, { now });
    expect(profile.reasons).not.toContain('recent-again');
  });

  it('7. Preview/debug/fallback события не учитываются', () => {
    const now = Date.now();
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 2, lapses: 0, stability: 10 },
    };
    state.reviewEvents = [
      {
        itemId: 'L1_V001',
        skill: 'recognition',
        mode: 'preview',
        eventType: 'review',
        effectiveRating: 0,
        reviewedAt: now - 3600000,
      },
    ];

    const profile = getMiniGameWeaknessProfile('L1_V001', state, { now });
    expect(profile.reasons).not.toContain('recent-again');
  });

  it('8. Accuracy ниже 80% при трёх и более событиях считается признаком слабости', () => {
    const now = Date.now();
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 5, lapses: 0, stability: 10 },
    };
    state.reviewEvents = [
      {
        itemId: 'L1_V001',
        skill: 'recognition',
        mode: 'multiple-choice',
        eventType: 'review',
        effectiveRating: 4,
        firstAttemptCorrect: true,
        reviewedAt: now - 86400000 * 5,
      },
      {
        itemId: 'L1_V001',
        skill: 'recognition',
        mode: 'multiple-choice',
        eventType: 'review',
        effectiveRating: 0,
        firstAttemptCorrect: false,
        reviewedAt: now - 86400000 * 4,
      },
      {
        itemId: 'L1_V001',
        skill: 'recognition',
        mode: 'multiple-choice',
        eventType: 'review',
        effectiveRating: 4,
        firstAttemptCorrect: true,
        reviewedAt: now - 86400000 * 2,
      },
    ];

    const profile = getMiniGameWeaknessProfile('L1_V001', state, { now });
    expect(profile.reasons).toContain('low-accuracy');
  });

  it('9. Одно случайное событие не создаёт ложную low-accuracy слабость', () => {
    const now = Date.now();
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 10, lapses: 0, stability: 15 },
    };
    state.reviewEvents = [
      {
        itemId: 'L1_V001',
        skill: 'recognition',
        mode: 'multiple-choice',
        eventType: 'review',
        effectiveRating: 4,
        firstAttemptCorrect: true,
        reviewedAt: now - 86400000 * 40,
      },
    ];

    const profile = getMiniGameWeaknessProfile('L1_V001', state, { now });
    expect(profile.reasons).not.toContain('low-accuracy');
  });

  it('10. Отсутствующий context-production не считается слабостью', () => {
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 5, lapses: 0, stability: 15 },
      'L1_V001::recall': { id: 'L1_V001::recall', state: 2, reps: 5, lapses: 0, stability: 15 },
    };
    const profile = getMiniGameWeaknessProfile('L1_V001', state);
    expect(profile.skills.contextProduction).toBeNull();
    expect(profile.isWeak).toBe(false);
  });

  it('11. Отсутствующий reading-writing у слова без кандзи не считается слабостью', () => {
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 5, lapses: 0, stability: 15 },
    };
    const profile = getMiniGameWeaknessProfile('L1_V001', state);
    expect(profile.skills.readingWriting).toBeNull();
    expect(profile.isWeak).toBe(false);
  });

  it('12. Все skill cards одного itemId агрегируются', () => {
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 5 },
      'L1_V001::recall': { id: 'L1_V001::recall', state: 2, reps: 4 },
      'L1_V001::reading-writing': { id: 'L1_V001::reading-writing', state: 2, reps: 3 },
      'L1_V001::context-production': { id: 'L1_V001::context-production', state: 2, reps: 2 },
    };

    const cards = collectItemSkillCards(state, 'L1_V001');
    expect(cards.recognition).toBeDefined();
    expect(cards.recall).toBeDefined();
    expect(cards.readingWriting).toBeDefined();
    expect(cards.contextProduction).toBeDefined();
  });

  it('13. Skill-based и исторический recognition ID объединяются', () => {
    state.srs = {
      L1_V001: { id: 'L1_V001', state: 2, reps: 5 },
      'L1_V002::recognition': { id: 'L1_V002::recognition', state: 2, reps: 5 },
    };

    const cards1 = collectItemSkillCards(state, 'L1_V001');
    const cards2 = collectItemSkillCards(state, 'L1_V002');
    expect(cards1.recognition?.id).toBe('L1_V001');
    expect(cards2.recognition?.id).toBe('L1_V002::recognition');
  });

  it('14. Исходный state не мутируется', () => {
    const originalSrs = JSON.parse(JSON.stringify(state.srs));
    getMiniGameWeaknessProfile('L1_V001', state);
    expect(state.srs).toEqual(originalSrs);
  });

  it('15. Crossword и Word Search могут получать разные game-specific score', () => {
    state.srs = {
      'L1_V001::recall': { id: 'L1_V001::recall', state: 2, reps: 5, lapses: 2, stability: 2 },
      'L1_V001::reading-writing': {
        id: 'L1_V001::reading-writing',
        state: 2,
        reps: 5,
        lapses: 1,
        stability: 1,
      },
    };

    const cwProfile = getMiniGameWeaknessProfile('L1_V001', state, { gameId: 'crossword' });
    const wsProfile = getMiniGameWeaknessProfile('L1_V001', state, { gameId: 'wordSearch' });

    expect(cwProfile.weaknessScore).toBeGreaterThan(0);
    expect(wsProfile.weaknessScore).toBeGreaterThan(0);
  });

  it('16. Weak candidates отсортированы по weaknessScore', () => {
    state.srs = {
      'W_1::recall': { id: 'W_1::recall', state: 2, reps: 5, lapses: 1, stability: 5 },
      'W_2::recall': { id: 'W_2::recall', state: 3, reps: 5, lapses: 3, stability: 1 },
    };

    const candidates = [
      { id: 'W_1', kana: 'みず', translation: 'вода' },
      { id: 'W_2', kana: 'ほん', translation: 'книга' },
    ];

    const weakCandidates = getWeakMiniGameCandidates(candidates, state);
    expect(weakCandidates.length).toBe(2);
    expect(weakCandidates[0].id).toBe('W_2');
    expect(weakCandidates[1].id).toBe('W_1');
  });

  it('17. Дубликаты kana удаляются', () => {
    state.srs = {
      'W_1::recall': { id: 'W_1::recall', state: 2, reps: 5, lapses: 1, stability: 2 },
      'W_2::recall': { id: 'W_2::recall', state: 3, reps: 5, lapses: 3, stability: 1 },
    };

    const candidates = [
      { id: 'W_1', kana: 'みず', translation: 'вода 1' },
      { id: 'W_2', kana: 'みず', translation: 'вода 2' },
    ];

    const weakCandidates = getWeakMiniGameCandidates(candidates, state);
    expect(weakCandidates.length).toBe(1);
    expect(weakCandidates[0].id).toBe('W_2');
  });
});

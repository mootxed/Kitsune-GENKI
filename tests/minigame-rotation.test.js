import { describe, it, expect, beforeEach } from 'vitest';
import { selectMiniGameWords, recordGameSession } from '../src/minigame-word-rotation.js';
import { defaultState } from '../state/store.js';

describe('Minigame Word Rotation Tests', () => {
  let candidates;

  beforeEach(() => {
    candidates = Array.from({ length: 30 }, (_, i) => ({
      id: `W_${i + 1}`,
      word: `W_${i + 1}`,
      kana: `かな_${i + 1}`,
      translation: `слово ${i + 1}`,
      priorityScore: 10,
    }));
  });

  it('8. Следующая Word Search партия при большом пуле не повторяет весь предыдущий набор', () => {
    const state = defaultState();
    const batch1 = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 6,
      history: state,
    });
    expect(batch1.length).toBe(6);

    recordGameSession(
      state,
      'wordSearch',
      batch1.map((w) => w.id)
    );

    const batch2 = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 6,
      history: state,
    });
    expect(batch2.length).toBe(6);

    const prevIds = new Set(batch1.map((w) => w.id));
    const repeated = batch2.filter((w) => prevIds.has(w.id));
    expect(repeated.length).toBeLessThan(6);
  });

  it('9. Medium получает минимум четыре свежих слова из шести', () => {
    const state = defaultState();
    const batch1 = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 6,
      history: state,
    });
    recordGameSession(
      state,
      'wordSearch',
      batch1.map((w) => w.id)
    );

    const batch2 = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 6,
      history: state,
    });
    const prevIds = new Set(batch1.map((w) => w.id));
    const freshWords = batch2.filter((w) => !prevIds.has(w.id));
    expect(freshWords.length).toBeGreaterThanOrEqual(4);
  });

  it('10. Hard получает минимум шесть свежих из девяти', () => {
    const state = defaultState();
    const batch1 = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 9,
      history: state,
    });
    recordGameSession(
      state,
      'wordSearch',
      batch1.map((w) => w.id)
    );

    const batch2 = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 9,
      history: state,
    });
    const prevIds = new Set(batch1.map((w) => w.id));
    const freshWords = batch2.filter((w) => !prevIds.has(w.id));
    expect(freshWords.length).toBeGreaterThanOrEqual(6);
  });

  it('11. Crossword получает минимум 70% свежих слов', () => {
    const state = defaultState();
    const batch1 = selectMiniGameWords(candidates, {
      gameId: 'crossword',
      count: 10,
      history: state,
    });
    recordGameSession(
      state,
      'crossword',
      batch1.map((w) => w.id)
    );

    const batch2 = selectMiniGameWords(candidates, {
      gameId: 'crossword',
      count: 10,
      history: state,
    });
    const prevIds = new Set(batch1.map((w) => w.id));
    const freshWords = batch2.filter((w) => !prevIds.has(w.id));
    expect(freshWords.length).toBeGreaterThanOrEqual(7);
  });

  it('12. При маленьком словаре повтор разрешён без ошибки', () => {
    const smallCandidates = candidates.slice(0, 4);
    const state = defaultState();

    const batch1 = selectMiniGameWords(smallCandidates, {
      gameId: 'wordSearch',
      count: 4,
      history: state,
    });
    expect(batch1.length).toBe(4);
    recordGameSession(
      state,
      'wordSearch',
      batch1.map((w) => w.id)
    );

    const batch2 = selectMiniGameWords(smallCandidates, {
      gameId: 'wordSearch',
      count: 4,
      history: state,
    });
    expect(batch2.length).toBe(4);
  });

  it('13. История ограничивается пятью партиями на режим', () => {
    const state = defaultState();
    for (let i = 0; i < 10; i++) {
      recordGameSession(state, 'wordSearch', [`W_${i}`], 'normal');
      recordGameSession(state, 'wordSearch', [`W_weak_${i}`], 'weak');
    }

    const recent = state.miniGameWordHistory.wordSearch.recentSessions;
    const normalSessions = recent.filter((s) => (s.mode || 'normal') === 'normal');
    const weakSessions = recent.filter((s) => s.mode === 'weak');

    expect(normalSessions.length).toBe(5);
    expect(weakSessions.length).toBe(5);
    expect(normalSessions[4].wordIds).toEqual(['W_9']);
    expect(weakSessions[4].wordIds).toEqual(['W_weak_9']);
  });

  it('14. История Word Search и Crossword независима', () => {
    const state = defaultState();
    recordGameSession(state, 'wordSearch', ['W_1', 'W_2']);
    recordGameSession(state, 'crossword', ['C_1', 'C_2']);

    expect(state.miniGameWordHistory.wordSearch.recentSessions.length).toBe(1);
    expect(state.miniGameWordHistory.crossword.recentSessions.length).toBe(1);

    expect(state.miniGameWordHistory.wordSearch.recentSessions[0].wordIds).toEqual(['W_1', 'W_2']);
    expect(state.miniGameWordHistory.crossword.recentSessions[0].wordIds).toEqual(['C_1', 'C_2']);
  });

  it('15. Фактически не размещённые слова не записываются в history', () => {
    const state = defaultState();
    const candidatePool = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 6,
      history: state,
    });

    const placedWords = candidatePool.slice(0, 4);
    recordGameSession(
      state,
      'wordSearch',
      placedWords.map((w) => w.id)
    );

    const recorded = state.miniGameWordHistory.wordSearch.recentSessions[0].wordIds;
    expect(recorded.length).toBe(4);
    expect(recorded).toEqual(placedWords.map((w) => w.id));
  });

  it('16. Normal и weak history независимы', () => {
    const state = defaultState();
    recordGameSession(state, 'wordSearch', ['W_normal1'], 'normal');
    recordGameSession(state, 'wordSearch', ['W_weak1'], 'weak');

    const selectedNormal = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 5,
      mode: 'normal',
      history: state,
    });

    const selectedWeak = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 5,
      mode: 'weak',
      history: state,
    });

    // The normal selection considers W_normal1 as prev session, not W_weak1
    expect(selectedNormal.map((w) => w.id)).not.toContain('W_weak1');
    expect(selectedWeak.map((w) => w.id)).not.toContain('W_normal1');
  });

  it('17. Старая запись без mode считается normal', () => {
    const state = defaultState();
    state.miniGameWordHistory = {
      wordSearch: {
        recentSessions: [{ startedAt: 1000, wordIds: ['W_1', 'W_2'] }],
      },
    };

    const selectedNormal = selectMiniGameWords(candidates, {
      gameId: 'wordSearch',
      count: 5,
      mode: 'normal',
      history: state,
    });

    // W_1 is in previous normal session penalty
    const w1 = selectedNormal.find((w) => w.id === 'W_1');
    expect(w1).toBeUndefined(); // Fresh words are picked over previous session words
  });

  it('18. Weakness score не отменяет штраф недавней партии полностью', () => {
    const state = defaultState();
    recordGameSession(state, 'wordSearch', ['W_1'], 'weak');

    const pool = [
      { id: 'W_1', kana: 'みず', translation: 'вода', priorityScore: 100 },
      { id: 'W_2', kana: 'ほん', translation: 'книга', priorityScore: 80 },
    ];

    const selected = selectMiniGameWords(pool, {
      gameId: 'wordSearch',
      count: 1,
      mode: 'weak',
      history: state,
    });

    // W_2 is fresh so it should be picked first despite slightly lower priorityScore
    expect(selected[0].id).toBe('W_2');
  });
});

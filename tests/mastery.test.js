import { describe, expect, it, vi } from 'vitest';
import { SRS } from '../srs.js';
import { SKILLS, makeCardId, modeCanSchedule } from '../src/knowledge-model.js';
import { calculateMastery, MASTERY_LEVELS } from '../src/mastery.js';
import { isDebugSkipEnabled, submitReview } from '../ui/flashcards.js';

const NOW = new Date(2026, 6, 22, 12).getTime();

function card(itemId, skill, stability = 0, due = NOW + 1_000) {
  return {
    ...SRS.newCard(makeCardId(itemId, skill), { itemId, skill }),
    stability,
    reps: stability > 0 ? 5 : 0,
    state: stability > 0 ? SRS.State.Review : SRS.State.New,
    due,
  };
}

function event(itemId, skill, reviewedAt, overrides = {}) {
  return {
    eventId: `${itemId}-${skill}-${reviewedAt}`,
    eventType: 'review',
    itemId,
    cardId: makeCardId(itemId, skill),
    skill,
    mode: skill === SKILLS.RECOGNITION ? 'reverse-multiple-choice' : 'typing',
    firstAttemptCorrect: true,
    mistakes: 0,
    hintUsed: false,
    rawRating: 4,
    effectiveRating: 4,
    reviewedAt,
    undoneAt: null,
    ...overrides,
  };
}

function mastery(itemId, cards, events, retrievability = 0.95) {
  return calculateMastery({
    itemId,
    cards,
    events,
    now: NOW,
    getRetrievability: () => retrievability,
  });
}

describe('derived mastery', () => {
  it('не повышается от одной быстрой multiple-choice попытки', () => {
    const itemId = 'L1_w1';
    const result = mastery(
      itemId,
      [card(itemId, SKILLS.RECOGNITION, 90)],
      [event(itemId, SKILLS.RECOGNITION, NOW - 1_000)]
    );

    expect(result.level).toBe(MASTERY_LEVELS.FAMILIAR);
    expect(result.skills).toEqual([SKILLS.RECOGNITION]);
  });

  it('различает recognition и recall и требует два локальных дня', () => {
    const itemId = 'L1_w2';
    const cards = [card(itemId, SKILLS.RECOGNITION, 8), card(itemId, SKILLS.RECALL, 8)];
    const dayOne = new Date(2026, 6, 20, 23, 30).getTime();
    const dayTwo = new Date(2026, 6, 21, 0, 30).getTime();

    expect(mastery(itemId, cards, [event(itemId, SKILLS.RECOGNITION, dayOne)]).level).toBe(
      MASTERY_LEVELS.FAMILIAR
    );
    expect(
      mastery(itemId, cards, [
        event(itemId, SKILLS.RECOGNITION, dayOne),
        event(itemId, SKILLS.RECALL, dayTwo),
      ]).level
    ).toBe(MASTERY_LEVELS.REMEMBERING);
  });

  it('исключает undone, system fallback, preview и debug события', () => {
    const itemId = 'L1_w3';
    const excluded = [
      event(itemId, SKILLS.RECALL, NOW - 4_000, { undoneAt: NOW }),
      event(itemId, SKILLS.RECALL, NOW - 3_000, { mode: 'system-fallback' }),
      event(itemId, SKILLS.RECALL, NOW - 2_000, { eventType: 'preview', mode: 'preview' }),
      event(itemId, SKILLS.RECALL, NOW - 1_000, { mode: 'debug-skip' }),
    ];

    expect(mastery(itemId, [card(itemId, SKILLS.RECALL, 90)], excluded).level).toBe(
      MASTERY_LEVELS.NEW
    );
  });

  it('применяет строгие пороги confident/mastered и помечает due-карточку', () => {
    const itemId = 'L1_w4';
    const cards = [
      card(itemId, SKILLS.RECOGNITION, 95, NOW - 1),
      card(itemId, SKILLS.RECALL, 95),
      card(itemId, SKILLS.CONTEXT_PRODUCTION, 95),
    ];
    const events = [
      event(itemId, SKILLS.RECOGNITION, NOW - 5 * 86_400_000),
      event(itemId, SKILLS.RECALL, NOW - 4 * 86_400_000),
      event(itemId, SKILLS.CONTEXT_PRODUCTION, NOW - 3 * 86_400_000, {
        mode: 'context-sentence',
      }),
    ];

    const result = mastery(itemId, cards, events, 0.92);
    expect(result.level).toBe(MASTERY_LEVELS.MASTERED);
    expect(result.label).toBe('Освоено · пора освежить');

    const withLapse = mastery(itemId, cards, [
      ...events,
      event(itemId, SKILLS.RECOGNITION, NOW - 2 * 86_400_000),
      event(itemId, SKILLS.RECALL, NOW - 86_400_000),
      event(itemId, SKILLS.RECALL, NOW - 1_000, {
        firstAttemptCorrect: false,
        rawRating: 0,
        effectiveRating: 0,
      }),
    ]);
    expect(withLapse.level).toBe(MASTERY_LEVELS.CONFIDENT);
  });
});

describe('review policy integration', () => {
  it('не показывает debug skip в production', () => {
    expect(isDebugSkipEnabled({ DEV: false, PROD: true })).toBe(false);
    expect(isDebugSkipEnabled({ DEV: true, PROD: false })).toBe(true);
  });
  it.each(['particle-quiz', 'sentence-building', 'system-fallback', 'preview', 'debug-skip'])(
    '%s не меняет vocabulary FSRS и не создаёт успешное событие',
    (mode) => {
      const vocabularyCard = card('L2_w1', SKILLS.RECOGNITION);
      const state = { srs: { [vocabularyCard.id]: vocabularyCard }, reviewEvents: [] };
      const snapshot = JSON.parse(JSON.stringify(vocabularyCard));

      expect(modeCanSchedule(vocabularyCard, mode)).toBe(false);
      submitReview(vocabularyCard, SRS.Quality.Good, state, {
        mode,
        responseTimeMs: mode === 'system-fallback' ? null : 500,
      });

      expect(vocabularyCard).toEqual(snapshot);
      expect(state.reviewEvents).toEqual([]);
    }
  );

  it('валидный skill/mode создаёт полное событие и сохраняет learning_steps', () => {
    vi.setSystemTime(NOW);
    const vocabularyCard = card('L2_w2', SKILLS.RECOGNITION);
    const state = { srs: { [vocabularyCard.id]: vocabularyCard }, reviewEvents: [] };

    submitReview(vocabularyCard, SRS.Quality.Good, state, {
      mode: 'reverse-multiple-choice',
      responseTimeMs: 400,
    });

    expect(state.reviewEvents).toHaveLength(1);
    expect(state.reviewEvents[0]).toMatchObject({
      itemId: 'L2_w2',
      cardId: 'L2_w2',
      skill: SKILLS.RECOGNITION,
      rawRating: 4,
      effectiveRating: 4,
      previousCard: { learning_steps: 0 },
      nextCard: { learning_steps: 1 },
      undoneAt: null,
    });
  });
});

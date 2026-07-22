import { describe, expect, it, vi } from 'vitest';
import { SRS } from '../srs.js';
import { SKILLS, makeCardId, modeCanSchedule } from '../src/knowledge-model.js';
import { calculateMastery, MASTERY_LEVELS, READINESS } from '../src/mastery.js';
import { isDebugSkipEnabled, submitReview } from '../ui/flashcards.js';

const NOW = new Date(2026, 6, 22, 12).getTime();
const DAY = 86_400_000;

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
  const modes = {
    [SKILLS.RECOGNITION]: 'reverse-multiple-choice',
    [SKILLS.RECALL]: 'typing',
    [SKILLS.READING_WRITING]: 'drawing',
    [SKILLS.CONTEXT_PRODUCTION]: 'context-production',
  };
  return {
    eventId: `${itemId}-${skill}-${reviewedAt}`,
    eventType: 'review',
    itemId,
    cardId: makeCardId(itemId, skill),
    skill,
    mode: modes[skill],
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

function mastery(itemId, cards, events, options = {}) {
  return calculateMastery({
    itemId,
    cards,
    events,
    now: NOW,
    getRetrievability: () => options.retrievability ?? 0.95,
    archive: options.archive,
    applicableSkills: options.applicableSkills,
  });
}

describe('derived mastery depth', () => {
  it('не повышается от одной multiple-choice попытки', () => {
    const itemId = 'L1_V001';
    const result = mastery(
      itemId,
      [card(itemId, SKILLS.RECOGNITION, 90)],
      [event(itemId, SKILLS.RECOGNITION, NOW - 1_000)]
    );

    expect(result.level).toBe(MASTERY_LEVELS.FAMILIAR);
    expect(result.skills).toEqual([SKILLS.RECOGNITION]);
  });

  it('начиная с Вспоминаю требует recall в два локальных дня', () => {
    const itemId = 'L1_V002';
    const cards = [card(itemId, SKILLS.RECOGNITION, 8), card(itemId, SKILLS.RECALL, 8)];
    const dayOne = new Date(2026, 6, 20, 23, 30).getTime();
    const dayTwo = new Date(2026, 6, 21, 0, 30).getTime();

    expect(mastery(itemId, cards, [event(itemId, SKILLS.RECALL, dayOne)]).level).toBe(
      MASTERY_LEVELS.FAMILIAR
    );
    expect(
      mastery(itemId, cards, [
        event(itemId, SKILLS.RECALL, dayOne),
        event(itemId, SKILLS.RECALL, dayTwo),
      ]).level
    ).toBe(MASTERY_LEVELS.REMEMBERING);
  });

  it('не допускает Уверенно или Освоено без recall', () => {
    const itemId = 'L1_V003';
    const cards = [
      card(itemId, SKILLS.RECOGNITION, 120),
      card(itemId, SKILLS.CONTEXT_PRODUCTION, 120),
    ];
    const events = [
      event(itemId, SKILLS.RECOGNITION, NOW - 3 * DAY),
      event(itemId, SKILLS.CONTEXT_PRODUCTION, NOW - 2 * DAY),
      event(itemId, SKILLS.CONTEXT_PRODUCTION, NOW - DAY),
    ];

    expect(mastery(itemId, cards, events).level).toBe(MASTERY_LEVELS.FAMILIAR);
  });

  it('не считает context multiple choice активным production', () => {
    const itemId = 'L1_V004';
    const cards = [
      card(itemId, SKILLS.RECOGNITION, 95),
      card(itemId, SKILLS.RECALL, 95),
      card(itemId, SKILLS.CONTEXT_PRODUCTION, 95),
    ];
    const events = [
      event(itemId, SKILLS.RECOGNITION, NOW - 5 * DAY),
      event(itemId, SKILLS.RECALL, NOW - 4 * DAY),
      event(itemId, SKILLS.RECALL, NOW - 3 * DAY),
      event(itemId, SKILLS.CONTEXT_PRODUCTION, NOW - 2 * DAY, {
        mode: 'context-sentence',
      }),
    ];

    expect(mastery(itemId, cards, events).level).toBe(MASTERY_LEVELS.CONFIDENT);
  });

  it('сохраняет Освоено при падении R и меняет только readiness', () => {
    const itemId = 'L1_V005';
    const cards = [
      card(itemId, SKILLS.RECOGNITION, 95),
      card(itemId, SKILLS.RECALL, 95),
      card(itemId, SKILLS.CONTEXT_PRODUCTION, 95),
    ];
    const events = [
      event(itemId, SKILLS.RECOGNITION, NOW - 6 * DAY),
      event(itemId, SKILLS.RECALL, NOW - 5 * DAY),
      event(itemId, SKILLS.RECALL, NOW - 4 * DAY),
      event(itemId, SKILLS.CONTEXT_PRODUCTION, NOW - 3 * DAY),
      event(itemId, SKILLS.CONTEXT_PRODUCTION, NOW - 2 * DAY),
    ];

    const result = mastery(itemId, cards, events, { retrievability: 0.2 });
    expect(result.level).toBe(MASTERY_LEVELS.MASTERED);
    expect(result.label).toBe('Освоено');
    expect(result.readiness).toBe(READINESS.REFRESH);
  });

  it('новый слабый production skill не понижает достигнутые level и score', () => {
    const itemId = 'L1_V006';
    const baseCards = [
      card(itemId, SKILLS.RECOGNITION, 35),
      card(itemId, SKILLS.RECALL, 35),
      card(itemId, SKILLS.CONTEXT_PRODUCTION, 0),
    ];
    const baseEvents = [
      event(itemId, SKILLS.RECOGNITION, NOW - 4 * DAY),
      event(itemId, SKILLS.RECALL, NOW - 3 * DAY),
      event(itemId, SKILLS.RECALL, NOW - 2 * DAY),
    ];
    const before = mastery(itemId, baseCards, baseEvents);
    const after = mastery(
      itemId,
      baseCards.map((entry) =>
        entry.skill === SKILLS.CONTEXT_PRODUCTION ? { ...entry, stability: 1, reps: 1 } : entry
      ),
      [...baseEvents, event(itemId, SKILLS.CONTEXT_PRODUCTION, NOW - DAY)]
    );

    expect(before.level).toBe(MASTERY_LEVELS.CONFIDENT);
    expect(after.level).toBe(MASTERY_LEVELS.CONFIDENT);
    expect(after.score).toBeGreaterThanOrEqual(before.score);
  });

  it('использует зрелый recall как production fallback для неприменимой оси', () => {
    const itemId = 'L1_V007';
    const cards = [card(itemId, SKILLS.RECOGNITION, 95), card(itemId, SKILLS.RECALL, 95)];
    const events = [
      event(itemId, SKILLS.RECOGNITION, NOW - 3 * DAY),
      event(itemId, SKILLS.RECALL, NOW - 2 * DAY),
      event(itemId, SKILLS.RECALL, NOW - DAY),
    ];

    const result = mastery(itemId, cards, events, {
      applicableSkills: [SKILLS.RECOGNITION, SKILLS.RECALL],
    });
    expect(result.productionSkill).toBe(SKILLS.RECALL);
    expect(result.level).toBe(MASTERY_LEVELS.MASTERED);
  });

  it('показывает legacy knowledge как оценочное, а не Новое 0', () => {
    const itemId = 'L1_V008';
    const legacy = {
      ...card(itemId, SKILLS.RECOGNITION, 100),
      legacyMasteryEstimated: true,
    };
    const result = mastery(itemId, [legacy], []);

    expect(result.level).toBe(MASTERY_LEVELS.FAMILIAR);
    expect(result.label).toBe('Ранее изучалось');
    expect(result.readiness).toBe(READINESS.ESTIMATED);
    expect(result.score).toBeGreaterThan(0);
  });

  it('исключает undone, fallback, preview и debug события', () => {
    const itemId = 'L1_V009';
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
});

describe('review policy integration', () => {
  it('не показывает debug skip в production', () => {
    expect(isDebugSkipEnabled({ DEV: false, PROD: true })).toBe(false);
    expect(isDebugSkipEnabled({ DEV: true, PROD: false })).toBe(true);
  });

  it.each(['particle-quiz', 'sentence-building', 'system-fallback', 'preview', 'debug-skip'])(
    '%s не меняет vocabulary FSRS и не создаёт успешное событие',
    (mode) => {
      const vocabularyCard = card('L2_V001', SKILLS.RECOGNITION);
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
    const vocabularyCard = card('L2_V002', SKILLS.RECOGNITION);
    const state = { srs: { [vocabularyCard.id]: vocabularyCard }, reviewEvents: [] };

    submitReview(vocabularyCard, SRS.Quality.Good, state, {
      mode: 'reverse-multiple-choice',
      responseTimeMs: 400,
    });

    expect(state.reviewEvents).toHaveLength(1);
    expect(state.reviewEvents[0]).toMatchObject({
      itemId: 'L2_V002',
      cardId: 'L2_V002',
      skill: SKILLS.RECOGNITION,
      rawRating: 4,
      effectiveRating: 4,
      previousCard: { learning_steps: 0 },
      nextCard: { learning_steps: 1 },
      undoneAt: null,
    });
  });
});

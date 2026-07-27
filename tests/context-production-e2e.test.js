import { describe, it, expect } from 'vitest';
import { SRS } from '../srs.js';
import { SKILLS, makeCardId } from '../src/knowledge-model.js';
import { ensureVocabularySkillCards } from '../src/chapter-vocabulary.js';
import { calculateMastery, MASTERY_LEVELS } from '../src/mastery.js';
import { submitReview, undoLastReview } from '../ui/flashcards/review-fsrs.js';
import { SessionManager } from '../src/session-batcher.js';
import { UndoStack } from '../src/card-behavior.js';

describe('Context Production Integration / E2E Flow', () => {
  it('completes full end-to-end lifecycle of context-production cards and mastery', async () => {
    // 1. Create clean state
    const appState = {
      srs: {},
      reviewEvents: [],
      reviewLogs: [],
      masteryArchive: {},
      chapters: [1],
    };

    const wordWithCP = {
      id: 'L1_V023',
      writing: 'がくせい',
      kanji: '学生',
      chapterId: 1,
      contextProduction: {
        id: 'L01_V023_cp_01',
        focusItemId: 'L1_V023',
        prompt: 'Скажите по-японски: «Я студент».',
        meaningCue: 'Используйте слово «студент»',
        acceptedAnswers: ['わたしはがくせいです', '私は学生です'],
        requiredForm: {
          type: 'copula',
          politeness: 'polite',
          tense: 'non-past',
          polarity: 'affirmative',
        },
      },
    };

    const wordWithCP2 = {
      id: 'L1_V026',
      writing: 'せんせい',
      kanji: '先生',
      chapterId: 1,
      contextProduction: {
        id: 'L01_V026_cp_01',
        focusItemId: 'L1_V026',
        prompt: 'Скажите по-японски: «Я учитель».',
        meaningCue: 'Используйте слово «учитель»',
        acceptedAnswers: ['わたしはせんせいです', '私は先生です'],
        requiredForm: {
          type: 'copula',
          politeness: 'polite',
          tense: 'non-past',
          polarity: 'affirmative',
        },
      },
    };

    const nowDay1 = new Date(2026, 6, 20, 10, 0, 0).getTime();

    // 2. Start chapter & ensure cards
    ensureVocabularySkillCards(appState, wordWithCP, { now: nowDay1 });
    ensureVocabularySkillCards(appState, wordWithCP2, { now: nowDay1 });

    // 3. Complete prerequisite recognition and recall on Day 1 and Day 2
    const recCardId = makeCardId('L1_V023', SKILLS.RECOGNITION);
    const recallCardId = makeCardId('L1_V023', SKILLS.RECALL);

    // Pass recognition on Day 1
    submitReview(appState.srs[recCardId], SRS.Quality.Good, appState, {
      mode: 'multiple-choice',
      responseTimeMs: 2000,
      reviewedAt: nowDay1,
    });

    // Advance to Day 2
    const nowDay2 = nowDay1 + 86_400_000;
    ensureVocabularySkillCards(appState, wordWithCP, { now: nowDay2 });

    // Pass recall on Day 2
    submitReview(appState.srs[recallCardId], SRS.Quality.Good, appState, {
      mode: 'typing',
      responseTimeMs: 3000,
      reviewedAt: nowDay2,
    });

    // 4. Advance to Day 3
    const nowDay3 = nowDay2 + 86_400_000;

    // 5. Ensure cards for Day 3 -> context-production card appears!
    ensureVocabularySkillCards(appState, wordWithCP, { now: nowDay3 });
    const cpCardId = makeCardId('L1_V023', SKILLS.CONTEXT_PRODUCTION);
    const cpCard = appState.srs[cpCardId];
    expect(cpCard).toBeDefined();
    expect(Boolean(cpCard.suspended)).toBe(false);

    // 6. Open card and 7. Enter wrong answer (1st attempt error)
    const reviewResult1 = submitReview(cpCard, SRS.Quality.Again, appState, {
      mode: 'context-production',
      taskId: 'L01_V023_cp_01',
      mistakes: 1,
      hintUsed: true,
      responseTimeMs: 5000,
      reviewedAt: nowDay3,
    });

    // 8. Verify exactly one Again review created
    expect(reviewResult1.accepted).toBe(true);
    expect(appState.reviewEvents).toHaveLength(3);
    const cpEvent1 = appState.reviewEvents[appState.reviewEvents.length - 1];
    expect(cpEvent1.skill).toBe(SKILLS.CONTEXT_PRODUCTION);
    expect(cpEvent1.effectiveRating).toBe(SRS.Quality.Again);
    expect(cpEvent1.firstAttemptCorrect).toBe(false);

    // 9. Retry correctly in-session
    // In-session relearning does not call submitReview a second time for FSRS
    // 10. Verify no second FSRS review event created
    expect(appState.reviewEvents).toHaveLength(3);

    // 11. Start new context-production card for word2
    // Setup word2 prerequisites on Day 1 and Day 2
    const rec2 = makeCardId('L1_V026', SKILLS.RECOGNITION);
    const recall2 = makeCardId('L1_V026', SKILLS.RECALL);
    submitReview(appState.srs[rec2], SRS.Quality.Good, appState, {
      mode: 'multiple-choice',
      responseTimeMs: 2000,
      reviewedAt: nowDay1,
    });

    ensureVocabularySkillCards(appState, wordWithCP2, { now: nowDay2 });
    submitReview(appState.srs[recall2], SRS.Quality.Good, appState, {
      mode: 'typing',
      responseTimeMs: 3000,
      reviewedAt: nowDay2,
    });

    ensureVocabularySkillCards(appState, wordWithCP2, { now: nowDay3 });
    const cp2CardId = makeCardId('L1_V026', SKILLS.CONTEXT_PRODUCTION);
    const cp2Card = appState.srs[cp2CardId];

    // 12. Answer correctly on first attempt
    const reviewResult2 = submitReview(cp2Card, SRS.Quality.Good, appState, {
      mode: 'context-production',
      taskId: 'L01_V026_cp_01',
      mistakes: 0,
      hintUsed: false,
      responseTimeMs: 8000,
      reviewedAt: nowDay3,
    });

    // 13. Verify Good rating recorded
    expect(reviewResult2.accepted).toBe(true);
    expect(reviewResult2.quality).toBe(SRS.Quality.Good);

    // 14. Reload state (simulated serialization / deserialization)
    const serializedState = JSON.stringify(appState);
    const reloadedState = JSON.parse(serializedState);

    // 15. Verify card, review event, queue, and mastery preserved
    expect(reloadedState.srs[cp2CardId]).toBeDefined();
    expect(reloadedState.reviewEvents.length).toBe(appState.reviewEvents.length);

    const masteryResult = calculateMastery({
      itemId: 'L1_V026',
      cards: Object.values(reloadedState.srs),
      events: reloadedState.reviewEvents,
      applicableSkills: [SKILLS.RECOGNITION, SKILLS.RECALL, SKILLS.CONTEXT_PRODUCTION],
      now: nowDay3,
      getRetrievability: () => 1.0,
    });
    expect(masteryResult.productionStatus).toBe('Production проверен');

    // 16. Perform Undo
    const undoSuccess = await undoLastReview(
      appState,
      {
        save: async () => {},
        onReviewUndone: () => {},
      },
      () => {}
    );
    expect(undoSuccess).toBe(true);

    // 17. Verify card state and mastery restored
    const lastEvent = appState.reviewEvents[appState.reviewEvents.length - 1];
    expect(lastEvent.undoneAt).toBeDefined();

    const restoredMastery = calculateMastery({
      itemId: 'L1_V026',
      cards: Object.values(appState.srs),
      events: appState.reviewEvents,
      applicableSkills: [SKILLS.RECOGNITION, SKILLS.RECALL, SKILLS.CONTEXT_PRODUCTION],
      now: nowDay3,
      getRetrievability: () => 1.0,
    });
    expect(restoredMastery.productionStatus).toBe('Production пока не проверен');
  });
});

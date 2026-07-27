import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateProductionTask,
  evaluateProductionAnswer,
  normalizeProductionAnswer,
  productionTasks,
  productionContext,
} from '../src/production-context.js';
import { selectProductionTask } from '../src/task-selection.js';
import {
  vocabularySkills,
  vocabularySkillsReadyForIntroduction,
  makeCardId,
  SKILLS,
} from '../src/knowledge-model.js';
import { ensureVocabularySkillCards } from '../src/chapter-vocabulary.js';
import { calculateMastery, MASTERY_LEVELS } from '../src/mastery.js';
import { adjustQualityByTime } from '../src/card-behavior.js';
import { submitReview } from '../ui/flashcards/review-fsrs.js';
import { SessionManager } from '../src/session-batcher.js';
import { SRS } from '../srs.js';

describe('Context Production Task Validation & Evaluation', () => {
  it('1. Valid context-production task passes validation', () => {
    const task = {
      id: 'L01_V001_cp_01',
      focusItemId: 'L1_V001',
      prompt: 'Скажите по-японски: «Я студент».',
      meaningCue: 'Используйте слово «студент»',
      acceptedAnswers: ['わたしはがくせいです', '私は学生です'],
      requiredForm: {
        type: 'copula',
        politeness: 'polite',
        tense: 'non-past',
        polarity: 'affirmative',
      },
    };

    const validated = validateProductionTask(task);
    expect(validated).not.toBeNull();
    expect(validated.id).toBe('L01_V001_cp_01');
    expect(validated.acceptedAnswers).toHaveLength(2);
  });

  it('2. Empty prompt is rejected', () => {
    const task = {
      id: 'L01_V001_cp_01',
      focusItemId: 'L1_V001',
      prompt: '   ',
      acceptedAnswers: ['わたしはがくせいです'],
      requiredForm: 'copula',
    };
    expect(validateProductionTask(task)).toBeNull();
  });

  it('3. Empty acceptedAnswers is rejected', () => {
    const task = {
      id: 'L01_V001_cp_01',
      focusItemId: 'L1_V001',
      prompt: 'Prompt',
      acceptedAnswers: [],
      requiredForm: 'copula',
    };
    expect(validateProductionTask(task)).toBeNull();
  });

  it('4. Unknown / empty focusItemId is rejected', () => {
    const task = {
      id: 'L01_V001_cp_01',
      focusItemId: '',
      prompt: 'Prompt',
      acceptedAnswers: ['あい'],
      requiredForm: 'copula',
    };
    expect(validateProductionTask(task)).toBeNull();
  });

  it('6. Missing requiredForm is rejected', () => {
    const task = {
      id: 'L01_V001_cp_01',
      focusItemId: 'L1_V001',
      prompt: 'Prompt',
      acceptedAnswers: ['あい'],
    };
    expect(validateProductionTask(task)).toBeNull();
  });
});

describe('Answer Normalization & Evaluation', () => {
  const sampleTask = {
    id: 'L01_V023_cp_01',
    focusItemId: 'L1_V023',
    prompt: 'Скажите по-японски: «Я студент».',
    acceptedAnswers: ['わたしはがくせいです', '私は学生です'],
    requiredForm: {
      type: 'copula',
      politeness: 'polite',
      tense: 'non-past',
      polarity: 'affirmative',
    },
  };

  it('8. Canonical answer accepted', () => {
    const res = evaluateProductionAnswer('わたしはがくせいです', sampleTask);
    expect(res.correct).toBe(true);
    expect(res.matchedAnswer).toBe('わたしはがくせいです');
  });

  it('9. Allowed kanji variant accepted', () => {
    const res = evaluateProductionAnswer('私は学生です', sampleTask);
    expect(res.correct).toBe(true);
    expect(res.matchedAnswer).toBe('私は学生です');
  });

  it('10. Allowed katakana equivalent accepted', () => {
    const res = evaluateProductionAnswer('ワタシハガクセイデス', sampleTask);
    expect(res.correct).toBe(true);
  });

  it('11. Trailing Japanese dot 。 does not affect result', () => {
    const res = evaluateProductionAnswer('わたしはがくせいです。', sampleTask);
    expect(res.correct).toBe(true);
  });

  it('12. Error in particle is not accepted', () => {
    const res = evaluateProductionAnswer('わたしがくせいです', sampleTask);
    expect(res.correct).toBe(false);
    expect(res.mismatchReason).toBe('mismatch');
  });

  it('13. Error in tense is not accepted', () => {
    const res = evaluateProductionAnswer('わたしはがくせいでした', sampleTask);
    expect(res.correct).toBe(false);
  });

  it('14. Negative form is not accepted instead of affirmative', () => {
    const res = evaluateProductionAnswer('わたしはがくせいじゃありません', sampleTask);
    expect(res.correct).toBe(false);
  });

  it('15. Extra required word not ignored', () => {
    const res = evaluateProductionAnswer('わたしはとてもがくせいです', sampleTask);
    expect(res.correct).toBe(false);
  });

  it('16. Empty answer is not accepted', () => {
    const res = evaluateProductionAnswer('   ', sampleTask);
    expect(res.correct).toBe(false);
    expect(res.mismatchReason).toBe('empty_answer');
  });
});

describe('Card Creation & Staged Opening', () => {
  const wordNoCP = { id: 'L1_V001', writing: 'おはよう', kanji: 'おはよう' };
  const wordWithCP = {
    id: 'L1_V023',
    writing: 'がくせい',
    kanji: '学生',
    contextProduction: {
      id: 'L01_V023_cp_01',
      focusItemId: 'L1_V023',
      prompt: 'Я студент',
      acceptedAnswers: ['わたしはがくせいです'],
      requiredForm: 'copula',
    },
  };

  it('17. Without contextProduction task, skill is not added', () => {
    const skills = vocabularySkills(wordNoCP);
    expect(skills).not.toContain(SKILLS.CONTEXT_PRODUCTION);
  });

  it('18. With valid task, context-production skill is added', () => {
    const skills = vocabularySkills(wordWithCP);
    expect(skills).toContain(SKILLS.CONTEXT_PRODUCTION);
  });

  it('19. Does not open earlier than prerequisite skills (recognition & recall)', () => {
    const now = Date.now();
    const day0 = 20000;
    // Without earlier events: only recognition is ready
    let ready = vocabularySkillsReadyForIntroduction(wordWithCP, [], null, now);
    expect(ready).toEqual([SKILLS.RECOGNITION]);

    // With recognition success on earlier day: recall is ready, but not context-production
    const events = [
      {
        itemId: 'L1_V023',
        skill: SKILLS.RECOGNITION,
        mode: 'multiple-choice',
        eventType: 'review',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: now - 86_400_000,
      },
    ];
    ready = vocabularySkillsReadyForIntroduction(wordWithCP, events, null, now);
    expect(ready).toContain(SKILLS.RECALL);
    expect(ready).not.toContain(SKILLS.CONTEXT_PRODUCTION);

    // With recall success on earlier day: context-production becomes ready
    events.push({
      itemId: 'L1_V023',
      skill: SKILLS.RECALL,
      mode: 'typing',
      eventType: 'review',
      firstAttemptCorrect: true,
      effectiveRating: 4,
      reviewedAt: now - 86_400_000,
    });
    ready = vocabularySkillsReadyForIntroduction(wordWithCP, events, null, now);
    expect(ready).toContain(SKILLS.CONTEXT_PRODUCTION);
  });

  it('20. Card has correct itemId, skill, and cardId', () => {
    const cardId = makeCardId('L1_V023', SKILLS.CONTEXT_PRODUCTION);
    expect(cardId).toBe('L1_V023::context-production');
  });

  it('21. Reconcile does not reset SRS state', () => {
    const appState = { srs: {}, reviewEvents: [] };
    ensureVocabularySkillCards(appState, wordWithCP);
    const cardId = 'L1_V023::context-production';
    if (appState.srs[cardId]) {
      appState.srs[cardId].reps = 5;
      appState.srs[cardId].stability = 15;
    }
    // Re-run ensureVocabularySkillCards
    ensureVocabularySkillCards(appState, wordWithCP);
    if (appState.srs[cardId]) {
      expect(appState.srs[cardId].reps).toBe(5);
      expect(appState.srs[cardId].stability).toBe(15);
    }
  });

  it('22. Corrupted task does not create an active card', () => {
    const wordCorrupted = {
      id: 'L1_V099',
      writing: 'てすと',
      contextProduction: { id: 'bad', prompt: '', acceptedAnswers: [] },
    };
    const skills = vocabularySkills(wordCorrupted);
    expect(skills).not.toContain(SKILLS.CONTEXT_PRODUCTION);
  });
});

describe('FSRS Rating Policy & Response Time', () => {
  it('23. Correct first attempt -> Good', () => {
    const quality = SRS.qualityFromMistakes(0);
    expect(quality).toBe(SRS.Quality.Good);
  });

  it('24. Very slow correct first attempt (>= 30s) -> Hard (3)', () => {
    const adjusted = adjustQualityByTime(SRS.Quality.Good, 32_000, 'context-production');
    expect(adjusted).toBe(SRS.Quality.Hard);
  });

  it('25. First mistake -> Again (0)', () => {
    const quality = SRS.qualityFromMistakes(1);
    expect(quality).toBe(SRS.Quality.Again);
  });
});

describe('Task Rotation & Selection', () => {
  it('33. Tasks of same word do not repeat consecutively when alternatives exist', () => {
    const wordMultiTask = {
      id: 'L1_V023',
      contextProduction: [
        {
          id: 'L01_V023_cp_01',
          focusItemId: 'L1_V023',
          prompt: 'Prompt 1',
          acceptedAnswers: ['答1'],
          requiredForm: 'copula',
        },
        {
          id: 'L01_V023_cp_02',
          focusItemId: 'L1_V023',
          prompt: 'Prompt 2',
          acceptedAnswers: ['答2'],
          requiredForm: 'copula',
        },
      ],
    };

    const task1 = selectProductionTask(wordMultiTask, null, [], { lastTaskId: 'L01_V023_cp_01' });
    expect(task1.id).toBe('L01_V023_cp_02');

    const task2 = selectProductionTask(wordMultiTask, null, [], { lastTaskId: 'L01_V023_cp_02' });
    expect(task2.id).toBe('L01_V023_cp_01');
  });
});

describe('Mastery Calculation with Context Production', () => {
  it('36. Recall does not count as production', () => {
    const now = Date.now();
    const cards = [
      { id: 'L1_V023', itemId: 'L1_V023', skill: SKILLS.RECOGNITION, stability: 35, reps: 5 },
      { id: 'L1_V023::recall', itemId: 'L1_V023', skill: SKILLS.RECALL, stability: 35, reps: 5 },
      {
        id: 'L1_V023::context-production',
        itemId: 'L1_V023',
        skill: SKILLS.CONTEXT_PRODUCTION,
        stability: 0,
        reps: 0,
      },
    ];
    const events = [
      {
        itemId: 'L1_V023',
        skill: SKILLS.RECOGNITION,
        mode: 'multiple-choice',
        eventType: 'review',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: now - 86400000 * 2,
      },
      {
        itemId: 'L1_V023',
        skill: SKILLS.RECALL,
        mode: 'typing',
        eventType: 'review',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: now - 86400000,
      },
    ];

    const result = calculateMastery({
      itemId: 'L1_V023',
      cards,
      events,
      applicableSkills: [SKILLS.RECOGNITION, SKILLS.RECALL, SKILLS.CONTEXT_PRODUCTION],
      now,
      getRetrievability: () => 1.0,
    });

    expect(result.level).not.toBe(MASTERY_LEVELS.MASTERED);
    expect(result.productionStatus).toBe('Production пока не проверен');
  });

  it('38. Valid context-production review counts as evidence toward Mastered', () => {
    const now = Date.now();
    const cards = [
      { id: 'L1_V023', itemId: 'L1_V023', skill: SKILLS.RECOGNITION, stability: 95, reps: 10 },
      { id: 'L1_V023::recall', itemId: 'L1_V023', skill: SKILLS.RECALL, stability: 95, reps: 10 },
      {
        id: 'L1_V023::context-production',
        itemId: 'L1_V023',
        skill: SKILLS.CONTEXT_PRODUCTION,
        stability: 95,
        reps: 10,
      },
    ];
    const events = [
      {
        itemId: 'L1_V023',
        skill: SKILLS.RECOGNITION,
        mode: 'multiple-choice',
        eventType: 'review',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: now - 86400000 * 4,
      },
      {
        itemId: 'L1_V023',
        skill: SKILLS.RECALL,
        mode: 'typing',
        eventType: 'review',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: now - 86400000 * 4,
      },
      {
        itemId: 'L1_V023',
        skill: SKILLS.RECALL,
        mode: 'typing',
        eventType: 'review',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: now - 86400000 * 3,
      },
      {
        itemId: 'L1_V023',
        skill: SKILLS.CONTEXT_PRODUCTION,
        mode: 'context-production',
        eventType: 'review',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: now - 86400000 * 2,
      },
      {
        itemId: 'L1_V023',
        skill: SKILLS.CONTEXT_PRODUCTION,
        mode: 'context-production',
        eventType: 'review',
        firstAttemptCorrect: true,
        effectiveRating: 4,
        reviewedAt: now - 86400000,
      },
    ];

    const result = calculateMastery({
      itemId: 'L1_V023',
      cards,
      events,
      applicableSkills: [SKILLS.RECOGNITION, SKILLS.RECALL, SKILLS.CONTEXT_PRODUCTION],
      now,
      getRetrievability: () => 1.0,
    });

    expect(result.level).toBe(MASTERY_LEVELS.MASTERED);
    expect(result.productionStatus).toBe('Production проверен');
  });

  it('Shows "Production-задание пока недоступно" when word has no context-production task', () => {
    const result = calculateMastery({
      itemId: 'L1_V001',
      cards: [
        { id: 'L1_V001', itemId: 'L1_V001', skill: SKILLS.RECOGNITION, stability: 10, reps: 2 },
      ],
      events: [],
      applicableSkills: [SKILLS.RECOGNITION],
      now: Date.now(),
      getRetrievability: () => 1.0,
    });

    expect(result.productionStatus).toBe('Production-задание пока недоступно');
  });
});

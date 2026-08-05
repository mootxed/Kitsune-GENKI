import { SRS } from '../srs.js';

export const REASON_CODES = {
  FSRS_DUE_REVIEW: 'FSRS_DUE_REVIEW',
  FSRS_OVERDUE: 'FSRS_OVERDUE',
  FSRS_RELEARNING: 'FSRS_RELEARNING',
  NEW_PLAN_ITEM: 'NEW_PLAN_ITEM',
  SKILL_PROGRESSION: 'SKILL_PROGRESSION',
  ACTIVE_SESSION_RESTORE: 'ACTIVE_SESSION_RESTORE',
  SUPPLEMENTAL_PRACTICE: 'SUPPLEMENTAL_PRACTICE',
  MANUAL_PRACTICE: 'MANUAL_PRACTICE',
  COURSE_REQUIREMENT: 'COURSE_REQUIREMENT',
};

/**
 * Calculates a structured, human-friendly explanation for why a card is being presented.
 *
 * @param {Object} params
 * @param {Object} params.card - The card object (FSRS or practice item)
 * @param {Object} [params.reviewContext] - Active review context (mode, skill, etc.)
 * @param {Object} [params.sessionContext] - Session state (isFirstAttempt, sessionLapses, mode)
 * @param {Object} [params.planContext] - Active study plan context
 * @param {number} [params.now=Date.now()] - Timestamp for calculation
 * @returns {Object} Structured reason object with code, category, title, description, details
 */
export function getCardSchedulingReason({
  card,
  reviewContext = {},
  sessionContext = {},
  planContext = {},
  now = Date.now(),
} = {}) {
  if (!card) {
    return {
      code: REASON_CODES.MANUAL_PRACTICE,
      category: 'supplemental',
      title: 'Учебное задание',
      description: 'Карточка выбранного учебного режима.',
      details: {},
    };
  }

  const isSupplemental =
    card.isSupplemental === true ||
    sessionContext.isSupplemental === true ||
    reviewContext.isSupplemental === true ||
    reviewContext.mode === 'workbook' ||
    card.type === 'workbook';

  if (isSupplemental) {
    return {
      code: REASON_CODES.SUPPLEMENTAL_PRACTICE,
      category: 'supplemental',
      title: 'Дополнительная практика',
      description: 'Это упражнение тренирует навыки и не изменяет основное расписание FSRS.',
      details: {
        skill: reviewContext.skill || card.skill || 'practice',
        mode: reviewContext.mode || 'supplemental',
      },
    };
  }

  // Session relearning loop (error during current session)
  if (sessionContext.sessionLapses > 0 || sessionContext.isFirstAttempt === false) {
    return {
      code: REASON_CODES.FSRS_RELEARNING,
      category: 'relearning',
      title: 'Повторное обучение',
      description:
        'В прошлый раз ответ был неверным, поэтому карточка вернулась в текущей сессии для закрепления.',
      details: {
        sessionLapses: sessionContext.sessionLapses || 1,
        skill: reviewContext.skill || card.skill,
      },
    };
  }

  // Active session restoration context
  if (sessionContext.restoredFromActiveSession) {
    return {
      code: REASON_CODES.ACTIVE_SESSION_RESTORE,
      category: 'required-review',
      title: 'Восстановленная сессия',
      description: 'Карточка из прерванной учебной сессии.',
      details: {
        sessionLapses: sessionContext.sessionLapses || 0,
      },
    };
  }

  // New item from plan / chapter
  const isNewCard =
    card.state === 0 || card.state === 'New' || (card.reps === 0 && !card.lastReview);

  if (isNewCard) {
    return {
      code: REASON_CODES.NEW_PLAN_ITEM,
      category: 'plan-new',
      title: 'Новый материал',
      description: 'Эта карточка добавлена из текущей главы по вашему учебному плану.',
      details: {
        chapterId: card.chapterId || planContext.activeChapterId,
        skill: reviewContext.skill || card.skill || 'vocab',
      },
    };
  }

  // FSRS Due / Overdue calculations
  const dueMs = card.due ? new Date(card.due).getTime() : now;
  const daysOverdue = Math.max(0, Math.floor((now - dueMs) / (1000 * 60 * 60 * 24)));

  let retrievabilityVal = null;
  if (card.stability != null && card.lastReview != null) {
    try {
      const rFloat = SRS.getRetrievability ? SRS.getRetrievability(card, now) : null;
      if (Number.isFinite(rFloat)) {
        retrievabilityVal = Math.round(rFloat * 100);
      }
    } catch {
      /* ignore retrievability errors */
    }
  }

  if (daysOverdue >= 1) {
    return {
      code: REASON_CODES.FSRS_OVERDUE,
      category: 'required-review',
      title: 'Просроченное повторение',
      description: `Повторение этой карточки было запланировано ${daysOverdue} дн. назад. Пора освежить знания.`,
      details: {
        dueAt: dueMs,
        daysOverdue,
        retrievability: retrievabilityVal,
        previousRating: card.lastRating,
        stability: card.stability ? Math.round(card.stability * 10) / 10 : null,
      },
    };
  }

  if (card.reps > 0 && reviewContext.skill && reviewContext.skill !== 'kanji') {
    return {
      code: REASON_CODES.SKILL_PROGRESSION,
      category: 'required-review',
      title: 'Развитие навыка',
      description:
        'Вы уже узнаёте это слово, теперь приложение проверяет активное воспроизведение и написание.',
      details: {
        skill: reviewContext.skill,
        retrievability: retrievabilityVal,
        reps: card.reps,
      },
    };
  }

  return {
    code: REASON_CODES.FSRS_DUE_REVIEW,
    category: 'required-review',
    title: 'Пора повторить',
    description: 'Вы уже изучали эту карточку, и сейчас вероятность воспоминания начала снижаться.',
    details: {
      dueAt: dueMs,
      daysOverdue: 0,
      retrievability: retrievabilityVal,
      previousRating: card.lastRating,
      stability: card.stability ? Math.round(card.stability * 10) / 10 : null,
    },
  };
}

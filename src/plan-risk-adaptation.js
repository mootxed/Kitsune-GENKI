/* src/plan-risk-adaptation.js — Plan Risk Model & Automatic Load Adaptation Engine */

import { calculateSevenDayForecast } from './forecast-service.js';

export const RISK_LEVELS = {
  NORMAL: 'normal',
  ELEVATED: 'elevated',
  UNREALISTIC: 'unrealistic',
  RECOVERY: 'recovery',
};

/**
 * Assesses current plan risk and recommends automatic load adaptation options.
 *
 * @param {Object} params
 * @param {Object} params.state - Application state
 * @param {Object} [params.forecast] - 7-day load forecast (calculated if omitted)
 * @param {number} [params.now=Date.now()] - Timestamp
 * @returns {Object} Risk evaluation & adaptation recommendations
 */
export function evaluatePlanRiskAndAdaptation({ state, forecast = null, now = Date.now() } = {}) {
  const currentForecast = forecast || calculateSevenDayForecast({ state, now });

  const dailyCapacity = Number(state?.dailyCapacityMinutes || 30);
  const backlogCount = currentForecast.backlogCount || 0;
  const todayForecast = currentForecast.days?.[0] || {
    dueReviews: 0,
    expectedNewCards: 0,
    expectedMinutes: 0,
  };
  const overdueReviews = Math.max(0, todayForecast.dueReviews - 10);

  let risk = currentForecast.risk;
  let explanationText = '';
  let decision = 'KEEP_CAPACITY';
  let recommendedNewCards = todayForecast.expectedNewCards;
  const previousNewCards = 10; // Standard target per batch

  if (backlogCount > 25 || risk === RISK_LEVELS.RECOVERY) {
    risk = RISK_LEVELS.RECOVERY;
    decision = 'RECOVERY_MODE_ACTIVATED';

    // Throttle new cards heavily during backlog recovery
    if (overdueReviews > 30) {
      recommendedNewCards = 0;
      explanationText = `Сегодня новые карточки приостановлены (${todayForecast.dueReviews} обязательных повторений). Сначала восстанавливаем память.`;
    } else if (overdueReviews > 15) {
      recommendedNewCards = Math.max(2, Math.floor(todayForecast.expectedNewCards / 2));
      explanationText = `Сегодня добавлено меньше новых карточек (${recommendedNewCards} вместо ${previousNewCards}), так как накопилось ${todayForecast.dueReviews} повторений.`;
    } else {
      recommendedNewCards = Math.min(5, todayForecast.expectedNewCards);
      explanationText = `В режиме восстановления новые карточки временно уменьшены до ${recommendedNewCards}.`;
    }
  } else if (risk === RISK_LEVELS.UNREALISTIC) {
    decision = 'REDUCE_NEW_CARDS';
    recommendedNewCards = Math.min(4, Math.floor(dailyCapacity / 6));
    explanationText = `Текущий темп может стать слишком тяжёлым. В ближайшие 7 дней ожидается около ${currentForecast.averageMinutes} мин/день при лимите ${dailyCapacity} мин.`;
  } else if (risk === RISK_LEVELS.ELEVATED) {
    decision = 'REDUCE_NEW_CARDS';
    recommendedNewCards = Math.min(6, todayForecast.expectedNewCards);
    explanationText = `Нагрузка повышенная (${currentForecast.peakMinutes} мин в пиковый день). Новые карточки умеренно ограничены.`;
  } else {
    explanationText = 'План соответствует вашей обычной учебной нагрузке.';
  }

  const decisionExplanation = {
    decision,
    previous: previousNewCards,
    next: recommendedNewCards,
    inputs: {
      overdueReviews: todayForecast.dueReviews,
      backlogCount,
      expectedMinutes: todayForecast.expectedMinutes,
      dailyCapacityMinutes: dailyCapacity,
    },
    reason:
      backlogCount > 25
        ? 'REVIEW_BACKLOG'
        : risk === RISK_LEVELS.UNREALISTIC
          ? 'UNREALISTIC_DEADLINE'
          : 'NORMAL',
    explanationText,
  };

  return {
    risk,
    decisionExplanation,
    recommendedNewCards,
    forecast: currentForecast,
    isRecoveryMode: risk === RISK_LEVELS.RECOVERY,
    isUnrealistic: risk === RISK_LEVELS.UNREALISTIC,
    warningBanner:
      risk === RISK_LEVELS.UNREALISTIC || risk === RISK_LEVELS.ELEVATED
        ? {
            title:
              risk === RISK_LEVELS.UNREALISTIC ? 'Нереалистичный график' : 'Повышенная нагрузка',
            message: explanationText,
            actionLabel: 'Изменить цель или темп',
          }
        : null,
  };
}

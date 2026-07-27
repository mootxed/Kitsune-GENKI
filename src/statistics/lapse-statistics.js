/* src/statistics/lapse-statistics.js — Calculation of card lapses and problem cards */

import { State } from 'ts-fsrs';
import { isLeech } from '../card-behavior.js';
import { parseCardIdentity } from '../knowledge-model.js';

export const RISK_WEIGHTS = Object.freeze({
  RECENT_AGAIN: 30, // Свежий Again за последние 7 дней
  TOTAL_LAPSES: 10, // Каждая ошибка на карточке
  RELEARNING_STATE: 25, // Текущая стадия Relearning (доучивание)
  LOW_STABILITY: 15, // Стабильность < 7 дней
  LOW_RETENTION: 15, // Низкая точность последних попыток (< 60%)
  REPEAT_HARDS: 5, // Повторяющиеся трудности (Hard)
  HINT_USAGE: 5, // Использование подсказок
});

/**
 * Рассчитывает статистику срывов (Lapses) и рейтинг проблемных карточек.
 *
 * @param {Array<Object>} events - валидные review events
 * @param {Object} srsCards - словарь карточек state.srs
 * @param {Object} [options]
 * @param {number|'all'} [options.timeRangeDays=30]
 * @param {number} [options.now=Date.now()]
 * @returns {Object} результат расчёта
 */
export function calculateLapseStats(events = [], srsCards = {}, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const timeRangeDays = options.timeRangeDays || 30;

  // 1. Выделяем события, относящиеся к карточкам в стадии Review (state = 2)
  const reviewAttemptEvents = events.filter((ev) => {
    const previousState =
      ev.previousCard?.state ??
      ev.fsrs?.state ??
      (typeof ev.state === 'number' ? ev.state : srsCards[ev.cardId]?.state);

    // Учитываем попытки, сделанные на стадии Review ( state == 2 )
    return previousState === State.Review || previousState === 2;
  });

  const reviewLapseEvents = reviewAttemptEvents.filter((ev) => ev.effectiveRating === 0);

  const totalLapses = reviewLapseEvents.length;
  const totalReviewAttempts = reviewAttemptEvents.length;

  const isInsufficient = totalReviewAttempts === 0;
  const lapseRate = isInsufficient ? null : totalLapses / totalReviewAttempts;
  const formattedLapseRate = isInsufficient
    ? 'Недостаточно данных'
    : `${(lapseRate * 100).toFixed(1)}%`;

  // Уникальные карточки со срывами за период
  const cardsWithLapses = new Set(reviewLapseEvents.map((ev) => ev.cardId));
  const cardsWithLapsesCount = cardsWithLapses.size;

  // 2. Статистика по всем карточкам в SRS
  const allCards = Object.values(srsCards || {}).filter(Boolean);

  const cardsInRelearning = allCards.filter((c) => c.state === State.Relearning || c.state === 3);
  const cardsInRelearningCount = cardsInRelearning.length;

  const leechCards = allCards.filter((c) => isLeech(c));
  const leechCardsCount = leechCards.length;

  // 3. Среднее время от последнего успешного review до lapse
  let totalTimeFromSuccessMs = 0;
  let timeFromSuccessCount = 0;

  for (const lapseEv of reviewLapseEvents) {
    if (lapseEv.previousCard?.lastReview && Number.isFinite(lapseEv.previousCard.lastReview)) {
      const diff = lapseEv.reviewedAt - lapseEv.previousCard.lastReview;
      if (diff > 0) {
        totalTimeFromSuccessMs += diff;
        timeFromSuccessCount++;
      }
    }
  }

  const avgTimeFromSuccessToLapseMs =
    timeFromSuccessCount > 0 ? Math.round(totalTimeFromSuccessMs / timeFromSuccessCount) : null;

  // 4. Построение списка наиболее проблемных карточек (Problem Cards)
  const problemCards = buildProblemCardsList(allCards, events, now);

  return {
    isInsufficient,
    totalLapses,
    totalReviewAttempts,
    lapseRate,
    formattedLapseRate,
    cardsWithLapsesCount,
    cardsInRelearningCount,
    leechCardsCount,
    avgTimeFromSuccessToLapseMs,
    problemCards,
  };
}

/**
 * Построение и ранжирование проблемных карточек по risk score.
 */
function buildProblemCardsList(allCards, events, now) {
  // Группировка событий по cardId
  const eventsByCard = new Map();
  for (const ev of events) {
    if (!ev.cardId) continue;
    if (!eventsByCard.has(ev.cardId)) eventsByCard.set(ev.cardId, []);
    eventsByCard.get(ev.cardId).push(ev);
  }

  const rankedCards = [];

  for (const card of allCards) {
    if (!card || card.planLocked === true) continue;

    const cardEvents = eventsByCard.get(card.id) || [];

    // Считаем совокупный risk score
    let score = 0;

    // Свежий Again (в течение 7 дней)
    const recentLapse = cardEvents.find(
      (ev) => ev.effectiveRating === 0 && ev.reviewedAt >= now - 7 * 86400000
    );
    if (recentLapse) {
      score += RISK_WEIGHTS.RECENT_AGAIN;
    }

    // Общее количество lapses
    const lapses = Number.isInteger(card.lapses) ? card.lapses : 0;
    score += lapses * RISK_WEIGHTS.TOTAL_LAPSES;

    // Состояние Relearning
    if (card.state === State.Relearning || card.state === 3) {
      score += RISK_WEIGHTS.RELEARNING_STATE;
    }

    // Низкая стабильность (< 7 дней)
    const stability = Number.isFinite(card.stability) ? card.stability : 0;
    if (card.reps > 0 && stability < 7) {
      score += RISK_WEIGHTS.LOW_STABILITY;
    }

    // Точность за последние попытки
    let recentRetention = 1.0;
    if (cardEvents.length > 0) {
      const recentWindow = cardEvents.slice(-10);
      const successCount = recentWindow.filter((ev) => ev.effectiveRating !== 0).length;
      recentRetention = successCount / recentWindow.length;
      if (recentRetention < 0.6) {
        score += RISK_WEIGHTS.LOW_RETENTION;
      }
    }

    // Повторяющиеся Hard
    const recentHards = cardEvents.filter((ev) => ev.effectiveRating === 3).length;
    if (recentHards >= 2) {
      score += RISK_WEIGHTS.REPEAT_HARDS;
    }

    // Использование подсказок
    const hintCount = cardEvents.filter((ev) => ev.hintUsed).length;
    if (hintCount >= 2) {
      score += RISK_WEIGHTS.HINT_USAGE;
    }

    // Включаем карточку в список, если у неё есть ошибки или высокий риск
    if (lapses > 0 || score >= 20 || recentLapse) {
      const identity = parseCardIdentity(card);
      const lastProblemEv = cardEvents
        .filter((ev) => ev.effectiveRating === 0 || ev.effectiveRating === 3)
        .sort((a, b) => b.reviewedAt - a.reviewedAt)[0];

      rankedCards.push({
        cardId: card.id,
        itemId: identity.itemId,
        japanese: card.japanese || card.word || card.kanji || card.kana || identity.itemId,
        translation: card.translation || card.meaning || card.english || card.russian || '',
        skill: identity.skill,
        lapses,
        recentRetention,
        formattedRetention: `${(recentRetention * 100).toFixed(0)}%`,
        stability: Math.round(stability * 10) / 10,
        difficulty: Math.round((card.difficulty || 0) * 10) / 10,
        due: card.due,
        lastProblemMode: lastProblemEv?.mode || '—',
        riskScore: score,
        isLeech: isLeech(card),
      });
    }
  }

  // Сортировка карточек: риск по убыванию, затем свежесть ошибки
  return rankedCards.sort((a, b) => b.riskScore - a.riskScore || (b.due || 0) - (a.due || 0));
}

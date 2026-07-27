/* src/statistics/mastery-statistics.js — Distribution of knowledge items across mastery levels */

import { MASTERY_LEVELS, calculateMastery } from '../mastery.js';
import { SRS } from '../../srs.js';
import { parseCardIdentity } from '../knowledge-model.js';

/**
 * Рассчитывает распределение knowledge items по уровням освоения (Mastery).
 *
 * @param {Object} state - app state
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()]
 * @returns {Object} результат расчёта mastery
 */
export function calculateMasteryStats(state, options = {}) {
  if (!state || typeof state !== 'object') {
    return {
      totalItemsCount: 0,
      distribution: {},
      recentLapseCappedCount: 0,
      missingProductionCappedCount: 0,
    };
  }

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const srsCards = state.srs || {};
  const reviewEvents = Array.isArray(state.reviewEvents) ? state.reviewEvents : [];
  const masteryArchive = state.masteryArchive || {};

  // Группировка карточек и событий по itemId
  const cardsByItem = new Map();
  for (const card of Object.values(srsCards)) {
    if (!card) continue;
    const itemId = parseCardIdentity(card).itemId;
    if (!itemId) continue;
    if (!cardsByItem.has(itemId)) cardsByItem.set(itemId, []);
    cardsByItem.get(itemId).push(card);
  }

  const eventsByItem = new Map();
  for (const ev of reviewEvents) {
    if (!ev || !ev.itemId) continue;
    if (!eventsByItem.has(ev.itemId)) eventsByItem.set(ev.itemId, []);
    eventsByItem.get(ev.itemId).push(ev);
  }

  const distribution = {
    [MASTERY_LEVELS.NEW]: 0,
    [MASTERY_LEVELS.FAMILIAR]: 0,
    [MASTERY_LEVELS.REMEMBERING]: 0,
    [MASTERY_LEVELS.CONFIDENT]: 0,
    [MASTERY_LEVELS.MASTERED]: 0,
  };

  let recentLapseCappedCount = 0;
  let missingProductionCappedCount = 0;
  let totalItemsCount = 0;

  for (const [itemId, cards] of cardsByItem.entries()) {
    totalItemsCount++;

    const events = eventsByItem.get(itemId) || [];
    const archive = masteryArchive[itemId] || null;

    try {
      const mastery = calculateMastery({
        itemId,
        cards,
        events,
        archive,
        now,
        getRetrievability: SRS.getRetrievability,
      });

      const level = mastery.level || MASTERY_LEVELS.NEW;
      if (distribution[level] !== undefined) {
        distribution[level]++;
      } else {
        distribution[MASTERY_LEVELS.NEW]++;
      }

      if (mastery.hasRecentLapse) {
        recentLapseCappedCount++;
      }

      if (!mastery.productionSkill) {
        missingProductionCappedCount++;
      }
    } catch (err) {
      console.error('[MasteryStats Error]', err);
      distribution[MASTERY_LEVELS.NEW]++;
    }
  }

  return {
    totalItemsCount,
    distribution,
    recentLapseCappedCount,
    missingProductionCappedCount,
  };
}

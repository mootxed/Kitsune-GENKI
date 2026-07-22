/* src/srs-limits.js — ограничение выдачи новых карточек без влияния на повторения */

import { State } from 'ts-fsrs';
import { SRS_LOAD_CONFIG } from './srs-config.js';

export function studyDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function countNewCardsIntroducedOn(cards, day) {
  return Object.values(cards).filter((card) => card.introducedOn === day).length;
}

/**
 * Выбирает карточки для сессии: все обычные повторения и ограниченное число новых.
 * Карточка получает introducedOn при попадании в очередь, чтобы дневной лимит
 * сохранялся между сессиями и после перезапуска приложения.
 */
export function limitNewCardsForSession(dueCards, srsRecords, options = {}) {
  const now = options.now ?? Date.now();
  const day = options.day ?? studyDay(now);
  const config = { ...SRS_LOAD_CONFIG, ...options.config };

  const reviews = [];
  const newCards = [];

  for (const card of dueCards) {
    if (card.state === State.New) newCards.push(card);
    else reviews.push(card);
  }

  const introducedToday = countNewCardsIntroducedOn(srsRecords, day);
  const remainingDaily = Math.max(0, config.dailyNewCardsLimit - introducedToday);
  const sessionNewLimit = Math.max(0, config.sessionNewCardsLimit);

  // Сначала продолжаем ранее открытые карточки, затем — сегодняшние и новые.
  const orderedNewCards = [...newCards].sort((a, b) => {
    const aPriority = a.introducedOn === day ? 1 : a.introducedOn ? 0 : 2;
    const bPriority = b.introducedOn === day ? 1 : b.introducedOn ? 0 : 2;
    return aPriority - bPriority;
  });

  let freshSlots = remainingDaily;
  const selectedNew = [];
  for (const card of orderedNewCards) {
    if (selectedNew.length >= sessionNewLimit) break;

    if (!card.introducedOn) {
      if (freshSlots === 0) continue;
      card.introducedOn = day;
      freshSlots--;
    }

    selectedNew.push(card);
  }

  return [...reviews, ...selectedNew];
}

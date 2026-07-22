/* src/srs-limits.js — ограничение выдачи новых карточек без влияния на повторения */

import { State } from 'ts-fsrs';
import { SRS_LOAD_CONFIG } from './srs-config.js';
import { localDateKey } from './local-date.js';
import { SKILLS, parseCardIdentity } from './knowledge-model.js';

export function studyDay(now = Date.now()) {
  return localDateKey(now);
}

export function countNewCardsIntroducedOn(cards, day) {
  return new Set(
    Object.values(cards)
      .filter((card) => card.introducedOn === day)
      .map((card) => parseCardIdentity(card).itemId)
  ).size;
}

const SKILL_PRIORITY = Object.freeze({
  [SKILLS.RECOGNITION]: 0,
  [SKILLS.RECALL]: 1,
  [SKILLS.READING_WRITING]: 2,
  [SKILLS.CONTEXT_PRODUCTION]: 3,
});

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

  const firstIntroductionByItem = new Map();
  for (const card of Object.values(srsRecords || {})) {
    if (!card.introducedOn) continue;
    const itemId = parseCardIdentity(card).itemId;
    const knownDay = firstIntroductionByItem.get(itemId);
    if (!knownDay || card.introducedOn < knownDay) {
      firstIntroductionByItem.set(itemId, card.introducedOn);
    }
  }
  const introducedToday = [...firstIntroductionByItem.values()].filter(
    (introducedOn) => introducedOn === day
  ).length;
  const remainingDaily = Math.max(0, config.dailyNewCardsLimit - introducedToday);
  const sessionNewLimit = Math.max(0, config.sessionNewCardsLimit);

  // Сначала продолжаем ранее открытые карточки, затем — сегодняшние и новые.
  const orderedNewCards = [...newCards].sort((a, b) => {
    const aItem = parseCardIdentity(a).itemId;
    const bItem = parseCardIdentity(b).itemId;
    const aIntroduced = firstIntroductionByItem.get(aItem);
    const bIntroduced = firstIntroductionByItem.get(bItem);
    const aPriority = aIntroduced === day ? 1 : aIntroduced ? 0 : 2;
    const bPriority = bIntroduced === day ? 1 : bIntroduced ? 0 : 2;
    return (
      aPriority - bPriority ||
      (SKILL_PRIORITY[parseCardIdentity(a).skill] ?? 99) -
        (SKILL_PRIORITY[parseCardIdentity(b).skill] ?? 99)
    );
  });

  let freshSlots = remainingDaily;
  const selectedNew = [];
  const selectedItems = new Set(reviews.map((card) => parseCardIdentity(card).itemId));
  for (const card of orderedNewCards) {
    if (selectedNew.length >= sessionNewLimit) break;
    const itemId = parseCardIdentity(card).itemId;
    if (selectedItems.has(itemId)) continue;

    if (!firstIntroductionByItem.has(itemId)) {
      if (freshSlots === 0) continue;
      freshSlots--;
      firstIntroductionByItem.set(itemId, day);
    }

    if (!card.introducedOn) card.introducedOn = day;
    selectedNew.push(card);
    selectedItems.add(itemId);
  }

  return [...reviews, ...selectedNew];
}

/** Возвращает ровно то число карточек, которое запустится, не отмечая новые выданными. */
export function countAvailableCardsForSession(dueCards, srsRecords, options = {}) {
  const clonedRecords = Object.fromEntries(
    Object.entries(srsRecords || {}).map(([key, card]) => [key, { ...card }])
  );
  const clonedDue = (dueCards || []).map((card) => clonedRecords[card.id] || { ...card });
  return limitNewCardsForSession(clonedDue, clonedRecords, options).length;
}

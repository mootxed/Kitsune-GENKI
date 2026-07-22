/* Stable knowledge-item and skill identifiers shared by SRS, UI and mastery. */

import { typingCapability } from './typing-capability.js';
import { productionContext } from './production-context.js';
import { localDateKey } from './local-date.js';

export const KNOWLEDGE_TYPES = Object.freeze({
  VOCABULARY: 'vocabulary',
  GRAMMAR: 'grammar',
  PARTICLE: 'particle',
});

export const SKILLS = Object.freeze({
  RECOGNITION: 'recognition',
  RECALL: 'recall',
  READING_WRITING: 'reading-writing',
  CONTEXT_PRODUCTION: 'context-production',
});

const CARD_SEPARATOR = '::';
const KNOWN_SKILLS = new Set(Object.values(SKILLS));

export function makeCardId(itemId, skill = SKILLS.RECOGNITION) {
  if (typeof itemId !== 'string' || itemId.length === 0) {
    throw new Error('[Knowledge] itemId обязателен');
  }
  if (!KNOWN_SKILLS.has(skill)) throw new Error(`[Knowledge] Неизвестный навык: ${skill}`);
  // Recognition keeps the historic key, so old links/backups continue to work.
  return skill === SKILLS.RECOGNITION ? itemId : `${itemId}${CARD_SEPARATOR}${skill}`;
}

export function parseCardIdentity(cardOrId) {
  const record = cardOrId && typeof cardOrId === 'object' ? cardOrId : null;
  const cardId = String(record?.id ?? cardOrId ?? '');
  if (record?.itemId && KNOWN_SKILLS.has(record.skill)) {
    return {
      cardId,
      itemId: String(record.itemId),
      skill: record.skill,
      knowledgeType: record.knowledgeType || KNOWLEDGE_TYPES.VOCABULARY,
    };
  }

  const separatorIndex = cardId.lastIndexOf(CARD_SEPARATOR);
  const suffix = separatorIndex >= 0 ? cardId.slice(separatorIndex + CARD_SEPARATOR.length) : '';
  const skill = KNOWN_SKILLS.has(suffix) ? suffix : SKILLS.RECOGNITION;
  const itemId = skill === SKILLS.RECOGNITION ? cardId : cardId.slice(0, separatorIndex);
  return { cardId, itemId, skill, knowledgeType: KNOWLEDGE_TYPES.VOCABULARY };
}

export function vocabularySkills(word) {
  const text = word?.kanji || word?.writing || '';
  const hasKanji = /[\u3400-\u4dbf\u4e00-\u9fff]/u.test(text);
  const { canType } = typingCapability(word);
  const skills = [SKILLS.RECOGNITION];
  if (canType) skills.push(SKILLS.RECALL);
  if (hasKanji) skills.push(SKILLS.READING_WRITING);
  if (canType && productionContext(word)) skills.push(SKILLS.CONTEXT_PRODUCTION);
  return skills;
}

function hasEarlierCleanSuccess(events, archive, itemId, skill, day) {
  const liveSuccess = (events || []).some(
    (event) =>
      event?.itemId === itemId &&
      event.skill === skill &&
      modeSkill(event.mode) === skill &&
      event.eventType === 'review' &&
      !event.undoneAt &&
      event.firstAttemptCorrect === true &&
      event.effectiveRating !== 0 &&
      Number.isInteger(event.reviewedAt) &&
      localDateKey(event.reviewedAt) < day
  );
  if (liveSuccess) return true;
  return (archive?.successfulDays?.[skill] || []).some((successDay) => successDay < day);
}

/** Skills become new cards in stages, never on the same day as their prerequisite. */
export function vocabularySkillsReadyForIntroduction(
  word,
  events = [],
  archive = null,
  now = Date.now()
) {
  const applicable = vocabularySkills(word);
  const day = localDateKey(now);
  const recognitionReady = hasEarlierCleanSuccess(
    events,
    archive,
    word.id,
    SKILLS.RECOGNITION,
    day
  );
  const recallReady = hasEarlierCleanSuccess(events, archive, word.id, SKILLS.RECALL, day);

  return applicable.filter((skill) => {
    if (skill === SKILLS.RECOGNITION) return true;
    if (skill === SKILLS.RECALL) return recognitionReady;
    return recallReady;
  });
}

export function cardsForItem(srsRecords, itemId) {
  return Object.values(srsRecords || {}).filter(
    (card) => parseCardIdentity(card).itemId === itemId
  );
}

export function modeSkill(mode) {
  if (
    mode === 'reverse-multiple-choice' ||
    mode === 'multiple-choice' ||
    mode === 'context-sentence'
  ) {
    return SKILLS.RECOGNITION;
  }
  if (mode === 'typing') return SKILLS.RECALL;
  if (mode === 'drawing') return SKILLS.READING_WRITING;
  if (mode === 'context-production') return SKILLS.CONTEXT_PRODUCTION;
  return null;
}

export function modeCanSchedule(card, mode) {
  if (
    ['preview', 'system-fallback', 'debug-skip', 'particle-quiz', 'sentence-building'].includes(
      mode
    )
  ) {
    return false;
  }
  const expectedSkill = modeSkill(mode);
  return expectedSkill !== null && parseCardIdentity(card).skill === expectedSkill;
}

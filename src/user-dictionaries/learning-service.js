import { SRS } from '../../srs.js';
import {
  cardsForItem,
  makeCardId,
  parseCardIdentity,
  vocabularySkillsReadyForIntroduction,
} from '../knowledge-model.js';
import { createKnowledgeItemFromUserEntry } from './knowledge-item-adapter.js';
import { getUserEntryCapabilities } from './capabilities.js';
import { normalizeUserDictionaryEntry } from './normalize.js';

function removeItemProgress(state, entryId) {
  const cardIds = Object.keys(state.srs || {}).filter(
    (cardId) => parseCardIdentity(cardId).itemId === entryId
  );
  const cardIdSet = new Set(cardIds);
  state.srs = Object.fromEntries(
    Object.entries(state.srs || {}).filter(([cardId]) => !cardIdSet.has(cardId))
  );
  state.reviewEvents = (state.reviewEvents || []).filter(
    (event) => event.itemId !== entryId && !cardIdSet.has(event.cardId)
  );
  state.pendingReviewLogs = (state.pendingReviewLogs || []).filter(
    (event) => event.itemId !== entryId && !cardIdSet.has(event.cardId)
  );
  if (state.masteryArchive) delete state.masteryArchive[entryId];
  return cardIds.length;
}

export function syncUserEntryCards(entry, state, now = Date.now()) {
  if (!entry.learningEnabled) return { added: 0, changed: false };
  const item = createKnowledgeItemFromUserEntry(entry);
  const capabilities = getUserEntryCapabilities(entry);
  const availableSkills = new Set(capabilities.skills);
  const skills = vocabularySkillsReadyForIntroduction(
    item,
    state.reviewEvents || [],
    state.masteryArchive?.[entry.id],
    now
  );
  let added = 0;
  let changed = false;
  // Создаём/возобновляем карточки доступных навыков
  for (const skill of skills) {
    const cardId = makeCardId(entry.id, skill);
    if (!state.srs[cardId]) {
      state.srs[cardId] = SRS.newCard(cardId, {
        itemId: entry.id,
        skill,
        knowledgeType: 'vocabulary',
        sourceType: 'user-dictionary',
      });
      added += 1;
      changed = true;
    } else if (
      state.srs[cardId].suspended &&
      state.srs[cardId].suspendedReason !== 'learning-disabled'
    ) {
      // Возобновляем только если причина suspension — не явное исключение из обучения
      state.srs[cardId] = {
        ...state.srs[cardId],
        suspended: false,
        suspendedReason: undefined,
      };
      changed = true;
    }
  }
  // Возобновляем или приостанавливаем карточки в зависимости от доступности навыков (capabilities)
  for (const [cardId, card] of Object.entries(state.srs || {})) {
    const identity = parseCardIdentity(cardId);
    if (identity.itemId !== entry.id) continue;
    if (!availableSkills.has(identity.skill)) {
      if (!card.suspended) {
        state.srs[cardId] = {
          ...card,
          suspended: true,
          suspendedReason: 'capability-removed',
        };
        changed = true;
      }
    } else if (card.suspended && card.suspendedReason === 'capability-removed') {
      state.srs[cardId] = {
        ...card,
        suspended: false,
        suspendedReason: undefined,
      };
      changed = true;
    }
  }
  return { added, changed };
}

export async function setUserEntriesLearningEnabled({ repository, entries, enabled, state }) {
  const nextState = { ...state, srs: { ...(state.srs || {}) } };
  const updated = entries.map((entry) => ({
    ...entry,
    learningEnabled: enabled,
    updatedAt: new Date().toISOString(),
  }));
  for (const entry of updated) {
    if (enabled) {
      syncUserEntryCards(entry, nextState);
    } else {
      for (const card of cardsForItem(nextState.srs, entry.id)) {
        nextState.srs[card.id] = { ...card, suspended: true, suspendedReason: 'learning-disabled' };
      }
    }
  }
  await (await repository.db()).atomicDictionaryCommit({ entries: updated, state: nextState });
  return { entries: updated, state: nextState };
}

export async function deleteUserEntriesWithProgress({ repository, entries, state }) {
  const nextState = {
    ...state,
    srs: { ...(state.srs || {}) },
    masteryArchive: { ...(state.masteryArchive || {}) },
  };
  let removedCards = 0;
  for (const entry of entries) removedCards += removeItemProgress(nextState, entry.id);
  await (
    await repository.db()
  ).atomicDictionaryCommit({
    entries: [],
    deleteEntryIds: entries.map((entry) => entry.id),
    state: nextState,
  });
  return { state: nextState, removedCards };
}

export async function deleteUserDictionaryWithProgress({
  repository,
  dictionaryId,
  entries,
  state,
}) {
  const nextState = {
    ...state,
    srs: { ...(state.srs || {}) },
    masteryArchive: { ...(state.masteryArchive || {}) },
  };
  let removedCards = 0;
  for (const entry of entries) removedCards += removeItemProgress(nextState, entry.id);
  await (
    await repository.db()
  ).atomicDeleteDictionary({
    dictionaryId,
    entryIds: entries.map((entry) => entry.id),
    state: nextState,
  });
  return { state: nextState, removedCards };
}

/**
 * Атомарно обновляет запись пользовательского словаря, согласовывает capabilities и
 * сохраняет результат в единой транзакции (запись + SRS-state).
 *
 * @param {{ repository, entry, state }} options
 * @returns {Promise<{ entry, state }>}
 */
export async function updateUserEntryWithSync({ repository, entry, state }) {
  const normalized = normalizeUserDictionaryEntry(
    { ...entry, updatedAt: new Date().toISOString() },
    {
      dictionaryId: entry.dictionaryId,
      sourceType: entry.source?.type || 'manual',
      now: new Date().toISOString(),
      preserveId: true,
      preserveCreatedAt: true,
    }
  );
  const nextState = {
    ...state,
    srs: { ...(state.srs || {}) },
    masteryArchive: { ...(state.masteryArchive || {}) },
  };
  if (normalized.learningEnabled) {
    syncUserEntryCards(normalized, nextState);
  } else {
    // Если обучение выключено — убеждаемся, что все карточки suspended
    for (const card of cardsForItem(nextState.srs, normalized.id)) {
      if (!card.suspended) {
        nextState.srs[card.id] = { ...card, suspended: true, suspendedReason: 'learning-disabled' };
      }
    }
  }
  await (
    await repository.db()
  ).atomicDictionaryCommit({
    entries: [normalized],
    state: nextState,
  });
  return { entry: normalized, state: nextState };
}

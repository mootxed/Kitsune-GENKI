import { SRS } from '../../srs.js';
import {
  cardsForItem,
  makeCardId,
  parseCardIdentity,
  vocabularySkillsReadyForIntroduction,
} from '../knowledge-model.js';
import { createKnowledgeItemFromUserEntry } from './knowledge-item-adapter.js';

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
  const skills = vocabularySkillsReadyForIntroduction(
    item,
    state.reviewEvents || [],
    state.masteryArchive?.[entry.id],
    now
  );
  let added = 0;
  let changed = false;
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
    } else if (state.srs[cardId].suspended) {
      state.srs[cardId] = { ...state.srs[cardId], suspended: false };
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
        nextState.srs[card.id] = { ...card, suspended: true };
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

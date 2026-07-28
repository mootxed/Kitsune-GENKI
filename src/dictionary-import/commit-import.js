import { makeCardId, SKILLS } from '../knowledge-model.js';
import { SRS } from '../../srs.js';
import { createKnowledgeItemFromUserEntry } from '../user-dictionaries/knowledge-item-adapter.js';
import { resolveEntryConflict } from '../user-dictionaries/duplicate-detector.js';

export async function commitDictionaryImport({
  repository,
  dictionary,
  preview,
  conflictStrategy = 'skip',
  conflictStrategies = {},
  learningMode = 'dictionary-only',
  selectedEntryIds = [],
  state = null,
}) {
  const conflictsByIncomingId = new Map(
    preview.conflicts.map((conflict) => [conflict.incoming.id, conflict])
  );
  const entries = [];
  for (const item of preview.accepted) {
    const conflict = conflictsByIncomingId.get(item.entry.id);
    const resolved = conflict
      ? resolveEntryConflict(
          conflict.existing,
          item.entry,
          conflictStrategies[item.entry.id] || conflictStrategy
        )
      : { action: 'insert', entry: item.entry };
    if (resolved.action === 'skip') continue;
    const shouldLearn =
      learningMode === 'all' ||
      (learningMode === 'selected' && selectedEntryIds.includes(item.entry.id));
    entries.push({
      ...resolved.entry,
      learningEnabled: shouldLearn || resolved.entry.learningEnabled,
    });
  }
  const nextState = state ? { ...state, srs: { ...(state.srs || {}) } } : undefined;
  if (nextState) {
    for (const entry of entries.filter((value) => value.learningEnabled)) {
      const item = createKnowledgeItemFromUserEntry(entry);
      for (const skill of item.capabilities.skills.filter(
        (candidate) => candidate === SKILLS.RECOGNITION
      )) {
        const cardId = makeCardId(entry.id, skill);
        if (!nextState.srs[cardId]) {
          nextState.srs[cardId] = {
            ...SRS.newCard(cardId),
            id: cardId,
            itemId: entry.id,
            skill,
            knowledgeType: 'vocabulary',
            sourceType: 'user-dictionary',
          };
        }
      }
    }
  }
  const database = await repository.db();
  await database.atomicDictionaryCommit({
    dictionary: { ...dictionary, updatedAt: new Date().toISOString() },
    entries,
    state: nextState,
  });
  return { dictionary, entries, state: nextState, imported: entries.length };
}

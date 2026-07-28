import { makeCardId, SKILLS } from '../knowledge-model.js';
import { SRS } from '../../srs.js';
import { createKnowledgeItemFromUserEntry } from '../user-dictionaries/knowledge-item-adapter.js';
import {
  mergeUserDictionaryEntries,
  resolveEntryConflict,
} from '../user-dictionaries/duplicate-detector.js';
import {
  createNamespacedId,
  getUserDictionaryEntryKey,
  normalizeUserDictionaryEntry,
} from '../user-dictionaries/normalize.js';

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
  const addedEntriesByKey = new Map(); // entryKey -> index in entries array

  for (const item of preview.accepted) {
    let sourceEntry = item.entry;
    if (preview.isStrict) {
      sourceEntry = normalizeUserDictionaryEntry(
        {
          ...item.entry,
          id: createNamespacedId('user-word'),
        },
        {
          dictionaryId: dictionary.id,
          sourceType: item.entry.source?.type || 'import',
          now: new Date().toISOString(),
          preserveUpdatedAt: false,
        }
      );
    }

    const entryStrategy = conflictStrategies[item.entry.id] || conflictStrategy;
    const entryKey = getUserDictionaryEntryKey(sourceEntry);
    const shouldLearn =
      learningMode === 'all' ||
      (learningMode === 'selected' && selectedEntryIds.includes(item.entry.id));

    // Проверяем, есть ли уже накопленная запись для этого entryKey в ТЕКУЩЕМ импорте
    const existingAccumulatedIndex = addedEntriesByKey.get(entryKey);

    if (existingAccumulatedIndex !== undefined && entryStrategy !== 'separate') {
      // Это повторное совпадение в импорте. Накапливаем относительно УЖЕ занесенного entries[existingAccumulatedIndex]
      if (entryStrategy === 'skip') {
        continue;
      }
      const previousEntry = entries[existingAccumulatedIndex];
      if (entryStrategy === 'merge') {
        const merged = mergeUserDictionaryEntries(previousEntry, sourceEntry);
        entries[existingAccumulatedIndex] = {
          ...merged,
          learningEnabled: previousEntry.learningEnabled || shouldLearn,
        };
      } else if (entryStrategy === 'replace') {
        const replaced = normalizeUserDictionaryEntry(
          {
            ...sourceEntry,
            id: previousEntry.id,
            createdAt: previousEntry.createdAt,
          },
          {
            dictionaryId: dictionary.id,
            sourceType: sourceEntry.source?.type || 'import',
          }
        );
        entries[existingAccumulatedIndex] = {
          ...replaced,
          learningEnabled: previousEntry.learningEnabled || shouldLearn,
        };
      }
      continue;
    }

    // Если нет накопленной записи в импорте, проверяем конфликт с существующей записью в БД
    const conflict = conflictsByIncomingId.get(item.entry.id);

    if (conflict) {
      const resolved = resolveEntryConflict(conflict.existing, sourceEntry, entryStrategy);
      if (resolved.action === 'skip') continue;

      // Для separate (action === 'insert') это новая отдельная запись -> берем только shouldLearn.
      // Для merge/replace (action === 'update') берем conflict.existing.learningEnabled || shouldLearn.
      const finalLearningEnabled =
        resolved.action === 'update'
          ? conflict.existing.learningEnabled || shouldLearn
          : shouldLearn;

      const entryToSave = {
        ...resolved.entry,
        learningEnabled: finalLearningEnabled,
      };

      if (entryStrategy === 'separate') {
        entries.push(entryToSave);
      } else {
        addedEntriesByKey.set(entryKey, entries.length);
        entries.push(entryToSave);
      }
    } else {
      // Новая импортируемая запись (без конфликта с БД)
      const entryToSave = {
        ...sourceEntry,
        learningEnabled: shouldLearn,
      };
      addedEntriesByKey.set(entryKey, entries.length);
      entries.push(entryToSave);
    }
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

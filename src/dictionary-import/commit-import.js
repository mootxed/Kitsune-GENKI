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

    const conflict = conflictsByIncomingId.get(item.entry.id);

    if (conflict) {
      // Конфликт с существующей записью в базе
      const resolved = resolveEntryConflict(conflict.existing, sourceEntry, entryStrategy);
      if (resolved.action === 'skip') continue;

      const finalLearningEnabled = conflict.existing.learningEnabled || shouldLearn;
      const entryToSave = {
        ...resolved.entry,
        learningEnabled: finalLearningEnabled,
      };

      const existingIndex = addedEntriesByKey.get(entryKey);
      if (existingIndex !== undefined) {
        entries[existingIndex] = entryToSave;
      } else {
        addedEntriesByKey.set(entryKey, entries.length);
        entries.push(entryToSave);
      }
    } else if (addedEntriesByKey.has(entryKey) && entryStrategy !== 'separate') {
      // Повтор внутри самого импортируемого файла
      const previousIndex = addedEntriesByKey.get(entryKey);
      const previousEntry = entries[previousIndex];

      if (entryStrategy === 'skip') {
        continue;
      }
      if (entryStrategy === 'merge') {
        const merged = mergeUserDictionaryEntries(previousEntry, sourceEntry);
        entries[previousIndex] = {
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
        entries[previousIndex] = {
          ...replaced,
          learningEnabled: previousEntry.learningEnabled || shouldLearn,
        };
      }
    } else {
      // Новая импортируемая запись (без конфликтов)
      // При новом импорте флаг learningEnabled берется ИСКЛЮЧИТЕЛЬНО из выбора пользователя (shouldLearn),
      // а НЕ переносится из файла, когда выбран выбор 'dictionary-only'.
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

import { makeCardId, SKILLS } from '../knowledge-model.js';
import { SRS } from '../../srs.js';
import { createKnowledgeItemFromUserEntry } from '../user-dictionaries/knowledge-item-adapter.js';
import { resolveEntryConflict } from '../user-dictionaries/duplicate-detector.js';
import {
  createNamespacedId,
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
  // Дубликаты внутри файла: по умолчанию skip второй и последующие вхождения
  const intraFileDuplicateIds = new Set(
    (preview.intraFileDuplicates || []).map((item) => item.duplicate.id)
  );

  const entries = [];
  for (const item of preview.accepted) {
    // Строгий KotoKitsu-формат: записи уже нормализованы в preview
    // Создаём новые ID, чтобы повторный импорт не перезаписывал произвольные записи
    let sourceEntry = item.entry;
    if (preview.isStrict) {
      // Пересчитываем производные поля, не доверяем ID из файла
      sourceEntry = normalizeUserDictionaryEntry(
        {
          ...item.entry,
          id: createNamespacedId('user-word'),
          // Не переносим FSRS-state — это dictionary-only export
        },
        {
          dictionaryId: dictionary.id,
          sourceType: item.entry.source?.type || 'import',
          now: new Date().toISOString(),
          preserveUpdatedAt: false,
        }
      );
    }

    // Пропускаем intra-file дубликаты (кроме стратегии separate)
    const entryStrategy = conflictStrategies[item.entry.id] || conflictStrategy;
    if (intraFileDuplicateIds.has(item.entry.id) && entryStrategy !== 'separate') {
      continue;
    }

    const conflict = conflictsByIncomingId.get(item.entry.id);
    const resolved = conflict
      ? resolveEntryConflict(conflict.existing, sourceEntry, entryStrategy)
      : { action: 'insert', entry: sourceEntry };
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

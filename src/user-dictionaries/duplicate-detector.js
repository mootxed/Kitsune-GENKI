import { getUserDictionaryEntryKey, normalizeUserDictionaryEntry } from './normalize.js';

function union(left, right) {
  return [...new Set([...(left || []), ...(right || [])])];
}

export function findEntryConflicts(existingEntries, incomingEntries) {
  const byKey = new Map();
  for (const entry of existingEntries || []) {
    const key = getUserDictionaryEntryKey(entry);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  }
  return (incomingEntries || []).flatMap((entry, index) => {
    const matches = byKey.get(getUserDictionaryEntryKey(entry)) || [];
    return matches.map((existing) => ({ index, existing, incoming: entry }));
  });
}

export function mergeUserDictionaryEntries(existing, incoming, options = {}) {
  return normalizeUserDictionaryEntry(
    {
      ...existing,
      reading: existing.reading || incoming.reading,
      meanings: union(existing.meanings, incoming.meanings),
      alternativeWritings: union(existing.alternativeWritings, incoming.alternativeWritings),
      partOfSpeech: union(existing.partOfSpeech, incoming.partOfSpeech),
      tags: union(existing.tags, incoming.tags),
      examples: [
        ...(existing.examples || []),
        ...(incoming.examples || []).filter(
          (example) =>
            !(existing.examples || []).some(
              (candidate) =>
                candidate.japanese === example.japanese &&
                candidate.translation === example.translation
            )
        ),
      ],
      notes:
        options.replaceNotes || !existing.notes ? incoming.notes || existing.notes : existing.notes,
      learningEnabled: existing.learningEnabled || incoming.learningEnabled,
      updatedAt: options.now || new Date().toISOString(),
    },
    {
      dictionaryId: existing.dictionaryId,
      sourceType: existing.source.type,
      now: options.now,
    }
  );
}

export function resolveEntryConflict(existing, incoming, strategy, options = {}) {
  if (strategy === 'skip') return { action: 'skip', entry: existing };
  if (strategy === 'merge') {
    return { action: 'update', entry: mergeUserDictionaryEntries(existing, incoming, options) };
  }
  if (strategy === 'replace') {
    return {
      action: 'update',
      entry: normalizeUserDictionaryEntry(
        {
          ...incoming,
          id: existing.id,
          createdAt: existing.createdAt,
          learningEnabled: existing.learningEnabled || incoming.learningEnabled,
        },
        { dictionaryId: existing.dictionaryId, now: options.now }
      ),
    };
  }
  if (strategy === 'separate') return { action: 'insert', entry: incoming };
  throw new Error(`Неизвестная стратегия конфликта: ${strategy}`);
}

/**
 * Определяет дубликаты внутри одного набора импортируемых записей.
 * Возвращает только второй и последующие экземпляры каждого entryKey.
 * @param {Array} entries — нормализованные incoming записи
 * @returns {Array} — [{first, duplicate, keyIndex}]
 */
export function findIntraFileDuplicates(entries) {
  const seen = new Map();
  const duplicates = [];
  for (let index = 0; index < (entries || []).length; index += 1) {
    const entry = entries[index];
    const key = getUserDictionaryEntryKey(entry);
    if (seen.has(key)) {
      duplicates.push({ first: seen.get(key), duplicate: entry, keyIndex: index });
    } else {
      seen.set(key, entry);
    }
  }
  return duplicates;
}

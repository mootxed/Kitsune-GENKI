import { normalizeUserDictionaryEntry } from '../user-dictionaries/normalize.js';

function valueAt(record, path) {
  if (!path) return undefined;
  if (Object.hasOwn(record, path)) return record[path];
  return path.split('.').reduce((value, key) => value?.[key], record);
}

export function applyDictionaryMapping(sourceRecord, mapping, options = {}) {
  const source = sourceRecord.value || sourceRecord;
  const mapped = Object.create(null);
  for (const [target, sourcePath] of Object.entries(mapping || {})) {
    if (!sourcePath) continue;
    const value = Array.isArray(sourcePath)
      ? sourcePath.map((path) => valueAt(source, path)).flat()
      : valueAt(source, sourcePath);
    if (target === 'examples.japanese' || target === 'examples.translation') {
      mapped.examples ||= [{}];
      mapped.examples[0][target.split('.')[1]] = value;
    } else if (target === 'externalId') {
      mapped.source = { type: 'import', label: options.sourceLabel || '', externalId: value };
    } else {
      mapped[target] = value;
    }
  }
  if (options.useObjectKeyAsWriting && sourceRecord.objectKey && !mapped.writing) {
    mapped.writing = sourceRecord.objectKey;
  }
  return normalizeUserDictionaryEntry(mapped, {
    dictionaryId: options.dictionaryId,
    sourceType: 'import',
    sourceLabel: options.sourceLabel,
    meaningSeparator: options.meaningSeparator,
    tagSeparator: options.tagSeparator,
    stripHtml: options.stripHtml !== false,
    now: options.now,
  });
}

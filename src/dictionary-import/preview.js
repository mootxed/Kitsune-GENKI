import { applyDictionaryMapping } from './apply-mapping.js';
import {
  findEntryConflicts,
  findIntraFileDuplicates,
} from '../user-dictionaries/duplicate-detector.js';
import { normalizeUserDictionaryEntry } from '../user-dictionaries/normalize.js';

function readableImportError(error) {
  if (Array.isArray(error?.issues) && error.issues.length) {
    const issue = error.issues.find((candidate) => candidate.code === 'custom') || error.issues[0];
    const path = issue.path?.length ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  }
  return error?.message || 'Неизвестная ошибка';
}

export function createImportPreview({
  records,
  mapping,
  options,
  existingEntries = [],
  previewLimit = 20,
  // При строгом KotoKitsu-формате не применяем ручной field mapping
  isStrict = false,
}) {
  const accepted = [];
  const rejected = [];
  const warnings = [];
  for (const record of records) {
    try {
      let entry;
      if (isStrict) {
        // Строгий путь: нормализуем запись напрямую без ручного mapping
        entry = normalizeUserDictionaryEntry(record.value, {
          dictionaryId: options?.dictionaryId,
          sourceType: record.value?.source?.type || 'import',
          now: options?.now,
          preserveUpdatedAt: true,
        });
      } else {
        entry = applyDictionaryMapping(record, mapping, options);
      }
      accepted.push({ entry, sourceIndex: record.sourceIndex });
      if (!entry.reading) {
        warnings.push({ sourceIndex: record.sourceIndex, message: 'Отсутствует чтение' });
      }
    } catch (error) {
      rejected.push({ sourceIndex: record.sourceIndex, message: readableImportError(error) });
    }
  }
  const conflicts = findEntryConflicts(
    existingEntries,
    accepted.map((item) => item.entry)
  );
  // Детекция дубликатов внутри самого импортируемого файла
  const intraFileDuplicates = findIntraFileDuplicates(accepted.map((item) => item.entry));
  return {
    total: records.length,
    ready: accepted.length,
    warningCount: warnings.length,
    rejectedCount: rejected.length,
    duplicateCount: conflicts.length,
    intraFileDuplicateCount: intraFileDuplicates.length,
    accepted,
    rejected,
    warnings,
    conflicts,
    intraFileDuplicates,
    isStrict,
    rows: [...accepted, ...rejected].slice(0, previewLimit),
  };
}

export function createImportErrorReport(preview) {
  return (preview.rejected || [])
    .map((error) => `Строка/элемент ${error.sourceIndex}: ${error.message}`)
    .join('\n');
}

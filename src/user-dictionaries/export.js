import { USER_DICTIONARY_SCHEMA_VERSION, UserDictionaryExportSchema } from './schema.js';

export function createUserDictionaryExport(dictionary, entries, now = new Date().toISOString()) {
  return UserDictionaryExportSchema.parse({
    format: 'kotokitsu-dictionary',
    schemaVersion: USER_DICTIONARY_SCHEMA_VERSION,
    exportedAt: now,
    dictionary,
    entries,
  });
}

export function protectCsvFormula(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/u.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const protectedValue = protectCsvFormula(value);
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function exportUserDictionaryCsv(entries) {
  const rows = [['writing', 'reading', 'meanings', 'tags', 'notes', 'learningEnabled']];
  for (const entry of entries) {
    rows.push([
      entry.writing,
      entry.reading,
      entry.meanings.join('; '),
      entry.tags.join(', '),
      entry.notes,
      String(entry.learningEnabled),
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

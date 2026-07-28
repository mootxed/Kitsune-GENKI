import { USER_DICTIONARY_LIMITS } from '../user-dictionaries/schema.js';

export function parseDelimited(text, options = {}) {
  const delimiter = options.delimiter ?? ',';
  if (!['\t', ',', ';'].includes(delimiter)) throw new Error('Недопустимый разделитель');
  const source = String(text ?? '').replace(/^\uFEFF/u, '');
  if (new Blob([source]).size > USER_DICTIONARY_LIMITS.fileBytes) {
    throw new Error('Файл превышает лимит 10 МБ');
  }
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let lineNumber = 1;
  let rowStartLine = 1;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
        if (character === '\n') lineNumber += 1;
      }
    } else if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) {
        rows.push({ values: row, sourceIndex: rowStartLine });
      }
      row = [];
      cell = '';
      lineNumber += 1;
      rowStartLine = lineNumber;
      if (rows.length > USER_DICTIONARY_LIMITS.entries + 1) {
        throw new Error(`В файле больше ${USER_DICTIONARY_LIMITS.entries} записей`);
      }
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('Незакрытое quoted-поле');
  row.push(cell);
  if (row.some((value) => value !== '')) {
    rows.push({ values: row, sourceIndex: rowStartLine });
  }
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].values.map((value, index) => value.trim() || `column_${index + 1}`);
  const records = rows.slice(1).map(({ values, sourceIndex }) => {
    const record = Object.create(null);
    headers.forEach((header, columnIndex) => {
      record[header] = values[columnIndex] ?? '';
    });
    return { value: record, sourceIndex };
  });
  return { headers, records };
}

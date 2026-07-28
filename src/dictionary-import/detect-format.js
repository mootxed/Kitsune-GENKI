import { USER_DICTIONARY_LIMITS } from '../user-dictionaries/schema.js';

export function detectDictionaryFormat({ name = '', type = '', text = '', size = 0 }) {
  if (size > USER_DICTIONARY_LIMITS.fileBytes) {
    throw new Error('Файл превышает лимит 10 МБ');
  }
  const extension = name.toLocaleLowerCase().split('.').pop();
  if (extension === 'json' || type.includes('json') || /^[\s\uFEFF]*[[{]/u.test(text))
    return 'json';
  if (extension === 'tsv' || text.includes('\t')) return 'tsv';
  if (extension === 'csv' || type.includes('csv')) return 'csv';
  throw new Error('Поддерживаются только JSON, CSV и TSV');
}

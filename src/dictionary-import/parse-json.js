import { USER_DICTIONARY_LIMITS } from '../user-dictionaries/schema.js';
import { assertSafeValue } from '../user-dictionaries/normalize.js';

function getAtPath(root, path) {
  if (!path) return root;
  return path.split('.').reduce((value, key) => value?.[key], root);
}

function visitCollections(value, path, output, depth = 0) {
  if (depth > USER_DICTIONARY_LIMITS.jsonDepth || !value || typeof value !== 'object') return;
  if (Array.isArray(value) && value.every((item) => item && typeof item === 'object')) {
    output.push({ path, count: value.length, kind: 'array' });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visitCollections(child, path ? `${path}.${key}` : key, output, depth + 1);
  }
}

export function discoverJsonCollections(root) {
  const collections = [];
  visitCollections(root, '', collections);
  const preferred = ['entries', 'words', 'items', 'data', 'dictionary.entries'];
  return collections.sort((a, b) => {
    const aRank = preferred.indexOf(a.path);
    const bRank = preferred.indexOf(b.path);
    if (aRank >= 0 || bRank >= 0) {
      return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
    }
    return b.count - a.count;
  });
}

export function parseDictionaryJson(text, options = {}) {
  const source = String(text ?? '').replace(/^\uFEFF/u, '');
  if (new Blob([source]).size > USER_DICTIONARY_LIMITS.fileBytes) {
    throw new Error('Файл превышает лимит 10 МБ');
  }
  let root;
  try {
    root = JSON.parse(source);
  } catch (error) {
    throw new Error(`Некорректный JSON: ${error.message}`);
  }
  assertSafeValue(root, { maxDepth: USER_DICTIONARY_LIMITS.jsonDepth });
  if (
    root?.format === 'kotokitsu-dictionary' &&
    root?.schemaVersion === 1 &&
    Array.isArray(root.entries)
  ) {
    if (root.entries.length > USER_DICTIONARY_LIMITS.entries) {
      throw new Error(`В файле больше ${USER_DICTIONARY_LIMITS.entries} записей`);
    }
    const ids = root.entries.map((entry) => entry?.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      throw new Error('Строгий JSON содержит повторяющиеся ID');
    }
    return {
      root,
      path: 'entries',
      collections: [{ path: 'entries', count: root.entries.length, kind: 'array' }],
      records: root.entries.map((value, index) => ({ value, sourceIndex: index + 1 })),
      strict: true,
    };
  }
  const collections = discoverJsonCollections(root);
  const selectedPath = options.collectionPath ?? collections[0]?.path ?? '';
  const selected = getAtPath(root, selectedPath);
  let records;
  if (Array.isArray(selected)) {
    records = selected.map((value, index) => ({ value, sourceIndex: index + 1 }));
  } else if (selected && typeof selected === 'object') {
    records = Object.entries(selected).map(([objectKey, value], index) => ({
      value:
        value && typeof value === 'object'
          ? Object.assign(Object.create(null), value)
          : Object.assign(Object.create(null), { meaning: value }),
      objectKey,
      sourceIndex: index + 1,
    }));
  } else {
    throw new Error('Не найдена коллекция записей JSON');
  }
  if (records.length > USER_DICTIONARY_LIMITS.entries) {
    throw new Error(`В файле больше ${USER_DICTIONARY_LIMITS.entries} записей`);
  }
  return { root, path: selectedPath, collections, records, strict: false };
}

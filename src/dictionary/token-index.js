import { canonicalHiragana, normalizeDictionaryText } from './dictionary-id.js';

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'ja'));
}

export function buildTokenIndex(entries) {
  const index = new Map();
  for (const entry of entries || []) {
    if (!entry?.id) continue;
    for (const rawForm of entry.tokenForms || []) {
      const form = normalizeDictionaryText(rawForm);
      if (!form) continue;
      if (!index.has(form)) index.set(form, []);
      index.get(form).push(entry.id);
    }
  }
  return Object.fromEntries(
    [...index.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'ja'))
      .map(([token, ids]) => [token, sortedUnique(ids)])
  );
}

export function findTokenCandidates(tokenIndex, token, options = {}) {
  const normalizedToken = normalizeDictionaryText(token);
  const source = tokenIndex?.tokens || tokenIndex || {};
  const candidates = sortedUnique(source[normalizedToken] || []);
  const preferredIds = new Set(options.preferredDictionaryIds || []);
  candidates.sort(
    (left, right) =>
      Number(preferredIds.has(right)) - Number(preferredIds.has(left)) ||
      left.localeCompare(right, 'ja')
  );
  return {
    normalizedToken,
    candidates,
    exact: candidates.length > 0,
    ambiguous: candidates.length > 1,
  };
}

export function findReadingCandidates(entries, reading) {
  const normalizedReading = canonicalHiragana(reading);
  const candidates = (entries || [])
    .filter((entry) => canonicalHiragana(entry?.reading) === normalizedReading)
    .map((entry) => entry.id);
  return {
    normalizedReading,
    candidates: sortedUnique(candidates),
    exact: candidates.length > 0,
    ambiguous: new Set(candidates).size > 1,
  };
}

export function resolveTokenCandidates(tokenIndex, token, options = {}) {
  const result = findTokenCandidates(tokenIndex, token, options);
  if (result.candidates.length === 0) {
    return { status: 'missing', dictionaryId: null, ...result };
  }
  if (result.candidates.length === 1) {
    return {
      status: 'resolved',
      dictionaryId: result.candidates[0],
      ...result,
    };
  }

  const hintedId = options.aiHint?.dictionaryId;
  if (hintedId && result.candidates.includes(hintedId)) {
    return { status: 'resolved', dictionaryId: hintedId, ...result };
  }
  return { status: 'ambiguous', dictionaryId: null, ...result };
}

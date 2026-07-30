const SERVICE_MARKS_RE = /[~～〜]/gu;
const WHITESPACE_RE = /[\s\u3000]+/gu;
const KATAKANA_RE = /[\u30a1-\u30f6]/gu;
const DISAMBIGUATOR_RE = /[^\p{Letter}\p{Number}._-]+/gu;

export function normalizeDictionaryText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(SERVICE_MARKS_RE, '')
    .replace(WHITESPACE_RE, '')
    .trim();
}

export function canonicalHiragana(value) {
  return normalizeDictionaryText(value).replace(KATAKANA_RE, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60)
  );
}

export function normalizeDictionaryDisambiguator(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(DISAMBIGUATOR_RE, '-')
    .replace(/^-+|-+$/gu, '');
}

export function dictionaryEntryId(input, options = {}) {
  const dictionaryForm = normalizeDictionaryText(
    input?.dictionaryForm ||
      input?.writtenForm ||
      input?.kanji ||
      input?.writing ||
      input?.reading ||
      input
  );
  const reading = canonicalHiragana(
    input?.reading || input?.writing || input?.dictionaryForm || dictionaryForm
  );
  if (!dictionaryForm) throw new Error('[Dictionary] dictionaryForm is required');
  if (!reading) throw new Error('[Dictionary] reading is required');

  const disambiguator = normalizeDictionaryDisambiguator(
    options.disambiguator || input?.disambiguator || input?.senseId
  );
  const base = `jp-word:${dictionaryForm}:${reading}`;
  return disambiguator ? `${base}:${disambiguator}` : base;
}

export function userDictionaryEntryId(input, options = {}) {
  const canonical = dictionaryEntryId(input, options);
  return canonical.replace(/^jp-word:/u, 'user-word:');
}

export function parseDictionaryId(value) {
  const raw = String(value || '');
  const prefix = raw.startsWith('jp-word:')
    ? 'jp-word'
    : raw.startsWith('user-word:')
      ? 'user-word'
      : null;
  if (!prefix) return null;
  const parts = raw.slice(prefix.length + 1).split(':');
  if (parts.length < 2) return null;
  return {
    prefix,
    dictionaryForm: parts[0],
    reading: parts[1],
    disambiguator: parts.slice(2).join(':') || null,
  };
}

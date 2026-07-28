export const FIELD_ALIASES = Object.freeze({
  writing: ['writing', 'word', 'japanese', 'kanji', 'expression', 'term', 'front'],
  reading: ['reading', 'kana', 'hiragana', 'pronunciation', 'yomikata'],
  meanings: [
    'meaning',
    'meanings',
    'translation',
    'translations',
    'definition',
    'definitions',
    'back',
    'ru',
  ],
  tags: ['tag', 'tags', 'category', 'categories', 'labels'],
  alternativeWritings: ['alternativewritings', 'alternatives', 'variants'],
  partOfSpeech: ['partofspeech', 'pos'],
  notes: ['notes', 'note', 'comment'],
  externalId: ['externalid', 'id', 'guid'],
  'examples.japanese': ['example', 'examplejapanese', 'sentence'],
  'examples.translation': ['exampletranslation', 'sentencetranslation'],
});

function comparable(value) {
  return String(value)
    .toLocaleLowerCase()
    .replace(/[\s_.-]/gu, '');
}

export function inferDictionaryMapping(fields) {
  const mapping = {};
  for (const [target, aliases] of Object.entries(FIELD_ALIASES)) {
    const match = fields.find((field) => aliases.includes(comparable(field)));
    if (match) mapping[target] = match;
  }
  return mapping;
}

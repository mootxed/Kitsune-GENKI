import { WORD_SOURCES } from './intents.js';

const MAX_WORDS = 20;

export function normalizeJapaneseWriting(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .toLocaleLowerCase('ja');
}

function wordShape(raw, source = 'catalog') {
  if (!raw) return null;
  const writing = String(raw.writing || raw.kanji || raw.word || raw.japanese || '').trim();
  const reading = String(raw.reading || raw.kana || raw.writing || '').trim();
  const meanings = Array.isArray(raw.meanings)
    ? raw.meanings.filter(Boolean).map(String)
    : [raw.meaning || raw.translation || raw.ru].filter(Boolean).map(String);
  if (!writing && !reading) return null;
  return {
    writing,
    reading,
    meanings: meanings.slice(0, 5),
    partOfSpeech: Array.isArray(raw.partOfSpeech)
      ? raw.partOfSpeech.slice(0, 4)
      : [raw.type || raw.partOfSpeech].filter(Boolean),
    source,
    localId: raw.id || raw.itemId || null,
  };
}

function flattenLessons(lessons = []) {
  return lessons.flatMap((lesson) => {
    const words = lesson?.vocab || lesson?.vocabulary || lesson?.words || lesson?.items || [];
    return Array.isArray(words)
      ? words.map((word) => ({ ...word, chapterId: word.chapterId || lesson.id }))
      : [];
  });
}

function isUnlocked(word, state) {
  const chapter = state?.chapters?.[word.chapterId];
  if (chapter?.started) return true;
  const id = word.id || word.itemId;
  return Object.entries(state?.srs || {}).some(
    ([cardId, record]) =>
      cardId === id ||
      cardId.startsWith(`${id}::`) ||
      record?.itemId === id ||
      record?.status === 'learning' ||
      record?.status === 'review'
  );
}

function fsrsBucket(state, catalog, bucket) {
  const byId = new Map(catalog.map((word) => [word.id || word.itemId, word]));
  const values = [];
  for (const [cardId, record] of Object.entries(state?.srs || {})) {
    const itemId = record?.itemId || cardId.split('::')[0];
    const word = byId.get(itemId);
    if (!word) continue;
    const difficult =
      record?.difficulty >= 7 ||
      record?.lapses > 0 ||
      record?.state === 'learning' ||
      record?.status === 'learning';
    const learned =
      record?.state === 'review' ||
      record?.status === 'review' ||
      Number(record?.stability) > 0 ||
      Number(record?.reps) > 0;
    const stable = learned && Number(record?.stability) >= 10 && !difficult;
    if (
      (bucket === 'difficult' && difficult) ||
      (bucket === 'recent' && learned && !stable) ||
      (bucket === 'stable' && stable)
    ) {
      values.push(word);
    }
  }
  return values;
}

function uniqueWords(words, limit = MAX_WORDS) {
  const seen = new Set();
  const result = [];
  for (const raw of words) {
    const word = raw?.writing !== undefined && raw?.meanings ? raw : wordShape(raw, raw?.source);
    if (!word) continue;
    const key = normalizeJapaneseWriting(word.writing || word.reading);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(word);
    if (result.length >= limit) break;
  }
  return result;
}

function takeRatio(items, count) {
  return items.slice(0, Math.max(0, count));
}

export function selectWords({
  source = 'mixed',
  state = {},
  lessons = [],
  userEntries = [],
  explicitWords = [],
  currentLessonId = state.activeChapterId,
  limit = 12,
} = {}) {
  if (!WORD_SOURCES.includes(source)) source = 'mixed';
  const safeLimit = Math.min(MAX_WORDS, Math.max(1, Number(limit) || 12));
  const catalog = flattenLessons(lessons);
  const unlocked = catalog.filter((word) => isUnlocked(word, state));
  const difficult = fsrsBucket(state, catalog, 'difficult');
  const recent = fsrsBucket(state, catalog, 'recent');
  const stable = fsrsBucket(state, catalog, 'stable');
  const current = unlocked.filter((word) => String(word.chapterId) === String(currentLessonId));
  const explicit = explicitWords.map((word) =>
    wordShape(typeof word === 'string' ? { writing: word, reading: word } : word, 'explicit_words')
  );
  const dictionaries = userEntries.map((entry) => wordShape(entry, 'user_dictionary'));

  let selected;
  if (source === 'explicit_words') selected = explicit;
  else if (source === 'user_dictionary') selected = dictionaries;
  else if (source === 'fsrs_difficult') selected = difficult;
  else if (source === 'fsrs_learned') selected = [...recent, ...stable];
  else if (source === 'current_lesson') selected = current;
  else {
    const recentCount = Math.ceil(safeLimit * 0.6);
    const difficultCount = Math.ceil(safeLimit * 0.25);
    const stableCount = Math.max(0, safeLimit - recentCount - difficultCount);
    selected = [
      ...explicit,
      ...takeRatio(recent, recentCount),
      ...takeRatio(difficult, difficultCount),
      ...takeRatio(stable, stableCount),
      ...current,
      ...dictionaries,
      ...unlocked,
    ];
  }
  return uniqueWords(
    selected.map((word) =>
      wordShape(word, word?.source || (source === 'mixed' ? 'mixed' : source))
    ),
    safeLimit
  );
}

export function tokenizeWordsForPrompt(words) {
  const idMap = new Map();
  const promptWords = words.map((word, index) => {
    const token = `W${index + 1}`;
    if (word.localId) idMap.set(token, word.localId);
    return {
      token,
      writing: word.writing,
      reading: word.reading,
      meanings: word.meanings,
      partOfSpeech: word.partOfSpeech,
    };
  });
  return { promptWords, idMap };
}

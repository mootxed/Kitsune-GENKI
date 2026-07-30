/* GENKI I kanji availability and safe display projection. */

const unlockLessonByKanji = new Map();

function canonicalWrittenForm(word) {
  return String(word?.writtenForm || word?.kanji || word?.reading || word?.writing || '');
}

function canonicalReading(word) {
  return String(word?.reading || word?.writing || word?.writtenForm || word?.kanji || '');
}

function isGenkiVocabularyWord(word) {
  return !word?.id || /^L\d+_V\d+$/u.test(String(word.id));
}

export function configureGenkiKanjiAvailability(document) {
  const characters = Array.isArray(document?.characters) ? document.characters : [];
  const next = new Map();
  for (const entry of characters) {
    const kanji = String(entry?.kanji || '');
    const unlockLesson = Number(entry?.unlockLesson);
    if (
      [...kanji].length !== 1 ||
      !/\p{Script=Han}/u.test(kanji) ||
      !Number.isInteger(unlockLesson) ||
      unlockLesson < 3 ||
      unlockLesson > 12 ||
      next.has(kanji)
    ) {
      throw new Error(`[GenkiKanji] Некорректная запись доступности: ${JSON.stringify(entry)}`);
    }
    next.set(kanji, unlockLesson);
  }
  if (next.size === 0) throw new Error('[GenkiKanji] Таблица доступности пуста');
  unlockLessonByKanji.clear();
  for (const [kanji, lesson] of next) unlockLessonByKanji.set(kanji, lesson);
  return unlockLessonByKanji.size;
}

export function clearGenkiKanjiAvailability() {
  unlockLessonByKanji.clear();
}

export function getKanjiCharacters(value) {
  return [...String(value || '')].filter(
    (character) => character !== '々' && /\p{Script=Han}/u.test(character)
  );
}

export function getKanjiUnlockLesson(kanji) {
  return unlockLessonByKanji.get(String(kanji)) ?? null;
}

export function getWordKanjiUnlockLesson(word) {
  const characters = getKanjiCharacters(canonicalWrittenForm(word));
  if (characters.length === 0) return null;
  const lessons = characters.map((character) => getKanjiUnlockLesson(character));
  if (lessons.some((lesson) => lesson == null)) return null;
  return Math.max(...lessons);
}

export function getUnlockedKanjiLesson(stateOrLesson) {
  if (Number.isFinite(Number(stateOrLesson))) return Number(stateOrLesson);
  const state = stateOrLesson || {};
  const candidates = [Number(state.activeChapterId) || 1];
  for (const chapterId of state.priorKnowledgeChapterIds || []) {
    if (Number.isInteger(Number(chapterId))) candidates.push(Number(chapterId));
  }
  for (const [chapterId, chapter] of Object.entries(state.chapters || {})) {
    if (chapter?.started || chapter?.completedAt) candidates.push(Number(chapterId));
  }
  return Math.max(1, ...candidates.filter(Number.isFinite));
}

export function isKanjiFormAvailable(word, stateOrLesson) {
  if (!isGenkiVocabularyWord(word)) return true;
  const characters = getKanjiCharacters(canonicalWrittenForm(word));
  if (characters.length === 0) return true;
  const unlockedLesson = getUnlockedKanjiLesson(stateOrLesson);
  return characters.every((character) => {
    const requiredLesson = getKanjiUnlockLesson(character);
    return requiredLesson != null && requiredLesson <= unlockedLesson;
  });
}

export function displayWordForm(word, stateOrLesson) {
  return isKanjiFormAvailable(word, stateOrLesson)
    ? canonicalWrittenForm(word)
    : canonicalReading(word);
}

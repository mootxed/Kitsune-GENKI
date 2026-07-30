import {
  canonicalLessonId,
  compareLessonIds,
  getActiveCourse,
  lessonOrdinal,
} from './courses/course-context.js';

const unlockLessonByCharacter = new Map();
let configuredCourseId = null;

function canonicalWrittenForm(word) {
  return String(word?.writtenForm || word?.kanji || word?.reading || word?.writing || '');
}

function canonicalReading(word) {
  return String(word?.reading || word?.writing || word?.writtenForm || word?.kanji || '');
}

function isCourseVocabularyWord(word, course) {
  if (!course) return false;
  if (word?.courseId) return word.courseId === course.id;
  return String(word?.id || '').startsWith(`${course.id}:vocabulary:`);
}

export function configureCourseOrthography(document, course = getActiveCourse()) {
  if (!course) throw new Error('[CourseOrthography] Active course is required');
  const characters = Array.isArray(document?.characters) ? document.characters : [];
  const next = new Map();
  for (const entry of characters) {
    const character = String(entry?.character || entry?.kanji || '');
    const rawLessonId = entry?.introducedIn ?? entry?.lessonId ?? entry?.unlockLesson;
    const requiredLessonId = course.canonicalLessonId(rawLessonId);
    if (
      [...character].length !== 1 ||
      !/\p{Script=Han}/u.test(character) ||
      !requiredLessonId ||
      next.has(character)
    ) {
      throw new Error(
        `[CourseOrthography] Invalid ${course.id} relation: ${JSON.stringify(entry)}`
      );
    }
    next.set(character, requiredLessonId);
  }
  if (next.size === 0) throw new Error('[CourseOrthography] Relation table is empty');
  unlockLessonByCharacter.clear();
  for (const [character, lessonId] of next) unlockLessonByCharacter.set(character, lessonId);
  configuredCourseId = course.id;
  return unlockLessonByCharacter.size;
}

export function clearCourseOrthography() {
  unlockLessonByCharacter.clear();
  configuredCourseId = null;
}

export function getKanjiCharacters(value) {
  return [...String(value || '')].filter(
    (character) => character !== '々' && /\p{Script=Han}/u.test(character)
  );
}

export function getCharacterUnlockLesson(character) {
  return unlockLessonByCharacter.get(String(character)) ?? null;
}

export function getWordOrthographyUnlockLesson(word) {
  const characters = getKanjiCharacters(canonicalWrittenForm(word));
  if (characters.length === 0) return null;
  const lessonIds = characters.map(getCharacterUnlockLesson);
  if (lessonIds.some((lessonId) => lessonId == null)) return null;
  return lessonIds.sort(compareLessonIds).at(-1) || null;
}

export function getUnlockedOrthographyLesson(stateOrLesson, course = getActiveCourse()) {
  if (!course) return stateOrLesson ?? null;
  const direct = course.canonicalLessonId(stateOrLesson);
  if (direct) return direct;

  const state = stateOrLesson || {};
  const candidates = [];
  const active = canonicalLessonId(state.activeChapterId, course);
  if (active) candidates.push(active);
  for (const lessonId of state.priorKnowledgeChapterIds || []) {
    const canonical = canonicalLessonId(lessonId, course);
    if (canonical) candidates.push(canonical);
  }
  for (const [lessonId, progress] of Object.entries(state.chapters || {})) {
    if (!progress?.started && !progress?.completedAt) continue;
    const canonical = canonicalLessonId(lessonId, course);
    if (canonical) candidates.push(canonical);
  }
  return candidates.sort((left, right) => compareLessonIds(left, right, course)).at(-1) || null;
}

export function isOrthographyFormAvailable(word, stateOrLesson, course = getActiveCourse()) {
  if (!isCourseVocabularyWord(word, course)) return true;
  if (configuredCourseId !== course.id) return false;
  const characters = getKanjiCharacters(canonicalWrittenForm(word));
  if (characters.length === 0) return true;
  const unlockedLesson = getUnlockedOrthographyLesson(stateOrLesson, course);
  if (lessonOrdinal(unlockedLesson, course) < 0) return false;
  return characters.every((character) => {
    const requiredLesson = getCharacterUnlockLesson(character);
    return requiredLesson != null && compareLessonIds(requiredLesson, unlockedLesson, course) <= 0;
  });
}

export function displayWordForm(word, stateOrLesson, course = getActiveCourse()) {
  return isOrthographyFormAvailable(word, stateOrLesson, course)
    ? canonicalWrittenForm(word)
    : canonicalReading(word);
}

// Compatibility names for call sites while the GENKI-specific module is retired.
export const getKanjiUnlockLesson = getCharacterUnlockLesson;
export const getWordKanjiUnlockLesson = getWordOrthographyUnlockLesson;
export const getUnlockedKanjiLesson = getUnlockedOrthographyLesson;
export const isKanjiFormAvailable = isOrthographyFormAvailable;

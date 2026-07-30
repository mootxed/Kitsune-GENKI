/* Deprecated GENKI I compatibility adapter. Runtime code uses course-orthography.js. */
import {
  clearCourseOrthography,
  configureCourseOrthography,
  displayWordForm as displayCourseWordForm,
  getKanjiCharacters,
  getKanjiUnlockLesson,
  getUnlockedKanjiLesson as getUnlockedCourseKanjiLesson,
  getWordKanjiUnlockLesson as getCourseWordKanjiUnlockLesson,
  isKanjiFormAvailable as isCourseKanjiFormAvailable,
} from './course-orthography.js';

const LEGACY_GENKI_COURSE = Object.freeze({
  id: 'genki-1',
  canonicalLessonId(value) {
    const match = /^(?:genki-1:lesson-)?(\d+)$/u.exec(String(value || ''));
    const lesson = Number(match?.[1]);
    return Number.isInteger(lesson) && lesson >= 1 && lesson <= 12 ? lesson : null;
  },
  lessonOrdinal(value) {
    const lesson = this.canonicalLessonId(value);
    return lesson == null ? -1 : lesson - 1;
  },
});

function legacyWord(word) {
  return /^L\d+_/u.test(String(word?.id || ''))
    ? { ...word, courseId: LEGACY_GENKI_COURSE.id }
    : word;
}

export function configureGenkiKanjiAvailability(document) {
  return configureCourseOrthography(document, LEGACY_GENKI_COURSE);
}

export const clearGenkiKanjiAvailability = clearCourseOrthography;
export { getKanjiCharacters, getKanjiUnlockLesson };

export function getWordKanjiUnlockLesson(word) {
  return getCourseWordKanjiUnlockLesson(legacyWord(word));
}

export function getUnlockedKanjiLesson(stateOrLesson) {
  return getUnlockedCourseKanjiLesson(stateOrLesson, LEGACY_GENKI_COURSE);
}

export function isKanjiFormAvailable(word, stateOrLesson) {
  return isCourseKanjiFormAvailable(legacyWord(word), stateOrLesson, LEGACY_GENKI_COURSE);
}

export function displayWordForm(word, stateOrLesson) {
  return displayCourseWordForm(legacyWord(word), stateOrLesson, LEGACY_GENKI_COURSE);
}

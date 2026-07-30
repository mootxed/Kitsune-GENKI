import { DEFAULT_COURSE_ID, loadCourse } from './course-registry.js';
import { resolveGeneratedDictionaryAlias } from '../dictionary/generated-dictionary-aliases.js';

let activeCourse = null;
const activeCoursePromises = new Map();
let latestRequestedCourseId = null;

export function setActiveCourse(course) {
  if (!course?.id || typeof course.canonicalLessonId !== 'function') {
    throw new Error('[CourseContext] A loaded Course runtime is required');
  }
  activeCourse = course;
  activeCoursePromises.set(course.id, Promise.resolve(course));
  latestRequestedCourseId = course.id;
  return course;
}

export async function ensureActiveCourse(targetCourseId = null, options = {}) {
  const courseId = String(targetCourseId || activeCourse?.id || DEFAULT_COURSE_ID);
  latestRequestedCourseId = courseId;

  if (activeCourse?.id === courseId && options.reload !== true) {
    return activeCourse;
  }

  if (!activeCoursePromises.has(courseId) || options.reload === true) {
    const promise = loadCourse(courseId, options)
      .then((course) => {
        if (latestRequestedCourseId === course.id) {
          activeCourse = course;
        }
        return course;
      })
      .catch((error) => {
        activeCoursePromises.delete(courseId);
        throw error;
      });
    activeCoursePromises.set(courseId, promise);
  }

  const loaded = await activeCoursePromises.get(courseId);
  if (latestRequestedCourseId === loaded.id) {
    activeCourse = loaded;
  }
  return loaded;
}

export function getActiveCourse() {
  return activeCourse;
}

export function clearActiveCourse() {
  activeCourse = null;
  activeCoursePromises.clear();
  latestRequestedCourseId = null;
}

export function canonicalLessonId(value, course = activeCourse) {
  if (value == null || value === '') return null;
  const raw = String(value);
  return typeof course?.canonicalLessonId === 'function'
    ? course.canonicalLessonId(raw) || raw
    : raw;
}

export function sameLessonId(left, right, course = activeCourse) {
  return canonicalLessonId(left, course) === canonicalLessonId(right, course);
}

export function lessonOrdinal(value, course = activeCourse) {
  const ordinal = typeof course?.lessonOrdinal === 'function' ? course.lessonOrdinal(value) : null;
  if (Number.isInteger(ordinal) && ordinal >= 0) return ordinal;
  const legacy = Number(value);
  return Number.isFinite(legacy) ? legacy - 1 : -1;
}

export function compareLessonIds(left, right, course = activeCourse) {
  const leftOrder = lessonOrdinal(left, course);
  const rightOrder = lessonOrdinal(right, course);
  if (leftOrder >= 0 && rightOrder >= 0) return leftOrder - rightOrder;
  return String(left).localeCompare(String(right));
}

export function canonicalizeKnowledgeItemId(value, course = activeCourse) {
  if (value == null || value === '') return '';
  const raw = String(value);
  const generated = resolveGeneratedDictionaryAlias(raw);
  if (generated !== raw) return generated;
  const courseCanonical =
    typeof course?.canonicalizeKnowledgeId === 'function'
      ? course.canonicalizeKnowledgeId(raw) || raw
      : raw;
  return resolveGeneratedDictionaryAlias(courseCanonical);
}

export function canonicalizeCardId(value, course = activeCourse) {
  const raw = String(value || '');
  const separatorIndex = raw.lastIndexOf('::');
  const suffix = separatorIndex >= 0 ? raw.slice(separatorIndex) : '';
  const itemId = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
  const canonicalItemId = canonicalizeKnowledgeItemId(itemId, course);
  return `${canonicalItemId}${suffix}`;
}

export function lessonIdForKnowledgeItem(value, course = activeCourse) {
  return typeof course?.lessonIdForKnowledge === 'function'
    ? course.lessonIdForKnowledge(value) || null
    : null;
}

export function courseIdFromContentId(value) {
  const match =
    /^([a-z0-9]+(?:-[a-z0-9]+)*):(lesson|vocabulary|grammar|exercise|story|quiz):/u.exec(
      String(value || '')
    );
  return match?.[1] || null;
}

export function formatLessonLabel(value, course = activeCourse) {
  const summary =
    typeof course?.getLessonSummary === 'function' ? course.getLessonSummary(value) : null;
  if (summary?.title) return summary.title;
  const order = lessonOrdinal(value, course);
  return order >= 0 ? `Урок ${order + 1}` : `Урок ${value}`;
}

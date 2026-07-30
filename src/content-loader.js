/* Compatibility facade: all course data access goes through CourseLoader. */
import {
  clearActiveCourse,
  ensureActiveCourse,
  getActiveCourse,
} from './courses/course-context.js';
import { clearCourseRegistryCache, DEFAULT_COURSE_ID } from './courses/course-registry.js';

// Лёгкий индекс: список глав и метаданные историй без полного контента
export async function loadContentIndex() {
  const course = await ensureActiveCourse(DEFAULT_COURSE_ID);
  return course.contentIndex;
}

export async function loadCourseOrthography() {
  const course = await ensureActiveCourse(DEFAULT_COURSE_ID);
  return course.resources.orthography;
}

export const loadGenkiKanjiAvailability = loadCourseOrthography;

export async function loadChapterData(chapterId) {
  const course = await ensureActiveCourse(DEFAULT_COURSE_ID);
  return course.loadLesson(chapterId);
}

export function clearContentCache() {
  getActiveCourse()?.clearCache();
  clearActiveCourse();
  clearCourseRegistryCache();
}

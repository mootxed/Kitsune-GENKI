/* Compatibility facade: all course data access goes through CourseLoader. */
import {
  clearActiveCourse,
  ensureActiveCourse,
  getActiveCourse,
} from './courses/course-context.js';
import { clearCourseRegistryCache, DEFAULT_COURSE_ID } from './courses/course-registry.js';

// Лёгкий индекс: список глав и метаданные историй без полного контента
export async function loadContentIndex(courseId = null) {
  const course = await ensureActiveCourse(courseId);
  return course.contentIndex;
}

export async function loadCourseOrthography(courseId = null) {
  const course = await ensureActiveCourse(courseId);
  return course.resources.orthography;
}

export const loadGenkiKanjiAvailability = loadCourseOrthography;

export async function loadChapterData(chapterId, courseId = null) {
  const course = await ensureActiveCourse(courseId);
  return course.loadLesson(chapterId);
}

export function clearContentCache() {
  getActiveCourse()?.clearCache();
  clearActiveCourse();
  clearCourseRegistryCache();
}

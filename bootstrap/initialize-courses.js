/* bootstrap/initialize-courses.js — Course loading initialization */

import { loadLessons, LESSONS } from '../ui/home.js';
import { refreshUserDictionaryLesson } from '../src/user-dictionaries/runtime.js';

export async function initializeCourses(state, saveFn) {
  await loadLessons();
  const userDictionaryRuntime = await refreshUserDictionaryLesson(LESSONS, undefined, state);
  if (userDictionaryRuntime.added > 0 && typeof saveFn === 'function') {
    await saveFn(true);
  }
}

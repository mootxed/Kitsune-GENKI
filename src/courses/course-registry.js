import { CourseLoader } from './course-loader.js';
import { genki1Adapter } from './genki-1/adapter.js';
import {
  DictionaryStore,
  dictionaryStore as sharedDictionaryStore,
} from '../dictionary/dictionary-store.js';

export const DEFAULT_COURSE_ID = 'genki-1';

const descriptors = new Map([
  [
    DEFAULT_COURSE_ID,
    Object.freeze({
      id: DEFAULT_COURSE_ID,
      manifestUrl: 'data/courses/genki-1/manifest.json',
      adapter: genki1Adapter,
    }),
  ],
]);
const coursePromises = new Map();
const dictionaryStoresByFetch = new WeakMap();

function dictionaryStoreFor(fetchImpl, baseUrl) {
  if (typeof fetchImpl !== 'function') return sharedDictionaryStore;
  if (!dictionaryStoresByFetch.has(fetchImpl)) {
    dictionaryStoresByFetch.set(fetchImpl, new Map());
  }
  const stores = dictionaryStoresByFetch.get(fetchImpl);
  const key = String(baseUrl || '');
  if (!stores.has(key)) {
    stores.set(
      key,
      new DictionaryStore({
        fetchImpl,
        baseUrl,
        userRepository: null,
      })
    );
  }
  return stores.get(key);
}

export function registerCourseDescriptor(descriptor) {
  if (!descriptor?.id || !descriptor?.manifestUrl) {
    throw new Error('[CourseRegistry] id and manifestUrl are required');
  }
  if (descriptors.has(descriptor.id)) {
    throw new Error(`[CourseRegistry] Course ${descriptor.id} is already registered`);
  }
  descriptors.set(descriptor.id, Object.freeze({ ...descriptor }));
  return () => {
    descriptors.delete(descriptor.id);
    coursePromises.delete(descriptor.id);
  };
}

export function getCourseDescriptor(courseId) {
  return descriptors.get(String(courseId || '')) || null;
}

export function getRegisteredCourseIds() {
  return [...descriptors.keys()];
}

export function loadCourse(courseId = DEFAULT_COURSE_ID, options = {}) {
  const id = String(courseId || '');
  const descriptor = getCourseDescriptor(id);
  if (!descriptor) throw new Error(`[CourseRegistry] Unknown course ${id}`);

  const fetchImpl = options.fetchImpl || descriptor.fetchImpl;
  const baseUrl = options.baseUrl || descriptor.baseUrl;
  const dictionaryStore = dictionaryStoreFor(fetchImpl, baseUrl);

  if (options.fetchImpl || options.baseUrl || options.reload === true) {
    return new CourseLoader({
      manifestUrl: descriptor.manifestUrl,
      adapter: descriptor.adapter,
      fetchImpl,
      baseUrl,
      dictionaryStore,
    }).load();
  }

  if (!coursePromises.has(id)) {
    const promise = new CourseLoader({
      manifestUrl: descriptor.manifestUrl,
      adapter: descriptor.adapter,
      fetchImpl,
      baseUrl,
      dictionaryStore,
    })
      .load()
      .catch((error) => {
        coursePromises.delete(id);
        throw error;
      });
    coursePromises.set(id, promise);
  }
  return coursePromises.get(id);
}

export function clearCourseRegistryCache(courseId = null) {
  if (courseId == null) coursePromises.clear();
  else coursePromises.delete(String(courseId));
}

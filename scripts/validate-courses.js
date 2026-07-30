#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CourseLoader } from '../src/courses/course-loader.js';
import { genki1Adapter } from '../src/courses/genki-1/adapter.js';
import { DictionaryLoader } from '../src/dictionary/dictionary-loader.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE_ROOTS = [
  path.join(ROOT, 'public/data/courses'),
  path.join(ROOT, 'tests/fixtures/courses'),
];

async function fileFetch(url) {
  try {
    const body = await readFile(fileURLToPath(url), 'utf8');
    return {
      ok: true,
      status: 200,
      async json() {
        return JSON.parse(body);
      },
    };
  } catch {
    return { ok: false, status: 404 };
  }
}

async function manifestsUnder(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, 'manifest.json'));
}

export async function validateCourses() {
  const manifests = (await Promise.all(COURSE_ROOTS.map((root) => manifestsUnder(root)))).flat();
  const errors = [];
  const results = [];
  const dictionaryStore = new DictionaryStore({
    loader: new DictionaryLoader({
      manifestUrl: pathToFileURL(path.join(ROOT, 'public/data/dictionary/manifest.json')).href,
      fetchImpl: fileFetch,
    }),
    userRepository: null,
  });
  await dictionaryStore.ensureLoaded();

  for (const manifestPath of manifests) {
    try {
      const rawManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const loader = new CourseLoader({
        manifestUrl: pathToFileURL(manifestPath).href,
        fetchImpl: fileFetch,
        adapter: rawManifest.courseId === 'genki-1' ? genki1Adapter : null,
        dictionaryStore,
      });
      const course = await loader.load();
      const lessons = await course.loadAllLessons();
      results.push({
        courseId: course.id,
        lessonCount: lessons.length,
        manifestPath: path.relative(ROOT, manifestPath),
      });
    } catch (error) {
      errors.push(`${path.relative(ROOT, manifestPath)}: ${error.message}`);
    }
  }

  if (manifests.length === 0) errors.push('No course manifests found');
  return { valid: errors.length === 0, errors, courses: results };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await validateCourses();
  if (!result.valid) {
    result.errors.forEach((error) => console.error(`✗ ${error}`));
    process.exitCode = 1;
  } else {
    result.courses.forEach((course) => {
      console.log(`✓ ${course.courseId}: ${course.lessonCount} lesson(s) (${course.manifestPath})`);
    });
  }
}

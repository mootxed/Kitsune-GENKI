import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CourseLoadError, CourseLoader as CoreCourseLoader } from '../src/courses/course-loader.js';
import { genki1Adapter } from '../src/courses/genki-1/adapter.js';
import { DictionaryStore } from '../src/dictionary/dictionary-store.js';

const root = process.cwd();

function fileFetch(rootDirectory, options = {}) {
  return async (input) => {
    const url = new URL(String(input));
    options.onRequest?.(url);
    const marker = options.basePath || '/';
    const relativePath = url.pathname.startsWith(marker)
      ? url.pathname.slice(marker.length)
      : url.pathname.replace(/^\/+/u, '');
    const resolvedPath = relativePath.startsWith('data/dictionary/')
      ? path.join(root, 'public', relativePath)
      : path.join(rootDirectory, relativePath);
    try {
      const raw = await readFile(resolvedPath, 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(raw) };
    } catch {
      return { ok: false, status: 404, json: async () => null };
    }
  };
}

const testDictionaryStore = new DictionaryStore({
  fetchImpl: fileFetch(path.join(root, 'public')),
  baseUrl: 'https://example.test/',
  userRepository: null,
});

function CourseLoader(options) {
  return new CoreCourseLoader({ ...options, dictionaryStore: testDictionaryStore });
}

describe('CourseLoader', () => {
  it('loads GENKI I only through its manifest and returns namespaced runtime entities', async () => {
    const course = await new CourseLoader({
      manifestUrl: 'data/courses/genki-1/manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl: fileFetch(path.join(root, 'public')),
      adapter: genki1Adapter,
    }).load();
    const loaded = await course.loadLesson(course.manifest.entryLessonId);

    expect(course.id).toBe('genki-1');
    expect(course.lessons).toHaveLength(course.manifest.lessonOrder.length);
    expect(loaded.lesson.id).toBe('genki-1:lesson-1');
    expect(loaded.lesson.vocabulary[0]).toMatchObject({
      id: 'genki-1:vocabulary:L1_V001',
      localId: 'L1_V001',
      courseId: 'genki-1',
      introducedIn: 'genki-1:lesson-1',
    });
    expect(loaded.lesson.vocabulary[0].dictionaryId).toMatch(/^jp-word:/u);
    expect(loaded.lesson.grammar[0].id).toBe('genki-1:grammar:L1_g1');
    expect(loaded.story.id).toBe('genki-1:story:lesson-1');
    expect(Object.isFrozen(loaded)).toBe(true);
  });

  it('loads a one-lesson course with string IDs without changing the loader', async () => {
    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl: fileFetch(path.join(root, 'tests/fixtures/courses/test-course')),
    }).load();
    const loaded = await course.loadLesson('test-course:lesson-alpha');

    expect(course.lessons).toHaveLength(1);
    expect(loaded.lesson.id).toBe('test-course:lesson-alpha');
    expect(loaded.lesson.vocabulary.map((word) => word.id)).toEqual([
      'test-course:vocabulary:hello',
      'test-course:vocabulary:bye',
    ]);
    expect(loaded.lesson.grammar[0].id).toBe('test-course:grammar:topic-present');
    expect(loaded.lesson.exercises[0].id).toBe('test-course:exercise:practice-one');
    expect(loaded.story.lessonId).toBe('test-course:lesson-alpha');
  });

  it('reports a missing linked file without silently returning partial lesson data', async () => {
    const fetchImpl = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'), {
      onRequest(url) {
        if (url.pathname.endsWith('/lessons/alpha.json')) {
          throw new Error('simulated missing lesson');
        }
      },
    });
    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    }).load();
    await expect(course.loadLesson('test-course:lesson-alpha')).rejects.toMatchObject({
      name: 'CourseLoadError',
      code: 'course-resource-unavailable',
      resource: 'lesson:test-course:lesson-alpha',
    });
  });

  it('rejects loadLesson when a required grammar file is missing or corrupt', async () => {
    const fetchImpl = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'), {
      onRequest(url) {
        if (url.pathname.endsWith('/grammar/alpha.json')) {
          throw new Error('simulated missing grammar');
        }
      },
    });
    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    }).load();
    await expect(course.loadLesson('test-course:lesson-alpha')).rejects.toMatchObject({
      name: 'CourseLoadError',
      code: 'course-resource-unavailable',
      resource: 'grammar:test-course:lesson-alpha',
    });
  });

  it('rejects loadLesson when a required story file is missing or corrupt', async () => {
    const fetchImpl = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'), {
      onRequest(url) {
        if (url.pathname.endsWith('/stories/alpha.json')) {
          throw new Error('simulated missing story');
        }
      },
    });
    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    }).load();
    await expect(course.loadLesson('test-course:lesson-alpha')).rejects.toMatchObject({
      name: 'CourseLoadError',
      code: 'course-resource-unavailable',
      resource: 'story:test-course:lesson-alpha',
    });
  });

  it('allows optional story resource to fall back to null when missing', async () => {
    const baseFetch = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'));
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/content-index.json')) {
        const res = await baseFetch(input);
        const data = await res.json();
        const entries = data.lessons || data.chapters;
        entries[0].story = { path: './stories/alpha.json', optional: true };
        return { ok: true, status: 200, json: async () => data };
      }
      if (url.pathname.endsWith('/stories/alpha.json')) {
        return { ok: false, status: 404, json: async () => null };
      }
      return baseFetch(input);
    };

    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    }).load();
    const loaded = await course.loadLesson('test-course:lesson-alpha');
    expect(loaded.story).toBeNull();
  });

  it('allows optional grammar resource to fall back to empty array when missing (404)', async () => {
    const baseFetch = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'));
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/grammar/index.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            lessons: [
              {
                lessonId: 'test-course:lesson-alpha',
                path: './grammar/missing.json',
                optional: true,
              },
            ],
          }),
        };
      }
      if (url.pathname.endsWith('/grammar/missing.json')) {
        return { ok: false, status: 404, json: async () => null };
      }
      return baseFetch(input);
    };

    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    }).load();
    const loaded = await course.loadLesson('test-course:lesson-alpha');
    expect(loaded.lesson.grammar).toEqual([]);
  });

  it('throws CourseLoadError when optional resource encounters HTTP 500', async () => {
    const baseFetch = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'));
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/content-index.json')) {
        const res = await baseFetch(input);
        const data = await res.json();
        const entries = data.lessons || data.chapters;
        entries[0].story = { path: './stories/alpha.json', optional: true };
        return { ok: true, status: 200, json: async () => data };
      }
      if (url.pathname.endsWith('/stories/alpha.json')) {
        return { ok: false, status: 500, json: async () => null };
      }
      return baseFetch(input);
    };

    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    }).load();
    await expect(course.loadLesson('test-course:lesson-alpha')).rejects.toMatchObject({
      name: 'CourseLoadError',
      code: 'course-resource-unavailable',
      status: 500,
    });
  });

  it('throws CourseLoadError when optional resource throws fetch network error', async () => {
    const baseFetch = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'));
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/content-index.json')) {
        const res = await baseFetch(input);
        const data = await res.json();
        const entries = data.lessons || data.chapters;
        entries[0].story = { path: './stories/alpha.json', optional: true };
        return { ok: true, status: 200, json: async () => data };
      }
      if (url.pathname.endsWith('/stories/alpha.json')) {
        throw new Error('Network failed');
      }
      return baseFetch(input);
    };

    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    }).load();
    await expect(course.loadLesson('test-course:lesson-alpha')).rejects.toMatchObject({
      name: 'CourseLoadError',
      code: 'course-resource-unavailable',
      status: null,
    });
  });

  it('throws CourseLoadError (invalid-course-json) when optional resource contains corrupt JSON', async () => {
    const baseFetch = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'));
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/content-index.json')) {
        const res = await baseFetch(input);
        const data = await res.json();
        const entries = data.lessons || data.chapters;
        entries[0].story = { path: './stories/alpha.json', optional: true };
        return { ok: true, status: 200, json: async () => data };
      }
      if (url.pathname.endsWith('/stories/alpha.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token');
          },
        };
      }
      return baseFetch(input);
    };

    const course = await new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    }).load();
    await expect(course.loadLesson('test-course:lesson-alpha')).rejects.toMatchObject({
      name: 'CourseLoadError',
      code: 'invalid-course-json',
    });
  });

  it('surfaces malformed JSON and manifest validation errors as CourseLoadError', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ schemaVersion: 99 }),
    });
    await expect(
      new CourseLoader({
        manifestUrl: 'manifest.json',
        baseUrl: 'https://example.test/',
        fetchImpl,
      }).load()
    ).rejects.toBeInstanceOf(CourseLoadError);
  });

  it('resolves every package request under a non-root GitHub Pages base path', async () => {
    const requested = [];
    const course = await new CourseLoader({
      manifestUrl: 'data/courses/test-course/manifest.json',
      baseUrl: 'https://example.test/KotoKitsu/',
      fetchImpl: fileFetch(path.join(root, 'tests/fixtures/courses/test-course'), {
        basePath: '/KotoKitsu/data/courses/test-course/',
        onRequest(url) {
          requested.push(url.pathname);
        },
      }),
    }).load();
    await course.loadLesson('test-course:lesson-alpha');
    expect(requested.length).toBeGreaterThan(4);
    expect(requested.every((pathname) => pathname.startsWith('/KotoKitsu/'))).toBe(true);
  });

  it('rejects unsafe resource paths and paths escaping package root in resolveResourceUrl', () => {
    const loader = new CourseLoader({
      manifestUrl: 'http://localhost/data/courses/test-course/manifest.json',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    });

    const unsafePaths = [
      '../outside.json',
      '.%2e/outside.json',
      '%2e%2e/outside.json',
      '%2E%2E/outside.json',
      'folder/%2e%2e/outside.json',
      'folder\\outside.json',
      'https://example.com/file.json',
      'data:text/plain,test',
      '../test-course-evil/file.json',
    ];

    for (const unsafePath of unsafePaths) {
      expect(() => loader.resolveResourceUrl(unsafePath)).toThrow(CourseLoadError);
    }
  });

  it('handles optional manifest dataPaths correctly', async () => {
    const baseFetch = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'));
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/manifest.json')) {
        const res = await baseFetch(input);
        const manifest = await res.json();
        manifest.dataPaths.examples = { path: './examples/missing.json', optional: true };
        manifest.dataPaths.grammarIndex = { path: './grammar/missing.json', optional: true };
        return { ok: true, status: 200, json: async () => manifest };
      }
      if (
        url.pathname.endsWith('/examples/missing.json') ||
        url.pathname.endsWith('/grammar/missing.json')
      ) {
        return { ok: false, status: 404, json: async () => null };
      }
      return baseFetch(input);
    };

    const loader = new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    });
    const course = await loader.load();
    expect(course.resources.examples).toBeNull();
    expect(course.resources.grammarIndex).toBeNull();
  });

  it('rejects optional manifest dataPath when response contains corrupted JSON', async () => {
    const baseFetch = fileFetch(path.join(root, 'tests/fixtures/courses/test-course'));
    const fetchImpl = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/manifest.json')) {
        const res = await baseFetch(input);
        const manifest = await res.json();
        manifest.dataPaths.examples = { path: './examples/corrupt.json', optional: true };
        return { ok: true, status: 200, json: async () => manifest };
      }
      if (url.pathname.endsWith('/examples/corrupt.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token');
          },
        };
      }
      return baseFetch(input);
    };

    const loader = new CourseLoader({
      manifestUrl: 'manifest.json',
      baseUrl: 'https://example.test/',
      fetchImpl,
    });

    await expect(loader.load()).rejects.toMatchObject({
      name: 'CourseLoadError',
      code: 'invalid-course-json',
    });
  });
});

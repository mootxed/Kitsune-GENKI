import {
  assertCourseManifest,
  contentId,
  deepClone,
  deepFreeze,
  isSafeResourcePath,
  normalizeResourceDescriptor,
} from './course-contract.js';
import {
  DictionaryStore,
  dictionaryStore as sharedDictionaryStore,
} from '../dictionary/dictionary-store.js';

export class CourseLoadError extends Error {
  constructor(code, message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'CourseLoadError';
    this.code = code;
    this.courseId = details.courseId || null;
    this.resource = details.resource || null;
    this.status = details.status ?? null;
  }
}

function appBaseUrl(explicitBaseUrl) {
  if (explicitBaseUrl) return explicitBaseUrl;
  if (typeof document !== 'undefined' && document.baseURI) return document.baseURI;
  if (typeof location !== 'undefined' && location.href) return new URL('./', location.href).href;
  return 'http://localhost/';
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function shallowDocument(document, name, options = {}) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new CourseLoadError(
      'invalid-course-resource',
      `Course resource ${name} must be a JSON object`,
      options
    );
  }
  return document;
}

function isNamespacedLessonId(value, courseId) {
  return String(value || '').startsWith(`${courseId}:lesson-`);
}

function namespaceRefs(entries, mapper) {
  return ensureArray(entries).map((entry) => mapper(String(entry)));
}

export class CourseLoader {
  constructor(options = {}) {
    if (!options.manifestUrl) {
      throw new Error('[CourseLoader] manifestUrl is required');
    }
    if (typeof (options.fetchImpl || globalThis.fetch) !== 'function') {
      throw new Error('[CourseLoader] fetch implementation is required');
    }

    this.fetchImpl = options.fetchImpl || ((...args) => (globalThis.fetch || fetch)(...args));
    this.manifestUrl = new URL(options.manifestUrl, appBaseUrl(options.baseUrl));
    this.packageUrl = new URL('./', this.manifestUrl);
    this.adapter = options.adapter || null;
    this.dictionaryStore =
      options.dictionaryStore ||
      (options.fetchImpl || options.baseUrl
        ? new DictionaryStore({
            fetchImpl: this.fetchImpl,
            baseUrl: appBaseUrl(options.baseUrl),
            userRepository: options.userRepository ?? null,
          })
        : sharedDictionaryStore);
    this.lessonPromises = new Map();
    this.grammarPromises = new Map();
    this.storyPromises = new Map();
  }

  resolveResourceUrl(resourcePath) {
    const rawPath =
      typeof resourcePath === 'object' && resourcePath?.path
        ? resourcePath.path
        : String(resourcePath || '');
    if (!isSafeResourcePath(rawPath)) {
      throw new CourseLoadError(
        'unsafe-course-path',
        `Unsafe or invalid course resource path: ${rawPath}`
      );
    }
    let resolved;
    try {
      resolved = new URL(rawPath, this.packageUrl);
    } catch (cause) {
      throw new CourseLoadError(
        'unsafe-course-path',
        `Invalid URL for course resource path: ${rawPath}`,
        { cause }
      );
    }

    const packagePathname = this.packageUrl.pathname.endsWith('/')
      ? this.packageUrl.pathname
      : `${this.packageUrl.pathname}/`;

    if (
      resolved.origin !== this.packageUrl.origin ||
      !resolved.pathname.startsWith(packagePathname)
    ) {
      throw new CourseLoadError(
        'unsafe-course-path',
        `Course resource escapes package root: ${rawPath}`
      );
    }

    return resolved.href;
  }

  async fetchJson(url, resource, courseId = null) {
    let response;
    try {
      response = await this.fetchImpl(url);
    } catch (cause) {
      throw new CourseLoadError(
        'course-resource-unavailable',
        `Unable to load course resource ${resource}: ${cause?.message || cause}`,
        { cause, courseId, resource, status: null }
      );
    }
    if (!response?.ok) {
      throw new CourseLoadError(
        'course-resource-unavailable',
        `Unable to load course resource ${resource}: HTTP ${response?.status ?? 'unknown'}`,
        { courseId, resource, status: response?.status ?? null }
      );
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new CourseLoadError(
        'invalid-course-json',
        `Course resource ${resource} contains invalid JSON`,
        { cause, courseId, resource, status: response?.status ?? null }
      );
    }
  }

  async loadManifest() {
    const raw = await this.fetchJson(this.manifestUrl.href, 'manifest');
    try {
      return assertCourseManifest(raw, `course manifest ${this.manifestUrl.href}`);
    } catch (cause) {
      throw new CourseLoadError('invalid-course-manifest', cause.message, {
        cause,
        courseId: raw?.courseId || null,
        resource: 'manifest',
      });
    }
  }

  normalizeContentIndex(rawIndex, manifest) {
    const source = shallowDocument(rawIndex, 'contentIndex', { courseId: manifest.courseId });
    const sourceLessons = ensureArray(source.lessons || source.chapters);
    if (sourceLessons.length !== manifest.lessonOrder.length) {
      throw new CourseLoadError(
        'invalid-course-index',
        `Course ${manifest.courseId} declares ${manifest.lessonOrder.length} lessons but its content index contains ${sourceLessons.length}`,
        { courseId: manifest.courseId, resource: 'contentIndex' }
      );
    }

    const seenIds = new Set();
    const lessons = sourceLessons.map((entry, order) => {
      if (!entry || typeof entry !== 'object') {
        throw new CourseLoadError(
          'invalid-course-index',
          `Course ${manifest.courseId} has an invalid lesson entry at order ${order}`,
          { courseId: manifest.courseId, resource: 'contentIndex' }
        );
      }
      const declaredId = manifest.lessonOrder[order];
      const explicitId = entry.courseLessonId || entry.lessonId;
      const id =
        explicitId && isNamespacedLessonId(explicitId, manifest.courseId)
          ? String(explicitId)
          : declaredId;
      if (id !== declaredId) {
        throw new CourseLoadError(
          'invalid-course-index',
          `Lesson ${explicitId} does not match lessonOrder entry ${declaredId}`,
          { courseId: manifest.courseId, resource: 'contentIndex' }
        );
      }
      if (seenIds.has(id)) {
        throw new CourseLoadError('invalid-course-index', `Duplicate lesson ID ${id}`, {
          courseId: manifest.courseId,
          resource: 'contentIndex',
        });
      }
      seenIds.add(id);

      const lessonPath = entry.lesson || entry.path;
      if (typeof lessonPath !== 'string' || !lessonPath) {
        throw new CourseLoadError(
          'invalid-course-index',
          `Lesson ${id} does not declare a lesson resource path`,
          { courseId: manifest.courseId, resource: 'contentIndex' }
        );
      }

      const localId = entry.localId ?? entry.id ?? entry.lesson_id ?? order + 1;
      return {
        ...deepClone(entry),
        id,
        lessonId: id,
        localId,
        legacyId: Number.isInteger(Number(localId)) ? Number(localId) : null,
        courseId: manifest.courseId,
        order,
        lesson: lessonPath,
      };
    });

    return {
      ...deepClone(source),
      courseId: manifest.courseId,
      contentVersion: manifest.contentVersion,
      lessons,
      chapters: lessons,
    };
  }

  async load() {
    const manifest = await this.loadManifest();
    try {
      await this.dictionaryStore.ensureLoaded();
    } catch (cause) {
      throw new CourseLoadError(
        'dictionary-unavailable',
        `Unable to load global dictionary for course ${manifest.courseId}: ${cause.message}`,
        { cause, courseId: manifest.courseId, resource: 'global-dictionary' }
      );
    }
    if (this.adapter?.courseId && this.adapter.courseId !== manifest.courseId) {
      throw new CourseLoadError(
        'course-adapter-mismatch',
        `Adapter for ${this.adapter.courseId} cannot load ${manifest.courseId}`,
        { courseId: manifest.courseId }
      );
    }

    const resourceEntries = Object.entries(manifest.dataPaths);
    const resources = Object.fromEntries(
      await Promise.all(
        resourceEntries.map(async ([name, declaration]) => {
          const descriptor = normalizeResourceDescriptor(declaration);
          if (!descriptor) {
            throw new CourseLoadError(
              'invalid-course-manifest',
              `Invalid resource descriptor for ${name}`,
              { courseId: manifest.courseId, resource: name }
            );
          }

          try {
            const url = this.resolveResourceUrl(descriptor.path);
            const value = await this.fetchJson(url, name, manifest.courseId);
            return [name, value];
          } catch (error) {
            if (
              descriptor.optional &&
              error?.code === 'course-resource-unavailable' &&
              error?.status === 404
            ) {
              return [name, null];
            }
            throw error;
          }
        })
      )
    );
    const contentIndex = this.normalizeContentIndex(resources.contentIndex, manifest);
    if (resources.grammarIndex) {
      shallowDocument(resources.grammarIndex, 'grammarIndex', {
        courseId: manifest.courseId,
        resource: 'grammarIndex',
      });
      if (!Array.isArray(resources.grammarIndex.chapters || resources.grammarIndex.lessons)) {
        throw new CourseLoadError(
          'invalid-course-resource',
          `Course ${manifest.courseId} grammarIndex must contain chapters or lessons`,
          { courseId: manifest.courseId, resource: 'grammarIndex' }
        );
      }
    }
    if (resources.exercises) {
      shallowDocument(resources.exercises, 'exercises', {
        courseId: manifest.courseId,
        resource: 'exercises',
      });
    }
    if (resources.orthography) {
      shallowDocument(resources.orthography, 'orthography', {
        courseId: manifest.courseId,
        resource: 'orthography',
      });
    }
    if (resources.vocabularyAliases) {
      shallowDocument(resources.vocabularyAliases, 'vocabularyAliases', {
        courseId: manifest.courseId,
        resource: 'vocabularyAliases',
      });
    }
    if (resources.vocabularyIndex) {
      shallowDocument(resources.vocabularyIndex, 'vocabularyIndex', {
        courseId: manifest.courseId,
        resource: 'vocabularyIndex',
      });
    }

    const lessons = contentIndex.lessons;
    const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const lessonAliases = new Map();
    for (const lesson of lessons) {
      for (const alias of [
        lesson.id,
        lesson.localId,
        lesson.legacyId,
        lesson.lesson_id,
        lesson.order + 1,
      ]) {
        if (alias != null && alias !== '') lessonAliases.set(String(alias), lesson.id);
      }
    }
    const knowledgeLessonIds = new Map();

    const canonicalLessonId = (value) => {
      if (value == null || value === '') return null;
      return lessonAliases.get(String(value)) || null;
    };

    const lessonRecord = (value) => {
      const id = canonicalLessonId(value);
      if (!id) {
        throw new CourseLoadError(
          'unknown-course-lesson',
          `Course ${manifest.courseId} does not contain lesson ${value}`,
          { courseId: manifest.courseId }
        );
      }
      return lessonsById.get(id);
    };

    const canonicalVocabularyLocalId = (localId) => {
      const aliases = resources.vocabularyAliases?.aliases || {};
      let current = String(localId || '');
      const visited = new Set();
      while (aliases[current] && !visited.has(current)) {
        visited.add(current);
        current = aliases[current];
      }
      return this.adapter?.canonicalizeVocabularyLocalId
        ? this.adapter.canonicalizeVocabularyLocalId(current)
        : current;
    };

    const vocabularyId = (localId) =>
      contentId(manifest.courseId, 'vocabulary', canonicalVocabularyLocalId(localId));
    const grammarId = (localId) => contentId(manifest.courseId, 'grammar', localId);
    const exerciseId = (localId) => contentId(manifest.courseId, 'exercise', localId);

    const rawVocabularyIndex = resources.vocabularyIndex || null;
    const allVocabularyRefs = [];
    const vocabularyByLessonMap = new Map();

    if (rawVocabularyIndex && Array.isArray(rawVocabularyIndex.lessons)) {
      for (const lessonEntry of rawVocabularyIndex.lessons) {
        const rawLId = lessonEntry.lessonId || lessonEntry.id;
        const lessonId = canonicalLessonId(rawLId) || String(rawLId);
        const words = ensureArray(lessonEntry.words);
        const resolvedRefsForLesson = [];
        for (const w of words) {
          const localId = canonicalVocabularyLocalId(w.localId || w.id);
          const id = vocabularyId(localId);
          const ref = {
            ...deepClone(w),
            id,
            localId,
            courseId: manifest.courseId,
            dictionaryId: w.dictionaryId,
            introducedIn: lessonId,
            lessonId,
            chapterId: lessonId,
          };
          if (ref.dictionaryId) {
            try {
              const resolved = this.dictionaryStore.resolveCourseVocabularyReference(ref);
              resolvedRefsForLesson.push(resolved);
              allVocabularyRefs.push(resolved);
              knowledgeLessonIds.set(id, lessonId);
              if (!knowledgeLessonIds.has(resolved.dictionaryId)) {
                knowledgeLessonIds.set(resolved.dictionaryId, lessonId);
              }
            } catch (cause) {
              console.warn(`[CourseLoader] Failed to register vocabulary reference ${id}:`, cause);
            }
          }
        }
        vocabularyByLessonMap.set(lessonId, resolvedRefsForLesson);
      }
    }

    const transformQuiz = (quiz) => ({
      ...deepClone(quiz),
      id: quiz?.id ? contentId(manifest.courseId, 'quiz', quiz.id) : quiz?.id,
      localId: quiz?.id || null,
      grammarRefs: namespaceRefs(quiz?.grammarRefs, grammarId),
      vocabularyRefs: namespaceRefs(quiz?.vocabularyRefs, vocabularyId),
    });

    const transformGrammarTopic = (topic, lessonId, index = 0) => {
      const localId = String(topic?.localId || topic?.id || `grammar-${index + 1}`);
      const transformed = {
        ...deepClone(topic),
        id: grammarId(localId),
        localId,
        courseId: manifest.courseId,
        introducedIn: lessonId,
        chapterId: lessonId,
        lessonId,
        requiredVocabularyIds: namespaceRefs(topic?.requiredVocabularyIds, vocabularyId),
        prerequisiteGrammarIds: namespaceRefs(topic?.prerequisiteGrammarIds, grammarId),
        quiz: ensureArray(topic?.quiz).map(transformQuiz),
      };
      knowledgeLessonIds.set(transformed.id, lessonId);
      return transformed;
    };

    const transformExercise = (task, lessonId, index = 0) => {
      const localId = String(task?.localId || task?.id || `exercise-${index + 1}`);
      return {
        ...deepClone(task),
        id: exerciseId(localId),
        localId,
        courseId: manifest.courseId,
        chapterId: lessonId,
        lessonId,
        relatedGrammarIds: namespaceRefs(task?.relatedGrammarIds, grammarId),
      };
    };

    const exercisesForLesson = (value) => {
      const lesson = lessonRecord(value);
      const entries = ensureArray(resources.exercises?.lessons || resources.exercises?.chapters);
      const source = entries.find((entry) => {
        const candidate = entry?.lessonId ?? entry?.chapterId ?? entry?.id;
        return canonicalLessonId(candidate) === lesson.id;
      });
      return ensureArray(source?.exercises || source?.practice).map((task, index) =>
        transformExercise(task, lesson.id, index)
      );
    };

    const grammarIndexEntry = (value) => {
      const lesson = lessonRecord(value);
      const entries = ensureArray(
        resources.grammarIndex?.lessons || resources.grammarIndex?.chapters
      );
      return (
        entries.find((entry) => {
          const candidate = entry?.lessonId ?? entry?.chapterId ?? entry?.id;
          return canonicalLessonId(candidate) === lesson.id;
        }) || null
      );
    };

    const loadGrammar = async (value) => {
      const lesson = lessonRecord(value);
      if (!resources.grammarIndex) return null;
      if (!this.grammarPromises.has(lesson.id)) {
        const promise = (async () => {
          const entry = grammarIndexEntry(lesson.id);
          if (!entry || (!entry.path && typeof entry !== 'string')) return null;
          const descriptor = normalizeResourceDescriptor(entry);
          if (!descriptor?.path) return null;
          try {
            const raw = await this.fetchJson(
              this.resolveResourceUrl(descriptor.path),
              `grammar:${lesson.id}`,
              manifest.courseId
            );
            const topics = ensureArray(raw.topics).map((topic, index) =>
              transformGrammarTopic(topic, lesson.id, index)
            );
            return deepFreeze({
              ...deepClone(raw),
              courseId: manifest.courseId,
              chapterId: lesson.id,
              lessonId: lesson.id,
              topics,
            });
          } catch (cause) {
            if (
              descriptor.optional &&
              cause?.code === 'course-resource-unavailable' &&
              cause?.status === 404
            ) {
              return { optionalMissing: true, topics: [] };
            }
            throw cause;
          }
        })().catch((error) => {
          this.grammarPromises.delete(lesson.id);
          throw error;
        });
        this.grammarPromises.set(lesson.id, promise);
      }
      return this.grammarPromises.get(lesson.id);
    };

    const loadStory = async (value) => {
      const lesson = lessonRecord(value);
      if (!lesson.story) return null;
      const descriptor = normalizeResourceDescriptor(lesson.story);
      if (!descriptor?.path) return null;
      if (!this.storyPromises.has(lesson.id)) {
        const promise = (async () => {
          try {
            const raw = await this.fetchJson(
              this.resolveResourceUrl(descriptor.path),
              `story:${lesson.id}`,
              manifest.courseId
            );
            const localId = String(raw?.localId || raw?.id || lesson.localId);
            return deepFreeze({
              ...deepClone(raw),
              id: contentId(manifest.courseId, 'story', `lesson-${lesson.order + 1}`),
              localId,
              courseId: manifest.courseId,
              lessonId: lesson.id,
              lesson_id: lesson.id,
            });
          } catch (cause) {
            if (
              descriptor.optional &&
              cause?.code === 'course-resource-unavailable' &&
              cause?.status === 404
            ) {
              return null;
            }
            throw cause;
          }
        })().catch((error) => {
          this.storyPromises.delete(lesson.id);
          throw error;
        });
        this.storyPromises.set(lesson.id, promise);
      }
      return this.storyPromises.get(lesson.id);
    };

    const loadLesson = async (value) => {
      const summary = lessonRecord(value);
      if (!this.lessonPromises.has(summary.id)) {
        const promise = (async () => {
          const [lessonResult, grammarResult, storyResult] = await Promise.allSettled([
            this.fetchJson(
              this.resolveResourceUrl(summary.lesson),
              `lesson:${summary.id}`,
              manifest.courseId
            ),
            loadGrammar(summary.id),
            loadStory(summary.id),
          ]);
          if (lessonResult.status === 'rejected') throw lessonResult.reason;
          if (grammarResult.status === 'rejected') throw grammarResult.reason;
          if (storyResult.status === 'rejected') throw storyResult.reason;

          const wrapper = lessonResult.value;
          const rawLesson = wrapper?.lesson || wrapper;
          const rawNotes = ensureArray(rawLesson?.notes || rawLesson?.grammar);
          const grammarData = grammarResult.status === 'fulfilled' ? grammarResult.value : null;
          let grammar;

          if (!grammarData) {
            grammar = rawNotes.map((note, index) =>
              deepFreeze(transformGrammarTopic(note, summary.id, index))
            );
          } else if (grammarData.optionalMissing) {
            grammar = [];
          } else {
            const quizTopics = ensureArray(grammarData.topics);
            const topicsByLocalId = new Map(
              quizTopics.map((topic) => [String(topic.localId), topic])
            );
            const topicsByNoteId = new Map(
              quizTopics.map((topic) => [String(topic.noteId ?? topic.note_id ?? ''), topic])
            );
            if (rawNotes.length > 0) {
              grammar = rawNotes.map((note, index) => {
                const localId = String(
                  note?.localId ||
                    note?.id ||
                    `grammar-${note?.noteId || note?.note_id || index + 1}`
                );
                const quizTopic =
                  topicsByLocalId.get(localId) ||
                  topicsByNoteId.get(String(note?.noteId ?? note?.note_id ?? index + 1));
                if (quizTopic) {
                  return deepFreeze({
                    ...deepClone(note),
                    ...deepClone(quizTopic),
                    id: quizTopic.id,
                    localId,
                  });
                }
                return deepFreeze(transformGrammarTopic(note, summary.id, index));
              });
            } else {
              grammar = quizTopics.map((topic, index) =>
                deepFreeze(transformGrammarTopic(topic, summary.id, index))
              );
            }
          }

          const vocabulary = ensureArray(rawLesson?.vocabulary || rawLesson?.words)
            .filter(
              (word) =>
                !this.adapter?.isRetiredVocabularyLocalId ||
                !this.adapter.isRetiredVocabularyLocalId(word?.id)
            )
            .map((word) => {
              const localId = canonicalVocabularyLocalId(word?.localId || word?.id);
              const id = vocabularyId(localId);
              const reference = {
                ...deepClone(word),
                id,
                localId,
                courseId: manifest.courseId,
                dictionaryId: word.dictionaryId,
                introducedIn: summary.id,
                lessonId: summary.id,
                chapterId: summary.id,
              };
              if (!reference.dictionaryId) {
                throw new CourseLoadError(
                  'broken-dictionary-reference',
                  `Course vocabulary reference is missing dictionaryId: courseId=${manifest.courseId}, lessonId=${summary.id}, referenceId=${id}, dictionaryId=null`,
                  {
                    courseId: manifest.courseId,
                    resource: `lesson:${summary.id}`,
                  }
                );
              }
              let transformed;
              try {
                transformed = this.dictionaryStore.resolveCourseVocabularyReference(reference);
              } catch (cause) {
                throw new CourseLoadError(
                  'broken-dictionary-reference',
                  `Broken dictionary reference: courseId=${manifest.courseId}, lessonId=${summary.id}, referenceId=${id}, dictionaryId=${reference.dictionaryId}`,
                  {
                    cause,
                    courseId: manifest.courseId,
                    resource: `lesson:${summary.id}`,
                  }
                );
              }
              knowledgeLessonIds.set(id, summary.id);
              if (!knowledgeLessonIds.has(transformed.dictionaryId)) {
                knowledgeLessonIds.set(transformed.dictionaryId, summary.id);
              }
              return deepFreeze(transformed);
            });
          const exercises = exercisesForLesson(summary.id).map(deepFreeze);
          const story = storyResult.status === 'fulfilled' ? storyResult.value : null;

          return deepFreeze({
            lesson: {
              ...deepClone(rawLesson),
              id: summary.id,
              lesson_id: summary.id,
              localId: summary.localId,
              legacyId: summary.legacyId,
              courseId: manifest.courseId,
              order: summary.order,
              vocabulary,
              words: vocabulary,
              notes: grammar,
              grammar,
              practice: exercises,
              exercises,
            },
            version: wrapper?.version ?? manifest.contentVersion,
            story,
          });
        })().catch((error) => {
          this.lessonPromises.delete(summary.id);
          throw error;
        });
        this.lessonPromises.set(summary.id, promise);
      }
      return this.lessonPromises.get(summary.id);
    };

    const canonicalizeKnowledgeId = (value) => {
      const raw = String(value || '');
      const dictionaryResolved = this.dictionaryStore.resolveAlias(raw);
      if (dictionaryResolved !== raw || this.dictionaryStore.hasDictionaryEntry(raw)) {
        return dictionaryResolved;
      }
      const vocabularyPrefix = `${manifest.courseId}:vocabulary:`;
      if (raw.startsWith(vocabularyPrefix)) {
        return this.dictionaryStore.resolveAlias(vocabularyId(raw.slice(vocabularyPrefix.length)));
      }
      if (raw.includes(':')) return raw;
      return this.dictionaryStore.resolveAlias(vocabularyId(raw));
    };

    const lessonIdForKnowledge = (value) => {
      const canonicalId = canonicalizeKnowledgeId(value);
      const known = knowledgeLessonIds.get(canonicalId);
      if (known) return known;
      const reference = this.dictionaryStore
        .findCourseReferencesForDictionary(canonicalId)
        .find((entry) => entry.courseId === manifest.courseId);
      if (reference) return reference.introducedIn;
      const localId = String(value || '').replace(`${manifest.courseId}:vocabulary:`, '');
      const candidate = this.adapter?.lessonLocalIdFromVocabularyLocalId?.(localId);
      return candidate == null ? null : canonicalLessonId(candidate);
    };

    const lessonOrdinal = (value) => {
      const id = canonicalLessonId(value);
      return id ? lessonsById.get(id).order : -1;
    };

    const getFeature = (featureId) =>
      manifest.features.find((feature) => feature.id === featureId) || null;

    const course = {
      id: manifest.courseId,
      manifest: deepFreeze(deepClone(manifest)),
      contentIndex: deepFreeze(deepClone(contentIndex)),
      lessons: deepFreeze(deepClone(lessons)),
      resources: deepFreeze(
        Object.fromEntries(
          Object.keys(manifest.dataPaths || {}).map((name) => [
            name,
            deepClone(resources[name] || null),
          ])
        )
      ),
      canonicalLessonId,
      lessonOrdinal,
      getLessonSummary(value) {
        const id = canonicalLessonId(value);
        return id ? lessonsById.get(id) || null : null;
      },
      loadLesson,
      loadGrammar,
      loadStory,
      getExercisesForLesson(value) {
        return deepFreeze(exercisesForLesson(value));
      },
      getVocabularyIndex() {
        return deepFreeze({
          schemaVersion: rawVocabularyIndex?.schemaVersion || 1,
          contentVersion: rawVocabularyIndex?.contentVersion || manifest.contentVersion,
          courseId: manifest.courseId,
          lessons: Array.from(vocabularyByLessonMap.entries()).map(([lessonId, words]) => ({
            id: lessonId,
            lessonId,
            words,
          })),
        });
      },
      getVocabularyForLesson(value) {
        const id = canonicalLessonId(value) || String(value || '');
        return deepFreeze(vocabularyByLessonMap.get(id) || []);
      },
      getAllVocabularyReferences() {
        return deepFreeze([...allVocabularyRefs]);
      },
      getDictionaryEntry: (dictionaryId) => this.dictionaryStore.getDictionaryEntry(dictionaryId),
      getCourseVocabularyReference: (referenceId) =>
        this.dictionaryStore.getCourseVocabularyReference(referenceId),
      findCourseReferencesForDictionary: (dictionaryId) =>
        this.dictionaryStore
          .findCourseReferencesForDictionary(dictionaryId)
          .filter((reference) => reference.courseId === manifest.courseId),
      resolveVocabularyRuntimeItem: (id) => this.dictionaryStore.resolveVocabularyRuntimeItem(id),
      async loadAllLessons() {
        return Promise.all(manifest.lessonOrder.map(loadLesson));
      },
      canonicalizeKnowledgeId,
      lessonIdForKnowledge,
      getFeature,
      hasFeature(featureId, lessonId = null) {
        const feature = getFeature(featureId);
        if (!feature) return false;
        if (lessonId == null) return true;
        return lessonOrdinal(lessonId) >= lessonOrdinal(feature.introducedIn);
      },
      resolveResourceUrl: (path) => this.resolveResourceUrl(path),
      clearCache: () => {
        this.lessonPromises.clear();
        this.grammarPromises.clear();
        this.storyPromises.clear();
      },
    };

    return Object.freeze(course);
  }
}

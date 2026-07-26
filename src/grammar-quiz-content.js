/* src/grammar-quiz-content.js — Grammar Quiz content loader & validator */

export const GRAMMAR_QUIZ_SCHEMA_VERSION = 1;
const ALLOWED_QUESTION_TYPES = new Set(['single-choice', 'fill-blank', 'sentence-order']);

let indexPromise = null;
let quizIndexData = null;

const chapterPromises = new Map();
const chapterCache = new Map();

/**
 * Normalizes a quiz answer text according to standard rules.
 * @param {string} value
 * @param {object} [options]
 * @returns {string}
 */
export function normalizeGrammarQuizAnswer(value, options = {}) {
  if (value == null) return '';
  let str = String(value).trim().normalize('NFC');
  str = str.replace(/\s+/g, ' ');
  if (options.ignoreFinalPunctuation !== false && (str.endsWith('。') || str.endsWith('.'))) {
    str = str.slice(0, -1).trim();
  }
  return str;
}

/**
 * Builds a global vocabulary reference index across provided lessons.
 * @param {Array} lessons
 * @returns {Map<string, { chapterId: number, word: object }>}
 */
export function buildVocabularyReferenceIndex(lessons = []) {
  const vocabIndex = new Map();
  for (const lesson of lessons || []) {
    const target = lesson?.lesson || lesson;
    const chapterId = Number(target.id || target.lesson_id);
    const words = target.words || target.vocabulary || [];
    for (const w of words) {
      const vId = String(w.id || w);
      vocabIndex.set(vId, { chapterId, word: w });
    }
  }
  return vocabIndex;
}

/**
 * Validates the root index.json manifest.
 * @param {object} index
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGrammarQuizIndex(index) {
  const errors = [];

  if (!index || typeof index !== 'object') {
    errors.push('index-must-be-an-object');
    return { valid: false, errors };
  }

  if (index.schemaVersion !== GRAMMAR_QUIZ_SCHEMA_VERSION) {
    errors.push(`unsupported-index-schema-version:${index.schemaVersion}`);
  }

  if (!Array.isArray(index.chapters)) {
    errors.push('index-chapters-must-be-an-array');
    return { valid: false, errors };
  }

  if (index.chapters.length !== 12) {
    errors.push(`index-must-contain-12-chapters:found-${index.chapters.length}`);
  }

  const chapterIds = new Set();
  const paths = new Set();

  for (let i = 0; i < index.chapters.length; i++) {
    const entry = index.chapters[i];
    const expectedId = i + 1;
    const chId = Number(entry?.chapterId);

    if (!Number.isInteger(chId) || chId !== expectedId) {
      errors.push(`invalid-chapter-id-order:expected-${expectedId}-got-${entry?.chapterId}`);
    }
    if (chapterIds.has(chId)) {
      errors.push(`duplicate-index-chapter-id:${chId}`);
    }
    chapterIds.add(chId);

    const runtimePath = String(entry?.path || '');
    if (!runtimePath) {
      errors.push(`missing-chapter-path:${chId}`);
    } else {
      if (paths.has(runtimePath)) {
        errors.push(`duplicate-index-path:${runtimePath}`);
      }
      paths.add(runtimePath);

      if (
        runtimePath.includes('../') ||
        runtimePath.startsWith('/') ||
        runtimePath.startsWith('http://') ||
        runtimePath.startsWith('https://') ||
        runtimePath.startsWith('public/')
      ) {
        errors.push(`unsafe-runtime-path:${chId}:${runtimePath}`);
      }
    }

    if (!Number.isInteger(entry?.topicCount) || entry.topicCount <= 0) {
      errors.push(`invalid-topic-count:${chId}:${entry?.topicCount}`);
    }
    if (!Number.isInteger(entry?.questionCount) || entry.questionCount <= 0) {
      errors.push(`invalid-question-count:${chId}:${entry?.questionCount}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Loads and validates index.json.
 * @returns {Promise<object>}
 */
export async function loadGrammarQuizIndex() {
  if (!indexPromise) {
    indexPromise = fetch('data/grammar-quizzes/index.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for data/grammar-quizzes/index.json`);
        return res.json();
      })
      .then((data) => {
        const validation = validateGrammarQuizIndex(data);
        if (!validation.valid) {
          throw new Error(`Invalid grammar quiz index: ${validation.errors.join(', ')}`);
        }
        quizIndexData = data;
        return data;
      })
      .catch((err) => {
        indexPromise = null;
        quizIndexData = null;
        console.warn('[GrammarQuiz] Failed to load index:', err);
        throw err;
      });
  }
  return indexPromise;
}

/**
 * Detects cycles in the grammar prerequisite graph.
 * @param {Array} topics
 * @returns {boolean} True if cycle detected
 */
export function detectGrammarPrerequisiteCycles(topics = []) {
  const graph = new Map();
  for (const t of topics) {
    graph.set(String(t.id), (t.prerequisiteGrammarIds || []).map(String));
  }
  const visited = new Set();
  const recStack = new Set();

  function dfs(node) {
    if (recStack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    recStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) return true;
    }

    recStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (dfs(node)) return true;
  }
  return false;
}

function getMultisetCounts(arr) {
  const counts = new Map();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}

function areMultisetsEqual(arr1, arr2) {
  if (!Array.isArray(arr1) || !Array.isArray(arr2)) return false;
  if (arr1.length !== arr2.length) return false;
  const c1 = getMultisetCounts(arr1);
  const c2 = getMultisetCounts(arr2);
  if (c1.size !== c2.size) return false;
  for (const [k, v] of c1.entries()) {
    if (c2.get(k) !== v) return false;
  }
  return true;
}

/**
 * Validates grammar quiz data against schema rules, indexEntry, and optional lesson references.
 * @param {object} data - Grammar quiz JSON data for a chapter.
 * @param {Array} lessons - Optional array of normalized lessons for reference checks.
 * @param {object} [indexEntry] - Optional index manifest entry for this chapter.
 * @returns {{ valid: boolean, errors: string[], warnings: string[], invalidTopicIds: Set<string> }}
 */
export function validateGrammarQuizData(data, lessons = [], indexEntry = null) {
  const errors = [];
  const warnings = [];
  const invalidTopicIds = new Set();
  const topicIds = new Set();
  const questionIds = new Set();

  if (!data || typeof data !== 'object') {
    errors.push('quiz-data-must-be-an-object');
    return { valid: false, errors, warnings, invalidTopicIds };
  }

  if (data.schemaVersion !== GRAMMAR_QUIZ_SCHEMA_VERSION) {
    errors.push(`unsupported-schema-version:${data.schemaVersion}`);
  }

  const chapterId = Number(data.chapterId);
  if (!Number.isInteger(chapterId) || chapterId <= 0 || chapterId > 12) {
    errors.push(`invalid-chapter-id:${data.chapterId}`);
  }

  if (indexEntry) {
    if (Number(indexEntry.chapterId) !== chapterId) {
      errors.push(`chapter-id-mismatch-index:${chapterId}-vs-${indexEntry.chapterId}`);
    }
  }

  if (!Array.isArray(data.topics)) {
    errors.push('topics-must-be-an-array');
    return { valid: false, errors, warnings, invalidTopicIds };
  }

  if (indexEntry && Number.isInteger(indexEntry.topicCount)) {
    if (data.topics.length !== indexEntry.topicCount) {
      errors.push(`topic-count-mismatch-index:${data.topics.length}-vs-${indexEntry.topicCount}`);
    }
  }

  let totalQuestionsCount = 0;
  for (const t of data.topics) {
    if (Array.isArray(t.quiz)) totalQuestionsCount += t.quiz.length;
  }

  if (indexEntry && Number.isInteger(indexEntry.questionCount)) {
    if (totalQuestionsCount !== indexEntry.questionCount) {
      errors.push(
        `question-count-mismatch-index:${totalQuestionsCount}-vs-${indexEntry.questionCount}`
      );
    }
  }

  const vocabIndex = buildVocabularyReferenceIndex(lessons);

  const targetLessonRaw = Array.isArray(lessons)
    ? lessons.find((l) => {
        const item = l?.lesson || l;
        return Number(item.id || item.lesson_id) === chapterId;
      })
    : null;
  const targetLesson = targetLessonRaw?.lesson || targetLessonRaw;

  // Prerequisites cycle detection
  if (detectGrammarPrerequisiteCycles(data.topics)) {
    errors.push(`prerequisite-cycle-detected-in-chapter:${chapterId}`);
  }

  const topicOrderMap = new Map();
  data.topics.forEach((t, idx) => {
    if (t?.id) topicOrderMap.set(String(t.id), idx + 1);
  });

  for (const topic of data.topics) {
    const topicId = String(topic?.id || '');
    if (!topicId) {
      errors.push(`missing-topic-id-in-chapter:${chapterId}`);
      continue;
    }

    const expectedPrefix = `L${chapterId}_g`;
    if (!topicId.startsWith(expectedPrefix)) {
      errors.push(`invalid-topic-id-prefix:${topicId}:expected-${expectedPrefix}`);
    }

    const addTopicError = (msg) => {
      errors.push(`${topicId}:${msg}`);
      invalidTopicIds.add(topicId);
    };

    if (topicIds.has(topicId)) {
      addTopicError(`duplicate-topic-id:${topicId}`);
    }
    topicIds.add(topicId);

    if (
      topic.noteId == null ||
      !Number.isInteger(Number(topic.noteId)) ||
      Number(topic.noteId) <= 0
    ) {
      addTopicError(`invalid-note-id:${topic.noteId}`);
    }

    if (!topic.title || typeof topic.title !== 'string' || !topic.title.trim()) {
      addTopicError('missing-title');
    }
    if (!topic.summary || typeof topic.summary !== 'string' || !topic.summary.trim()) {
      addTopicError('missing-summary');
    }
    if (!topic.formula || typeof topic.formula !== 'string' || !topic.formula.trim()) {
      addTopicError('missing-formula');
    }
    if (!Number.isInteger(topic.estimatedMinutes) || topic.estimatedMinutes <= 0) {
      addTopicError(`invalid-estimated-minutes:${topic.estimatedMinutes}`);
    }

    if (
      !topic.explanation ||
      (typeof topic.explanation !== 'string' && !Array.isArray(topic.explanation))
    ) {
      addTopicError('invalid-explanation');
    }

    if (!Array.isArray(topic.examples)) {
      addTopicError('examples-must-be-an-array');
    }

    if (targetLesson) {
      const lessonTopics =
        targetLesson.notes || targetLesson.grammar || targetLesson.grammarTopics || [];
      const matchingNote = lessonTopics.find(
        (t) => String(t.id || `L${chapterId}_g${t.note_id || t.noteId}`) === topicId
      );
      if (!matchingNote) {
        addTopicError(`topic-not-found-in-lesson:${topicId}`);
      } else if (
        topic.noteId != null &&
        matchingNote.note_id != null &&
        Number(topic.noteId) !== Number(matchingNote.note_id)
      ) {
        addTopicError(`note-id-mismatch:${topic.noteId}-vs-${matchingNote.note_id}`);
      }
    }

    if (Array.isArray(topic.prerequisiteGrammarIds)) {
      for (const pId of topic.prerequisiteGrammarIds) {
        if (pId === topicId) {
          addTopicError(`self-prerequisite:${pId}`);
        }
        const match = String(pId).match(/^L(\d+)_g(\d+)/i);
        if (match) {
          const pCh = Number(match[1]);
          const pNote = Number(match[2]);
          if (pCh > chapterId) {
            addTopicError(`future-prerequisite-grammar:${pId}`);
          } else if (pCh === chapterId && topic.noteId != null && pNote >= Number(topic.noteId)) {
            addTopicError(`future-or-same-topic-prerequisite:${pId}`);
          }
        }
      }
    }

    if (Array.isArray(topic.requiredVocabularyIds) && vocabIndex.size > 0) {
      for (const vId of topic.requiredVocabularyIds) {
        const entry = vocabIndex.get(String(vId));
        if (!entry) {
          addTopicError(`unknown-required-vocabulary:${vId}`);
        } else if (entry.chapterId > chapterId) {
          addTopicError(`future-required-vocabulary:${vId}:from-chapter-${entry.chapterId}`);
        }
      }
    }

    if (!Array.isArray(topic.quiz) || topic.quiz.length < 3) {
      addTopicError(`quiz-must-have-at-least-3-questions:found-${topic.quiz?.length || 0}`);
      continue;
    }

    for (const q of topic.quiz) {
      const qId = String(q?.id || '');
      if (!qId) {
        addTopicError('missing-question-id');
        continue;
      }

      if (!qId.startsWith(topicId)) {
        addTopicError(`question-id-must-start-with-topic-id:${qId}:expected-${topicId}`);
      }

      if (questionIds.has(qId)) {
        addTopicError(`duplicate-question-id:${qId}`);
      }
      questionIds.add(qId);

      if (!ALLOWED_QUESTION_TYPES.has(q?.type)) {
        addTopicError(`invalid-question-type:${qId}:${q?.type}`);
      }

      if (!q?.prompt || typeof q.prompt !== 'string' || !q.prompt.trim()) {
        addTopicError(`missing-prompt:${qId}`);
      }

      if (!q?.explanation || typeof q.explanation !== 'string' || !q.explanation.trim()) {
        addTopicError(`missing-explanation:${qId}`);
      }

      if (q?.type === 'single-choice') {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          addTopicError(`single-choice-requires-at-least-2-options:${qId}`);
        } else {
          const optionIds = new Set();
          for (const opt of q.options) {
            if (!opt?.id || !opt?.text) {
              addTopicError(`invalid-option-structure:${qId}`);
            } else {
              optionIds.add(String(opt.id));
            }
          }
          if (!q.correctOptionId || !optionIds.has(String(q.correctOptionId))) {
            addTopicError(`invalid-correct-option-id:${qId}:${q.correctOptionId}`);
          }
        }
      } else if (q?.type === 'fill-blank') {
        if (
          !Array.isArray(q.acceptedAnswers) ||
          q.acceptedAnswers.length === 0 ||
          q.acceptedAnswers.some((a) => typeof a !== 'string' || !a.trim())
        ) {
          addTopicError(`invalid-accepted-answers:${qId}`);
        } else {
          const rawSet = new Set();
          for (const ans of q.acceptedAnswers) {
            const rawNorm = normalizeGrammarQuizAnswer(ans, { ignoreFinalPunctuation: false });
            if (rawSet.has(rawNorm)) {
              warnings.push(`duplicate-accepted-answer:${qId}:${ans}`);
            }
            rawSet.add(rawNorm);
          }
        }
      } else if (q?.type === 'sentence-order') {
        if (!Array.isArray(q.tokens) || q.tokens.length === 0) {
          addTopicError(`sentence-order-missing-tokens:${qId}`);
        }
        if (!Array.isArray(q.correctOrder) || q.correctOrder.length === 0) {
          addTopicError(`sentence-order-missing-correct-order:${qId}`);
        } else if (Array.isArray(q.tokens)) {
          if (!areMultisetsEqual(q.tokens, q.correctOrder)) {
            addTopicError(`sentence-order-token-multiset-mismatch:${qId}`);
          }
        }
      }

      if (Array.isArray(q.vocabularyRefs) && vocabIndex.size > 0) {
        for (const vRef of q.vocabularyRefs) {
          const entry = vocabIndex.get(String(vRef));
          if (!entry) {
            addTopicError(`unknown-vocabulary-ref:${qId}:${vRef}`);
          } else if (entry.chapterId > chapterId) {
            addTopicError(`future-vocabulary-ref:${qId}:${vRef}:from-chapter-${entry.chapterId}`);
          }
        }
      }

      if (Array.isArray(q.grammarRefs)) {
        for (const gRef of q.grammarRefs) {
          const match = String(gRef).match(/^L(\d+)_g(\d+)/i);
          if (match) {
            const refChapter = Number(match[1]);
            const refNote = Number(match[2]);
            if (refChapter > chapterId) {
              addTopicError(`future-chapter-grammar-ref:${qId}:${gRef}`);
            } else if (refChapter === chapterId) {
              const currentNoteId = Number(topic.noteId);
              if (currentNoteId && refNote > currentNoteId) {
                addTopicError(`future-same-chapter-grammar-ref:${qId}:${gRef}`);
              }
            }
          } else {
            addTopicError(`invalid-grammar-ref-format:${qId}:${gRef}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.warn(`[GrammarQuiz] Validation failed for chapter ${chapterId}:`, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    invalidTopicIds,
  };
}

/**
 * Loads a specific grammar quiz chapter JSON.
 * @param {number|string} chapterId
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function loadGrammarQuizChapter(chapterId, options = {}) {
  const id = Number(chapterId);
  if (!Number.isInteger(id) || id <= 0 || id > 12) {
    throw new Error(`Grammar quiz chapter ${chapterId} is invalid`);
  }

  if (chapterCache.has(id)) {
    return chapterCache.get(id);
  }

  if (chapterPromises.has(id)) {
    return chapterPromises.get(id);
  }

  const promise = (async () => {
    const index = await loadGrammarQuizIndex();
    const entry = index.chapters.find((chapter) => Number(chapter.chapterId) === id);

    if (!entry) {
      throw new Error(`Grammar quiz chapter ${id} is not registered`);
    }

    const runtimePath = entry.path;
    const response = await fetch(runtimePath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${runtimePath}`);
    }

    const data = await response.json();
    const lessons = options.lessons || [];
    const validation = validateGrammarQuizData(data, lessons, entry);

    // Sanitize corrupted topics
    const sanitizedTopics = (data.topics || []).map((t) => {
      if (validation.invalidTopicIds.has(t.id)) {
        return { ...t, quiz: null };
      }
      return t;
    });

    const sanitizedData = {
      ...data,
      topics: sanitizedTopics,
    };

    chapterCache.set(id, sanitizedData);
    return sanitizedData;
  })()
    .catch((err) => {
      console.warn(`[GrammarQuiz] Error loading chapter ${id}:`, err);
      throw err;
    })
    .finally(() => {
      chapterPromises.delete(id);
    });

  chapterPromises.set(id, promise);
  return promise;
}

/**
 * Get grammar quiz data for a chapter (safe getter).
 * @param {number|string} chapterId
 * @returns {Promise<object|null>}
 */
export async function getGrammarQuizForChapter(chapterId) {
  const id = Number(chapterId);
  try {
    return await loadGrammarQuizChapter(id);
  } catch {
    return null;
  }
}

/**
 * Get a specific topic quiz by chapterId and topicId.
 * @param {number|string} chapterId
 * @param {string} topicId
 * @returns {Promise<object|null>}
 */
export async function getGrammarQuizTopic(chapterId, topicId) {
  const chapterQuiz = await getGrammarQuizForChapter(chapterId);
  if (!chapterQuiz || !Array.isArray(chapterQuiz.topics)) return null;
  return chapterQuiz.topics.find((t) => String(t.id) === String(topicId)) || null;
}

/**
 * Prefetch a grammar quiz chapter quietly.
 * @param {number|string} chapterId
 */
export function prefetchGrammarQuizChapter(chapterId) {
  const id = Number(chapterId);
  if (id > 0 && id <= 12 && !chapterCache.has(id) && !chapterPromises.has(id)) {
    loadGrammarQuizChapter(id).catch(() => {});
  }
}

/**
 * Clear memory caches for grammar quiz index/chapters.
 * @param {number|string} [chapterId]
 */
export function clearGrammarQuizCache(chapterId) {
  if (chapterId != null) {
    const id = Number(chapterId);
    chapterCache.delete(id);
    chapterPromises.delete(id);
  } else {
    indexPromise = null;
    quizIndexData = null;
    chapterPromises.clear();
    chapterCache.clear();
  }
}

/**
 * Backward-compatible function for loading quiz data.
 * Defaults to chapter 1 if not specified.
 * @param {number|string} [chapterId=1]
 * @returns {Promise<object|null>}
 */
export async function loadGrammarQuizData(chapterId = 1) {
  return loadGrammarQuizChapter(chapterId);
}

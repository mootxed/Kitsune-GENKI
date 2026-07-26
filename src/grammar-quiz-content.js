/* src/grammar-quiz-content.js — Grammar Quiz content loader & validator */

export const GRAMMAR_QUIZ_SCHEMA_VERSION = 1;
const ALLOWED_QUESTION_TYPES = new Set(['single-choice', 'fill-blank', 'sentence-order']);

let quizPromise = null;
let quizIndex = null; // chapterId -> data object

async function fetchGrammarQuizJson(runtimePath = 'data/genki-lesson-01-grammar-quiz.json') {
  const response = await fetch(runtimePath);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${runtimePath}`);
  }
  return response.json();
}

/**
 * Validates grammar quiz data against schema rules and optional lesson reference data.
 * @param {object} data - Grammar quiz JSON data for a chapter.
 * @param {Array} lessons - Optional array of normalized lessons for reference checks.
 * @returns {{ valid: boolean, errors: string[], warnings: string[], invalidTopicIds: Set<string> }}
 */
export function validateGrammarQuizData(data, lessons = []) {
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
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    errors.push(`invalid-chapter-id:${data.chapterId}`);
  }

  if (!Array.isArray(data.topics)) {
    errors.push('topics-must-be-an-array');
    return { valid: false, errors, warnings, invalidTopicIds };
  }

  const targetLesson = Array.isArray(lessons)
    ? lessons.find((l) => Number(l.id || l.lesson_id) === chapterId)
    : null;
  const lessonVocabIds = new Set(
    (targetLesson?.words || targetLesson?.vocabulary || []).map((w) => String(w.id || w))
  );

  for (const topic of data.topics) {
    const topicId = String(topic?.id || '');
    if (!topicId) {
      errors.push(`missing-topic-id-in-chapter:${chapterId}`);
      continue;
    }

    const addTopicError = (msg) => {
      errors.push(`${topicId}:${msg}`);
      invalidTopicIds.add(topicId);
    };

    if (topicIds.has(topicId)) {
      addTopicError(`duplicate-topic-id:${topicId}`);
    }
    topicIds.add(topicId);

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

    if (Array.isArray(topic.requiredVocabularyIds) && targetLesson && lessonVocabIds.size > 0) {
      for (const vId of topic.requiredVocabularyIds) {
        if (!lessonVocabIds.has(String(vId))) {
          addTopicError(`unknown-required-vocabulary:${vId}`);
        }
      }
    }

    if (!Array.isArray(topic.quiz)) {
      addTopicError('quiz-must-be-an-array');
      continue;
    }

    for (const q of topic.quiz) {
      const qId = String(q?.id || '');
      if (!qId) {
        addTopicError('missing-question-id');
        continue;
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
        if (!Array.isArray(q.options) || q.options.length === 0) {
          addTopicError(`single-choice-missing-options:${qId}`);
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
        }
      } else if (q?.type === 'sentence-order') {
        if (!Array.isArray(q.tokens) || q.tokens.length === 0) {
          addTopicError(`sentence-order-missing-tokens:${qId}`);
        }
        if (!Array.isArray(q.correctOrder) || q.correctOrder.length === 0) {
          addTopicError(`sentence-order-missing-correct-order:${qId}`);
        } else if (Array.isArray(q.tokens)) {
          const tokenSet = new Set(q.tokens);
          for (const tok of q.correctOrder) {
            if (!tokenSet.has(tok)) {
              addTopicError(`correct-order-token-missing-from-tokens:${qId}:${tok}`);
            }
          }
        }
      }

      if (Array.isArray(q.vocabularyRefs) && targetLesson && lessonVocabIds.size > 0) {
        for (const vRef of q.vocabularyRefs) {
          if (!lessonVocabIds.has(String(vRef))) {
            warnings.push(`unknown-vocabulary-ref:${qId}:${vRef}`);
          }
        }
      }

      if (Array.isArray(q.grammarRefs)) {
        for (const gRef of q.grammarRefs) {
          const match = String(gRef).match(/^L(\d+)_g/i);
          if (match) {
            const refChapter = Number(match[1]);
            if (refChapter > chapterId) {
              addTopicError(`future-chapter-grammar-ref:${qId}:${gRef}`);
            }
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

export async function loadGrammarQuizData() {
  if (!quizPromise) {
    quizPromise = fetchGrammarQuizJson('data/genki-lesson-01-grammar-quiz.json')
      .then((data) => {
        const validation = validateGrammarQuizData(data);
        const chapterId = Number(data.chapterId);

        // Clone data & invalidate corrupted topics
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

        quizIndex = new Map([[chapterId, sanitizedData]]);
        return sanitizedData;
      })
      .catch((error) => {
        quizPromise = null;
        quizIndex = null;
        console.warn('[GrammarQuiz] Failed to load quiz data:', error);
        return null;
      });
  }
  return quizPromise;
}

export async function getGrammarQuizForChapter(chapterId) {
  const chId = Number(chapterId);
  if (!quizIndex) {
    await loadGrammarQuizData();
  }
  return quizIndex?.get(chId) || null;
}

export async function getGrammarQuizTopic(chapterId, topicId) {
  const chapterQuiz = await getGrammarQuizForChapter(chapterId);
  if (!chapterQuiz || !Array.isArray(chapterQuiz.topics)) return null;
  return chapterQuiz.topics.find((t) => t.id === topicId) || null;
}

export function clearGrammarQuizCache() {
  quizPromise = null;
  quizIndex = null;
}

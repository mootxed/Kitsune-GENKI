/* Validation and normalization for curated active-production prompts. */

import { katakanaToHiragana } from './typing-capability.js';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeProductionAnswer(text) {
  if (text == null) return '';
  let str = String(text).trim().normalize('NFKC');
  // Strip Japanese/Western punctuation symbols that don't affect grammar
  str = str.replace(/[。！？.!?「」]/gu, '');
  str = str.replace(/[,\s]+$/u, '');
  str = str.replace(/\s+/g, ' ');
  return str.trim();
}

/**
 * Validates a single context-production task object.
 * Returns a clean, normalized task or null if invalid.
 */
export function validateProductionTask(task) {
  if (!task || typeof task !== 'object') return null;

  if (
    task.focusItemId !== undefined &&
    (typeof task.focusItemId !== 'string' || !task.focusItemId.trim())
  ) {
    return null;
  }
  const focusItemId =
    typeof task.focusItemId === 'string' && task.focusItemId.trim()
      ? task.focusItemId.trim()
      : 'item';
  const id = typeof task.id === 'string' && task.id.trim() ? task.id.trim() : `${focusItemId}_cp`;
  const prompt = typeof task.prompt === 'string' ? task.prompt.trim() : '';
  const meaningCue = typeof task.meaningCue === 'string' ? task.meaningCue.trim() : '';

  if (!prompt) return null;

  const declaredAnswers = Array.isArray(task.acceptedAnswers)
    ? task.acceptedAnswers
    : task.acceptedAnswers != null
      ? [task.acceptedAnswers]
      : [];

  const acceptedAnswers = declaredAnswers
    .map((a) => (typeof a === 'string' ? a.trim() : ''))
    .filter(Boolean)
    .filter((a, index, array) => array.indexOf(a) === index);

  if (acceptedAnswers.length === 0) return null;

  const requiredForm = task.requiredForm;
  if (!requiredForm) return null;
  if (typeof requiredForm === 'object') {
    if (!nonEmptyString(requiredForm.type)) return null;
  } else if (!nonEmptyString(requiredForm)) {
    return null;
  }

  const grammarTopicIds = Array.isArray(task.grammarTopicIds)
    ? task.grammarTopicIds.filter(nonEmptyString)
    : [];

  return {
    id,
    focusItemId,
    prompt,
    meaningCue,
    acceptedAnswers,
    requiredForm,
    grammarTopicIds,
    hint: typeof task.hint === 'string' ? task.hint.trim() : '',
    explanation: typeof task.explanation === 'string' ? task.explanation.trim() : '',
  };
}

/**
 * Evaluates a user answer against a validated context-production task.
 */
export function evaluateProductionAnswer(userAnswer, task) {
  const normUser = normalizeProductionAnswer(userAnswer);
  if (!normUser) {
    return {
      correct: false,
      normalizedUserAnswer: '',
      matchedAnswer: null,
      mismatchReason: 'empty_answer',
    };
  }

  const validTask = validateProductionTask(task);
  if (!validTask) {
    return {
      correct: false,
      normalizedUserAnswer: normUser,
      matchedAnswer: null,
      mismatchReason: 'invalid_task',
    };
  }

  const normUserKana = katakanaToHiragana(normUser);

  for (const accepted of validTask.acceptedAnswers) {
    const normAccepted = normalizeProductionAnswer(accepted);
    const normAcceptedKana = katakanaToHiragana(normAccepted);

    if (normUser === normAccepted || normUserKana === normAcceptedKana) {
      return {
        correct: true,
        normalizedUserAnswer: normUser,
        matchedAnswer: accepted,
        mismatchReason: null,
      };
    }
  }

  return {
    correct: false,
    normalizedUserAnswer: normUser,
    matchedAnswer: null,
    mismatchReason: 'mismatch',
  };
}

/**
 * Returns all trustworthy production tasks for a word, or an empty array.
 */
export function productionTasks(word) {
  const source = word?.contextProduction || word?.context_production;
  if (!source) return [];

  const rawList = Array.isArray(source) ? source : [source];
  const validList = [];

  for (const item of rawList) {
    const validated = validateProductionTask(item);
    if (validated) {
      validList.push(validated);
    }
  }

  return validList;
}

/**
 * Returns a trustworthy primary production task or null.
 */
export function productionContext(word) {
  const tasks = productionTasks(word);
  return tasks.length > 0 ? tasks[0] : null;
}

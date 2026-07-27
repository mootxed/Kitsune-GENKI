/* Task selection logic for context-production cards */

import { productionTasks } from './production-context.js';

/**
 * Selects a context-production task for a focus word.
 * Rotates between available tasks without immediate repetition if options.lastTaskId or reviewHistory is provided.
 *
 * @param {object} word - Normalized vocabulary word
 * @param {object} [card] - SRS card object
 * @param {Array} [reviewHistory] - List of review events
 * @param {object} [options] - Options (random function, lastTaskId)
 * @returns {object|null} Valid task object or null if none available/valid
 */
export function selectProductionTask(word, card = null, reviewHistory = [], options = {}) {
  const tasks = productionTasks(word);
  if (tasks.length === 0) {
    console.warn(
      `[TaskSelection] Нет валидных context-production заданий для слова ${word?.id || 'unknown'}`
    );
    return null;
  }

  if (tasks.length === 1) {
    return tasks[0];
  }

  // Find last used task ID for this word/card from options or reviewHistory
  let lastTaskId = options.lastTaskId || null;
  if (!lastTaskId && Array.isArray(reviewHistory) && reviewHistory.length > 0) {
    const wordEvents = reviewHistory.filter(
      (e) => (e.itemId === word.id || e.cardId === card?.id) && e.taskId
    );
    if (wordEvents.length > 0) {
      lastTaskId = wordEvents[wordEvents.length - 1].taskId;
    }
  }

  const candidateTasks = lastTaskId ? tasks.filter((t) => t.id !== lastTaskId) : tasks;

  const available = candidateTasks.length > 0 ? candidateTasks : tasks;
  const randomFn = typeof options.random === 'function' ? options.random : Math.random;
  const index = Math.floor(randomFn() * available.length);

  return available[index] || tasks[0];
}

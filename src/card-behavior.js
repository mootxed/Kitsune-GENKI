export const LEECH_THRESHOLD = 8;

export const RESPONSE_TIME_THRESHOLDS = Object.freeze({
  'multiple-choice': Object.freeze({ fast: 3_000, slow: 10_000 }),
  multipleChoice: Object.freeze({ fast: 3_000, slow: 10_000 }),
  'particle-quiz': Object.freeze({ fast: 3_000, slow: 10_000 }),
  typing: Object.freeze({ fast: 5_000, slow: 15_000 }),
  'sentence-building': Object.freeze({ fast: 5_000, slow: 15_000 }),
  drawing: Object.freeze({ fast: 10_000, slow: 30_000 }),
});

export function isLeech(card, threshold = LEECH_THRESHOLD) {
  return Boolean(card) && Number.isFinite(card.lapses) && card.lapses >= threshold;
}

export function handleLeech(card, threshold = LEECH_THRESHOLD) {
  if (!isLeech(card, threshold)) return false;

  const wasLeech = card.isLeech === true;
  card.isLeech = true;
  card.leechNotified = true;
  return !wasLeech;
}

export function adjustQualityByTime(quality, responseTimeMs, mode) {
  if (quality <= 0 || !Number.isFinite(responseTimeMs) || responseTimeMs < 0) {
    return quality;
  }

  const thresholds = RESPONSE_TIME_THRESHOLDS[mode];
  if (!thresholds) return quality;

  // Скорость не доказывает отсутствие угадывания, поэтому Good никогда не
  // повышается автоматически до Easy (особенно в multiple choice).
  if (responseTimeMs >= thresholds.slow && quality === 5) return 4;
  return quality;
}

export function deepClone(value) {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function restoreCardState(card, previousState) {
  if (!card || !previousState) return false;

  for (const key of Object.keys(card)) delete card[key];
  Object.assign(card, deepClone(previousState));
  return true;
}

export function undoReviewEvent(appState, eventId, undoneAt = Date.now()) {
  const event = (appState?.reviewEvents || []).find((entry) => entry.eventId === eventId);
  if (!event || event.undoneAt || !event.previousCard) return false;
  const card = appState.srs?.[event.cardId];
  if (!card || !restoreCardState(card, event.previousCard)) return false;
  event.undoneAt = undoneAt;
  return true;
}

export class UndoStack {
  constructor(maxSize = 10) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new Error('UndoStack maxSize должен быть положительным целым числом');
    }
    this.stack = [];
    this.maxSize = maxSize;
  }

  push(cardId, previousState, metadata = {}) {
    this.stack.push({
      cardId,
      state: deepClone(previousState),
      timestamp: Date.now(),
      ...deepClone(metadata),
    });
    if (this.stack.length > this.maxSize) this.stack.shift();
  }

  undo(restore) {
    if (typeof restore !== 'function') {
      throw new Error('UndoStack.undo требует функцию восстановления');
    }

    const last = this.stack.pop();
    if (!last) return false;
    restore(last.cardId, deepClone(last.state));
    return true;
  }

  pop() {
    const last = this.stack.pop();
    return last ? deepClone(last) : null;
  }

  clear() {
    this.stack = [];
  }

  get size() {
    return this.stack.length;
  }

  get canUndo() {
    return this.stack.length > 0;
  }
}

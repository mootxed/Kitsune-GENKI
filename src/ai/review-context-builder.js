/**
 * src/ai/review-context-builder.js
 *
 * Строит ReviewAttemptSnapshot из данных режима карточки.
 *
 * ИНВАРИАНТЫ:
 *  - не мутирует входной aiAttempt
 *  - snapshot является новым нормализованным объектом
 *  - никакие точные FSRS-числа не попадают в output
 *  - не вызывается при system-fallback, preview, debug-skip, auto-Good
 */

import { ReviewAttemptSnapshotSchema } from './review-attempt-schema.js';
import { buildMemoryContext, computeResponseTimeBand } from './review-memory-context.js';
import { LEECH_THRESHOLD } from '../card-behavior.js';
import { parseCardIdentity } from '../knowledge-model.js';

/**
 * Определяет outcome из данных результата.
 *
 * @param {object} result — результат submitReview
 * @param {object} aiAttempt — контекст из адаптера
 * @returns {'correct'|'incorrect'|'partial'|'hinted'|'skipped'}
 */
function computeOutcome(result, aiAttempt) {
  const mistakes = Number(aiAttempt?.mistakes ?? 0);
  const hintUsed = Boolean(aiAttempt?.hintUsed);
  const quality = result?.quality;

  // Пропуск
  if (quality === 0 && mistakes === 0 && !hintUsed) {
    // Если нет ответа — skipped; иначе — incorrect
    if (!aiAttempt?.userAnswer && !aiAttempt?.selectedOption) return 'skipped';
  }

  if (quality === 0) return 'incorrect';

  if (hintUsed) return 'hinted';
  if (mistakes > 0) return 'partial';
  return 'correct';
}

/**
 * Проверяет, достаточно ли контекста для создания snapshot.
 * Возвращает false при system-fallback, preview, debug-skip, auto-Good без контекста.
 */
function hasSufficientContext(mode, aiAttempt, submitResult) {
  // Технические режимы — не создавать snapshot
  if (['system-fallback', 'preview', 'debug-skip'].includes(mode)) return false;
  // Review не был принят FSRS
  if (!submitResult?.accepted) return false;
  // Нет task context
  if (!aiAttempt?.prompt && !aiAttempt?.expectedAnswers?.length) return false;
  return true;
}

/**
 * Строит ReviewAttemptSnapshot из данных режима.
 *
 * @param {object} params
 * @param {object} params.card — SRS-карточка (только для lookup identity)
 * @param {object} params.word — словарное слово
 * @param {string} params.mode — режим карточки
 * @param {object} params.submitResult — результат submitReview()
 * @param {object} params.aiAttempt — контекст из адаптера режима
 * @param {object} params.srsCard — srs-запись (для memory context)
 * @param {number} params.responseTimeMs — время ответа в мс
 * @returns {ReviewAttemptSnapshot|null}
 */
export function buildReviewAttemptSnapshot({
  card,
  word,
  mode,
  submitResult,
  aiAttempt,
  srsCard,
  responseTimeMs,
}) {
  if (!hasSufficientContext(mode, aiAttempt, submitResult)) {
    return null;
  }

  const identity = parseCardIdentity(card);
  const skill = identity.skill || 'recognition';

  const memoryContext = buildMemoryContext(srsCard, LEECH_THRESHOLD);
  const responseTimeBand = computeResponseTimeBand(responseTimeMs, mode);

  const mistakes = Number(aiAttempt.mistakes ?? 0);
  const hintUsed = Boolean(aiAttempt.hintUsed);
  // firstAttemptCorrect — null если неизвестно
  const firstAttemptCorrect = aiAttempt.firstAttemptCorrect ?? null;

  const outcome = computeOutcome(submitResult, { ...aiAttempt, mistakes, hintUsed });

  // Строим новый объект (не мутируем aiAttempt)
  const raw = {
    schemaVersion: 1,

    item: {
      writing: String(word?.writing || word?.kanji || ''),
      reading: word?.reading || null,
      meanings: Array.isArray(word?.meanings)
        ? word.meanings.slice(0, 10)
        : [String(word?.translation || word?.meaning || '')].filter(Boolean),
      partOfSpeech: Array.isArray(word?.partOfSpeech)
        ? word.partOfSpeech.slice(0, 8)
        : word?.category
          ? [word.category]
          : [],
    },

    skill,
    mode,

    task: {
      prompt: String(aiAttempt.prompt || '').trim(),
      instruction: aiAttempt.instruction || null,
      contextSentence: aiAttempt.contextSentence || null,
      contextTranslation: aiAttempt.contextTranslation || null,
    },

    answer: {
      expectedAnswers: (aiAttempt.expectedAnswers || []).slice(0, 20),
      userAnswer: aiAttempt.userAnswer || null,
      selectedOption: aiAttempt.selectedOption || null,
      correctOption: aiAttempt.correctOption || null,
    },

    result: {
      outcome,
      mistakes,
      hintUsed,
      firstAttemptCorrect,
      responseTimeBand,
    },

    memoryContext,
  };

  // Валидируем через схему
  const parsed = ReviewAttemptSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    // Не ломаем карточную сессию — просто возвращаем null
    console.warn('[buildReviewAttemptSnapshot] Schema validation failed:', parsed.error.issues);
    return null;
  }

  return parsed.data;
}

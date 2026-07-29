/**
 * ui/flashcards/sensei-review-actions.js
 *
 * Определяет, показывать ли кнопки AI Сенсея после ответа.
 * Единая точка политики видимости — не дублируется в режимах.
 *
 * Правила приоритета (пункт 10 ТЗ):
 *  1. ошибка/mistakes → explain_error (основной)
 *  2. иначе hint/slow fragile → explain_more
 *  3. иначе leech → mnemonic
 *  При leech + ошибке → обе кнопки (explain_error + mnemonic)
 *
 * Технические режимы (system-fallback, preview, debug-skip) → никогда.
 * Первый правильный ответ без hints и слово не leech → никогда.
 */

import { getLastConfusion } from '../../src/ai/local-diagnosis.js';

const EXCLUDED_MODES = new Set(['system-fallback', 'preview', 'debug-skip']);

/**
 * @typedef {{ actionType: 'explain_error'|'explain_more'|'mnemonic', label: string }} SenseiAction
 * @typedef {{ show: boolean, actions: SenseiAction[] }} SenseiActionDecision
 */

/**
 * Определяет, показывать ли AI Сенсея после ответа.
 *
 * @param {import('../src/ai/review-attempt-schema.js').ReviewAttemptSnapshot|null} snapshot
 * @returns {SenseiActionDecision}
 */
export function shouldShowSenseiAction(snapshot) {
  if (!snapshot) return { show: false, actions: [] };

  const { mode, result, memoryContext } = snapshot;

  // Технические режимы — никогда
  if (!mode || EXCLUDED_MODES.has(mode)) return { show: false, actions: [] };

  // Нет task context → не можем объяснить
  if (!snapshot.task?.prompt) return { show: false, actions: [] };

  const { outcome, mistakes, hintUsed, firstAttemptCorrect, responseTimeBand } = result;
  const { stage, isLeech, recentLapse } = memoryContext;

  const hasError =
    outcome === 'incorrect' ||
    mistakes > 0 ||
    (firstAttemptCorrect === false && (outcome === 'incorrect' || mistakes > 0));

  const isSlowFragile =
    (responseTimeBand === 'slow' && (stage === 'fragile' || stage === 'leech')) || recentLapse;

  const isDrawing = mode === 'drawing';
  const actions = [];

  // В Drawing нет текстового ответа — не предлагаем "Разобрать ошибку"
  if (hasError && !isDrawing) {
    actions.push({
      actionType: 'explain_error',
      reason: 'error',
      label: '🔍 Разобрать ошибку',
    });

    if (isLeech) {
      actions.push({
        actionType: 'mnemonic',
        reason: 'error',
        label: '🧠 Мнемоника',
      });
    }

    return { show: true, actions };
  }

  // Для Drawing при ошибке показываем "Объяснить написание"
  if (hasError && isDrawing) {
    actions.push({
      actionType: 'explain_more',
      reason: 'writing_guidance',
      label: '📖 Объяснить написание',
    });
    if (isLeech) {
      actions.push({
        actionType: 'mnemonic',
        reason: 'writing_guidance',
        label: '🧠 Мнемоника',
      });
    }
    return { show: true, actions };
  }

  // Приоритет 2: hint или медленный ответ при fragile/leech
  if (hintUsed || isSlowFragile) {
    const baseReason = hintUsed
      ? 'hint_used'
      : responseTimeBand === 'slow'
        ? 'slow_answer'
        : 'recent_lapse';
    const reason = isDrawing ? 'writing_guidance' : baseReason;
    actions.push({
      actionType: 'explain_more',
      reason,
      label: isDrawing ? '📖 Объяснить написание' : '📖 Объяснить подробнее',
    });
    return { show: true, actions };
  }

  // Приоритет 3: leech (без ошибки на этот раз)
  if (isLeech) {
    actions.push({
      actionType: 'mnemonic',
      reason: 'recent_lapse',
      label: '🧠 Придумать мнемонику',
    });
    return { show: true, actions };
  }

  // Идеальный ответ без особых флагов — не показываем
  return { show: false, actions: [] };
}

/**
 * Строит input для handleExplainReviewError / handleCreateMnemonic.
 *
 * @param {import('../src/ai/review-attempt-schema.js').ReviewAttemptSnapshot} snapshot
 * @param {'explain_error'|'explain_more'|'mnemonic'} actionType
 * @param {object|null} localDiagnosis
 * @param {string} [reason]
 * @returns {object}
 */
export function buildSenseiActionInput(
  snapshot,
  actionType,
  localDiagnosis = null,
  reason = 'error'
) {
  if (actionType === 'mnemonic') {
    return {
      item: snapshot.item,
      skill: snapshot.skill,
      mode: snapshot.mode,
      confusion: getLastConfusion(snapshot?.answer),
      userPreferences: { mnemonicLanguage: 'ru' },
    };
  }

  // explain_error or explain_more
  return {
    attempt: snapshot,
    localDiagnosis: localDiagnosis || null,
    reason: reason || (actionType === 'explain_more' ? 'slow_answer' : 'error'),
  };
}

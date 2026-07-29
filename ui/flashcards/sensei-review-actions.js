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
    // firstAttemptCorrect: только если явно false И есть подтверждение через outcome/mistakes
    (firstAttemptCorrect === false && (outcome === 'incorrect' || mistakes > 0));

  const isSlowFragile =
    (responseTimeBand === 'slow' && (stage === 'fragile' || stage === 'leech')) || recentLapse;

  const actions = [];

  // Приоритет 1: ошибка
  if (hasError) {
    actions.push({
      actionType: 'explain_error',
      label: '🔍 Разобрать ошибку',
    });

    // При leech + ошибке — показываем обе кнопки
    if (isLeech) {
      actions.push({
        actionType: 'mnemonic',
        label: '🧠 Мнемоника',
      });
    }

    return { show: true, actions };
  }

  // Приоритет 2: hint или медленный ответ при fragile/leech
  if (hintUsed || isSlowFragile) {
    actions.push({
      actionType: 'explain_more',
      label: '📖 Объяснить подробнее',
    });
    return { show: true, actions };
  }

  // Приоритет 3: leech (без ошибки на этот раз)
  if (isLeech) {
    actions.push({
      actionType: 'mnemonic',
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
 * @returns {object}
 */
export function buildSenseiActionInput(snapshot, actionType, localDiagnosis = null) {
  if (actionType === 'mnemonic') {
    return {
      item: snapshot.item,
      skill: snapshot.skill,
      mode: snapshot.mode,
      confusion: snapshot.answer.userAnswer || snapshot.answer.selectedOption || null,
      userPreferences: { mnemonicLanguage: 'ru' },
    };
  }

  // explain_error or explain_more
  return {
    attempt: snapshot,
    localDiagnosis: localDiagnosis || null,
  };
}

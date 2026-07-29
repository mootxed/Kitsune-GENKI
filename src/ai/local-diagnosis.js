/**
 * src/ai/local-diagnosis.js
 *
 * Безопасная локальная диагностика очевидных ошибок до AI-запроса.
 *
 * НЕ является полным морфологическим анализатором.
 * При недостаточной уверенности возвращает { category: 'unknown', confidence: 'low' }.
 *
 * Правило нормализации: использует те же expectedAnswers и requiredForm,
 * что хранятся в aiAttempt — НЕ реализует вторую несовместимую проверку.
 */

/** @typedef {import('./review-attempt-schema.js').ReviewAttemptSnapshot} ReviewAttemptSnapshot */

// ます-суффиксы вежливой формы (прошедшее и настоящее)
const POLITE_SUFFIXES = ['ます', 'ました', 'ません', 'ませんでした', 'ましょう', 'ませ'];
// Окончания словарных глаголов группы 2
const ICHIDAN_DICT_ENDINGS = ['る'];
// Показатели отрицания
const NEGATIVE_SUFFIXES = ['ない', 'ません', 'なかった', 'ませんでした', 'ないです'];
// Показатели прошедшего времени
const PAST_SUFFIXES = ['た', 'だ', 'ました', 'でした'];

/**
 * Проверяет, оканчивается ли строка на одно из переданных окончаний.
 */
function endsWith(str, suffixes) {
  return suffixes.some((s) => str.endsWith(s));
}

/**
 * Сравнивает userAnswer с expectedAnswers и requiredForm,
 * возвращает локальный диагноз.
 *
 * @param {ReviewAttemptSnapshot} snapshot
 * @returns {{ category: string, confidence: 'high'|'medium'|'low' }}
 */
export function diagnoseReviewError(snapshot) {
  if (!snapshot) return { category: 'unknown', confidence: 'low' };

  const { answer, result } = snapshot;

  if (!answer || result?.outcome === 'correct') {
    return { category: 'unknown', confidence: 'low' };
  }

  const userAnswer = String(answer.userAnswer || '').trim();
  const expectedAnswers = (answer.expectedAnswers || []).map((a) => String(a).trim());
  const correctOption = String(answer.correctOption || '').trim();
  const selectedOption = String(answer.selectedOption || '').trim();

  if (!userAnswer && !selectedOption) {
    return { category: 'unknown', confidence: 'low' };
  }

  const actual = userAnswer || selectedOption;
  const expected = expectedAnswers[0] || correctOption;

  if (!actual || !expected) return { category: 'unknown', confidence: 'low' };

  // --- Particle quiz ---
  if (snapshot.mode === 'particle-quiz' && selectedOption && correctOption) {
    if (selectedOption !== correctOption) {
      return { category: 'wrong_particle', confidence: 'high' };
    }
  }

  // --- Multiple choice / context-sentence: похожее слово ---
  if (
    (snapshot.mode === 'multiple-choice' ||
      snapshot.mode === 'reverse-multiple-choice' ||
      snapshot.mode === 'context-sentence') &&
    selectedOption &&
    correctOption &&
    selectedOption !== correctOption
  ) {
    // Неправильный перевод или похожее слово — используем 'wrong_meaning'
    return { category: 'similar_word_confusion', confidence: 'medium' };
  }

  // --- Typing / context-production: анализируем форму ---
  if (userAnswer && expectedAnswers.length > 0) {
    // Вежливая форма вместо словарной
    if (
      endsWith(userAnswer, POLITE_SUFFIXES) &&
      !expectedAnswers.some((a) => endsWith(a, POLITE_SUFFIXES))
    ) {
      return { category: 'polite_instead_of_dictionary_form', confidence: 'high' };
    }

    // Словарная форма вместо вежливой
    if (
      !endsWith(userAnswer, POLITE_SUFFIXES) &&
      expectedAnswers.some((a) => endsWith(a, POLITE_SUFFIXES)) &&
      endsWith(userAnswer, ICHIDAN_DICT_ENDINGS)
    ) {
      return { category: 'dictionary_instead_of_polite_form', confidence: 'high' };
    }

    // Отрицание вместо положительной формы
    if (
      endsWith(userAnswer, NEGATIVE_SUFFIXES) &&
      !expectedAnswers.some((a) => endsWith(a, NEGATIVE_SUFFIXES))
    ) {
      return { category: 'negation_error', confidence: 'high' };
    }

    // Положительная вместо отрицательной
    if (
      !endsWith(userAnswer, NEGATIVE_SUFFIXES) &&
      expectedAnswers.some((a) => endsWith(a, NEGATIVE_SUFFIXES))
    ) {
      return { category: 'negation_error', confidence: 'medium' };
    }

    // Прошедшее вместо настоящего / настоящее вместо прошедшего
    const userPast = endsWith(userAnswer, PAST_SUFFIXES);
    const expectedPast = expectedAnswers.some((a) => endsWith(a, PAST_SUFFIXES));
    if (userPast !== expectedPast) {
      return { category: 'tense_error', confidence: 'medium' };
    }

    // Kana/kanji confusion: answer и expected содержат одинаковое чтение но разное написание
    // Простая эвристика: одинаковая длина, оба содержат японские символы, один — только кана
    const hasKanji = (s) => /[\u4e00-\u9fff\u3400-\u4dbf]/u.test(s);
    const isKanaOnly = (s) => /^[\u3040-\u309f\u30a0-\u30ff\uff65-\uff9f]+$/u.test(s);

    if (hasKanji(expected) && isKanaOnly(userAnswer) && userAnswer.length === expected.length) {
      return { category: 'kana_confusion', confidence: 'medium' };
    }
    if (isKanaOnly(expected) && hasKanji(userAnswer)) {
      return { category: 'kanji_confusion', confidence: 'medium' };
    }

    // Неправильный перевод — только для режимов с русским ответом
    if (snapshot.mode === 'multiple-choice' || snapshot.mode === 'context-sentence') {
      return { category: 'wrong_meaning', confidence: 'medium' };
    }
  }

  // --- Sentence building: неправильный порядок ---
  if (snapshot.mode === 'sentence-building') {
    return { category: 'wrong_word_order', confidence: 'medium' };
  }

  // Недостаточно данных для диагноза
  return { category: 'unknown', confidence: 'low' };
}

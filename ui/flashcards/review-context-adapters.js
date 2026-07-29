/**
 * ui/flashcards/review-context-adapters.js
 *
 * Адаптеры режимов карточки для формирования aiAttempt.
 * aiAttempt передаётся в reviewContext ДО вызова submitReview().
 *
 * Каждый адаптер использует ТУ ЖЕ нормализацию ответов что и реальный режим.
 * Не реализует вторую несовместимую проверку правильности.
 *
 * Возвращаемый объект НЕ содержит внутренних ID карточек.
 */

/**
 * Базовая структура aiAttempt (передаётся в reviewContext).
 *
 * @typedef {object} AIAttemptContext
 * @property {string|null} prompt — что видел пользователь
 * @property {string|null} instruction
 * @property {string[]} expectedAnswers — нормализованные правильные ответы
 * @property {string|null} userAnswer — то что ввёл/выбрал пользователь
 * @property {string|null} selectedOption — для MC: выбранный вариант (текст)
 * @property {string|null} correctOption — для MC: правильный вариант (текст)
 * @property {string|null} contextSentence
 * @property {string|null} contextTranslation
 * @property {number} mistakes
 * @property {boolean} hintUsed
 * @property {boolean|null} firstAttemptCorrect
 * @property {object} [modeSpecific] — дополнительные данные по режиму
 */

// ---------------------------------------------------------------------------
// Typing mode
// ---------------------------------------------------------------------------

/**
 * @param {object} word — словарное слово
 * @param {string[]} acceptedAnswers — нормализованные допустимые ответы
 * @param {string} userAnswer — введённый текст (уже нормализованный)
 * @param {number} mistakes
 * @param {boolean} hintUsed
 * @param {boolean|null} firstAttemptCorrect
 * @param {string} [displayCategory]
 * @param {string} [displayQuestion]
 * @returns {AIAttemptContext}
 */
export function adaptTypingContext({
  word,
  acceptedAnswers,
  userAnswer,
  mistakes,
  hintUsed,
  firstAttemptCorrect,
  displayCategory,
  displayQuestion,
  incorrectAttempts = [],
}) {
  const promptText = displayQuestion
    ? `${displayCategory || 'Слово'}: ${displayQuestion}`
    : `Введите японское слово: ${word?.translation || ''}`;

  return {
    prompt: promptText,
    instruction: 'Введите ответ на японском',
    expectedAnswers: Array.isArray(acceptedAnswers) ? acceptedAnswers.slice(0, 20) : [],
    userAnswer: userAnswer || null,
    selectedOption: null,
    correctOption: acceptedAnswers?.[0] || null,
    contextSentence: null,
    contextTranslation: null,
    incorrectAttempts: Array.isArray(incorrectAttempts) ? incorrectAttempts : [],
    mistakes: Number(mistakes) || 0,
    hintUsed: Boolean(hintUsed),
    firstAttemptCorrect: firstAttemptCorrect ?? null,
  };
}

// ---------------------------------------------------------------------------
// Multiple Choice / Reverse Multiple Choice / Context Sentence
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {AIAttemptContext}
 */
export function adaptMultipleChoiceContext({
  word: _word,
  displayQuestion,
  selectedText,
  correctText,
  mode,
  mistakes,
  firstAttemptCorrect,
  contextSentence,
  contextTranslation,
  incorrectAttempts = [],
}) {
  const isReverse = mode === 'reverse-multiple-choice';
  const direction = isReverse ? 'Japanese → Russian' : 'Russian → Japanese';

  return {
    prompt: String(displayQuestion || ''),
    instruction: isReverse ? 'Выберите правильный перевод' : 'Выберите правильное слово',
    expectedAnswers: correctText ? [correctText] : [],
    userAnswer: null,
    selectedOption: selectedText || null,
    correctOption: correctText || null,
    contextSentence: contextSentence || null,
    contextTranslation: contextTranslation || null,
    incorrectAttempts: Array.isArray(incorrectAttempts) ? incorrectAttempts : [],
    mistakes: Number(mistakes) || 0,
    hintUsed: false,
    firstAttemptCorrect: firstAttemptCorrect ?? null,
    modeSpecific: { direction },
  };
}

// ---------------------------------------------------------------------------
// Particle Quiz
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {AIAttemptContext}
 */
export function adaptParticleQuizContext({
  quizData,
  selectedParticle,
  mistakes,
  firstAttemptCorrect,
  localParticleRule,
  incorrectAttempts = [],
}) {
  const sentence = quizData?.sentence || '';
  // Заменяем [_] на пустой слот для AI-контекста
  const sentenceWithSlot = sentence.replace(/\[\s*_\s*\]/g, '___');

  return {
    prompt: `Выберите частицу: ${sentenceWithSlot}`,
    instruction: quizData?.russianHint || null,
    expectedAnswers: quizData?.correctParticle ? [quizData.correctParticle] : [],
    userAnswer: null,
    selectedOption: selectedParticle || null,
    correctOption: quizData?.correctParticle || null,
    contextSentence: sentenceWithSlot || null,
    contextTranslation: quizData?.russianHint || null,
    incorrectAttempts: Array.isArray(incorrectAttempts) ? incorrectAttempts : [],
    mistakes: Number(mistakes) || 0,
    hintUsed: false,
    firstAttemptCorrect: firstAttemptCorrect ?? null,
    modeSpecific: {
      fullSentence: sentenceWithSlot,
      localRule: localParticleRule || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Sentence Building
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {AIAttemptContext}
 */
export function adaptSentenceBuildingContext({
  quizData,
  mistakes,
  firstAttemptCorrect,
  incorrectAttempts = [],
}) {
  const correctSentence = (quizData?.correctWords || []).join(' ');
  const userSentence = (quizData?.userSentence || []).join(' ');

  return {
    prompt: `Составьте предложение: ${quizData?.russianHint || ''}`,
    instruction: 'Составьте предложение из слов в правильном порядке',
    expectedAnswers: correctSentence ? [correctSentence] : [],
    userAnswer: userSentence || null,
    selectedOption: null,
    correctOption: correctSentence || null,
    contextSentence: null,
    contextTranslation: quizData?.russianHint || null,
    incorrectAttempts: Array.isArray(incorrectAttempts) ? incorrectAttempts : [],
    mistakes: Number(mistakes) || 0,
    hintUsed: Number(mistakes) > 0,
    firstAttemptCorrect: firstAttemptCorrect ?? null,
    modeSpecific: {
      sourceBlocks: quizData?.shuffledWords || [],
      userOrder: quizData?.userSentence || [],
      correctOrder: quizData?.correctWords || [],
    },
  };
}

// ---------------------------------------------------------------------------
// Context Production
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {AIAttemptContext}
 */
export function adaptContextProductionContext({
  task,
  userAnswer,
  mistakes,
  hintUsed,
  firstAttemptCorrect,
  incorrectAttempts = [],
}) {
  if (!task) {
    // Legacy card без структурированного задания — не создавать snapshot
    return null;
  }

  return {
    prompt: task.prompt || null,
    instruction: task.meaningCue || null,
    expectedAnswers: Array.isArray(task.acceptedAnswers) ? task.acceptedAnswers.slice(0, 20) : [],
    userAnswer: userAnswer || null,
    selectedOption: null,
    correctOption: task.acceptedAnswers?.[0] || null,
    contextSentence: null,
    contextTranslation: null,
    incorrectAttempts: Array.isArray(incorrectAttempts) ? incorrectAttempts : [],
    mistakes: Number(mistakes) || 0,
    hintUsed: Boolean(hintUsed),
    firstAttemptCorrect: firstAttemptCorrect ?? null,
    modeSpecific: {
      requiredForm: task.requiredForm || null,
      explanation: task.explanation || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {AIAttemptContext}
 *
 * НЕ передаёт изображение canvas или stroke data.
 */
export function adaptDrawingContext({
  kanji,
  reading,
  translation,
  totalMistakes,
  hintUsed,
  incorrectAttempts = [],
}) {
  return {
    prompt: `По переводу «${translation || ''}»${reading ? ` (чтение: ${reading})` : ''} напишите кандзи`,
    instruction: `Чтение: ${reading || ''}, значение: ${translation || ''}`,
    expectedAnswers: kanji ? [kanji] : [],
    userAnswer: null, // Canvas не передаётся
    selectedOption: null,
    correctOption: kanji || null,
    contextSentence: null,
    contextTranslation: null,
    incorrectAttempts: Array.isArray(incorrectAttempts) ? incorrectAttempts : [],
    mistakes: Number(totalMistakes) || 0,
    hintUsed: Boolean(hintUsed),
    firstAttemptCorrect: totalMistakes === 0 ? true : null,
    modeSpecific: {
      targetKanji: kanji,
      completedKanji: totalMistakes === 0,
    },
  };
}

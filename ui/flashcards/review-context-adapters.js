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
    mistakes: Number(mistakes) || 0,
    hintUsed: Boolean(hintUsed),
    firstAttemptCorrect: firstAttemptCorrect ?? null,
  };
}

// ---------------------------------------------------------------------------
// Multiple Choice / Reverse Multiple Choice / Context Sentence
// ---------------------------------------------------------------------------

/**
 * @param {object} word — целевое слово
 * @param {string} displayQuestion — текст вопроса
 * @param {string} selectedText — текст выбранного варианта
 * @param {string} correctText — текст правильного варианта
 * @param {string} mode — режим (multiple-choice | reverse-multiple-choice | context-sentence)
 * @param {number} mistakes
 * @param {boolean|null} firstAttemptCorrect
 * @param {string|null} contextSentence
 * @param {string|null} contextTranslation
 * @returns {AIAttemptContext}
 */
export function adaptMultipleChoiceContext({
  word,
  displayQuestion,
  selectedText,
  correctText,
  mode,
  mistakes,
  firstAttemptCorrect,
  contextSentence,
  contextTranslation,
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
 * @param {object} quizData — { sentence, correctParticle, options, russianHint }
 * @param {string} selectedParticle
 * @param {number} mistakes
 * @param {boolean|null} firstAttemptCorrect
 * @param {string|null} localParticleRule — краткое правило если известно
 * @returns {AIAttemptContext}
 */
export function adaptParticleQuizContext({
  quizData,
  selectedParticle,
  mistakes,
  firstAttemptCorrect,
  localParticleRule,
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
 * @param {object} quizData — { correctWords: string[], userSentence: string[], russianHint: string }
 * @param {number} mistakes
 * @param {boolean|null} firstAttemptCorrect
 * @returns {AIAttemptContext}
 */
export function adaptSentenceBuildingContext({ quizData, mistakes, firstAttemptCorrect }) {
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
 * @param {object} task — production task { prompt, meaningCue, requiredForm, acceptedAnswers, hint }
 * @param {string} userAnswer — введённый текст (нормализованный)
 * @param {number} mistakes
 * @param {boolean} hintUsed
 * @param {boolean|null} firstAttemptCorrect
 * @returns {AIAttemptContext}
 */
export function adaptContextProductionContext({
  task,
  userAnswer,
  mistakes,
  hintUsed,
  firstAttemptCorrect,
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
 * @param {string} kanji — целевой кандзи
 * @param {string} reading — чтение
 * @param {string} translation — перевод
 * @param {number} totalMistakes — всего ошибок при рисовании
 * @param {boolean} hintUsed
 * @returns {AIAttemptContext}
 *
 * НЕ передаёт изображение canvas или stroke data.
 */
export function adaptDrawingContext({ kanji, reading, translation, totalMistakes, hintUsed }) {
  return {
    prompt: `Напишите кандзи: ${kanji}`,
    instruction: `Чтение: ${reading || ''}, значение: ${translation || ''}`,
    expectedAnswers: kanji ? [kanji] : [],
    userAnswer: null, // Canvas не передаётся
    selectedOption: null,
    correctOption: kanji || null,
    contextSentence: null,
    contextTranslation: null,
    mistakes: Number(totalMistakes) || 0,
    hintUsed: Boolean(hintUsed),
    firstAttemptCorrect: totalMistakes === 0 ? true : null,
    modeSpecific: {
      targetKanji: kanji,
      // Нет canvas, нет strokes — только счётчик ошибок
    },
  };
}

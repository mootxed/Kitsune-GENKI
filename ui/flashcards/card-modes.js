// ui/flashcards/card-modes.js - Рендеринг различных режимов практики карточек

import { selectProductionTask } from '../../src/task-selection.js';
import { evaluateProductionAnswer } from '../../src/production-context.js';
import { $, $$ } from '../../src/utils.js';
import { wordById, isWordUnlocked, getUnlockedParticles } from '../../src/srs-helpers.js';
import { SRS } from '../../srs.js';
import {
  hiraganaToKatakana,
  normalizeKanaAnswer,
  typingCapability,
} from '../../src/typing-capability.js';
import {
  CURATED_PARTICLE_SENTENCES,
  SMART_PARTICLE_TEMPLATES,
  SLOT_CATEGORIES,
  FORBIDDEN_CATEGORIES,
} from '../../src/particle-templates.js';
import {
  CARD_MODES,
  shuffleArray,
  buildMultipleChoiceOptions,
  generateWordContext,
} from './mode-selector.js';
import { startReviewTiming, markReviewAnswered, submitReview } from './review-fsrs.js';
import {
  flashQueue,
  flashIdx,
  setFlashIdx,
  setFlashRevealed,
  flashCtx,
  sessionManager,
  setSessionManager,
} from './state.js';

// Конвертер Хирагана → Катакана
const HIRAGANA_TO_KATAKANA = {
  あ: 'ア',
  い: 'イ',
  う: 'ウ',
  え: 'エ',
  お: 'オ',
  か: 'カ',
  き: 'キ',
  く: 'ク',
  け: 'ケ',
  こ: 'コ',
  さ: 'サ',
  し: 'シ',
  す: 'ス',
  せ: 'セ',
  そ: 'ソ',
  た: 'タ',
  ち: 'チ',
  つ: 'ツ',
  て: 'テ',
  と: 'ト',
  な: 'ナ',
  に: 'ニ',
  ぬ: 'ヌ',
  ね: 'ネ',
  の: 'ノ',
  は: 'ハ',
  ひ: 'ヒ',
  ふ: 'フ',
  へ: 'ヘ',
  ほ: 'ホ',
  ま: 'マ',
  み: 'ミ',
  む: 'ム',
  め: 'メ',
  も: 'モ',
  や: 'ヤ',
  ゆ: 'ユ',
  よ: 'ヨ',
  ら: 'ラ',
  り: 'リ',
  る: 'ル',
  れ: 'レ',
  ろ: 'ロ',
  わ: 'ワ',
  を: 'ヲ',
  ん: 'ン',
  が: 'ガ',
  ぎ: 'ギ',
  ぐ: 'グ',
  げ: 'ゲ',
  ご: 'ゴ',
  ざ: 'ザ',
  じ: 'ジ',
  ず: 'ズ',
  ぜ: 'ゼ',
  ぞ: 'ゾ',
  だ: 'ダ',
  ぢ: 'ヂ',
  づ: 'ヅ',
  で: 'デ',
  ど: 'ド',
  ば: 'バ',
  び: 'ビ',
  ぶ: 'ブ',
  べ: 'ベ',
  ぼ: 'ボ',
  ぱ: 'パ',
  ぴ: 'ピ',
  ぷ: 'プ',
  ぺ: 'ペ',
  ぽ: 'ポ',
  ゃ: 'ャ',
  ゅ: 'ュ',
  ょ: 'ョ',
  っ: 'ッ',
  ー: 'ー',
};

export function getProgressText() {
  if (sessionManager) {
    const stats = sessionManager.getStats();
    const attempted = stats.attempted !== undefined ? stats.attempted : stats.reviewed;
    const current = Math.min(attempted + 1, stats.total);
    return `${current} / ${stats.total}`;
  }
  return `${flashIdx + 1} / ${flashQueue.length}`;
}

export function generateSrsKeyboard(acceptedAnswers) {
  const correctLetters = [...new Set(acceptedAnswers.flatMap((answer) => [...answer]))];
  const allKana = [...new Set([...Object.keys(HIRAGANA_TO_KATAKANA), ...correctLetters])];

  const limitedCorrect = correctLetters.slice(0, 15);

  const distractors = [];
  const targetTotal = Math.max(8, limitedCorrect.length);
  const distractorCount = targetTotal - limitedCorrect.length;

  while (distractors.length < distractorCount) {
    const randomKana = allKana[Math.floor(Math.random() * allKana.length)];
    if (!correctLetters.includes(randomKana) && !distractors.includes(randomKana)) {
      distractors.push(randomKana);
    }
  }

  return shuffleArray([...limitedCorrect, ...distractors]).slice(0, targetTotal);
}

export function generateParticleQuiz(particle, lessonData, state, LESSONS) {
  const curatedSentences = CURATED_PARTICLE_SENTENCES[particle];
  if (curatedSentences && curatedSentences.length > 0) {
    const example = curatedSentences[Math.floor(Math.random() * curatedSentences.length)];

    let unlockedParticles = getUnlockedParticles(state.chapters, LESSONS);
    unlockedParticles = unlockedParticles.filter((p) => p !== particle);

    if (unlockedParticles.length < 3) {
      const basicParticles = ['は', 'の', 'に', 'で', 'を', 'が', 'と', 'も', 'か'];
      unlockedParticles = basicParticles.filter((p) => p !== particle);
    }

    const distractors = shuffleArray(unlockedParticles).slice(0, 3);
    const options = shuffleArray([example.correct, ...distractors]);

    return {
      sentence: example.sentence,
      correctParticle: example.correct,
      options,
      russianHint: example.hint,
      words: [],
    };
  }

  const templateDef = SMART_PARTICLE_TEMPLATES[particle];
  if (!templateDef) {
    console.warn(`[particle-quiz] Нет шаблона для частицы: ${particle}`);
    return null;
  }

  const { slots, template, hint, prohibitedCombinations } = templateDef;

  const allWords = LESSONS.flatMap((l) => l.words || l.vocabulary || []).filter((w) =>
    isWordUnlocked(w.id, state.chapters)
  );

  const findWordForSlot = (slotDef, excludeIds = [], previousWords = []) => {
    const roles = Array.isArray(slotDef) ? slotDef : [slotDef];
    for (const role of roles) {
      const categories = SLOT_CATEGORIES[role] || SLOT_CATEGORIES.noun;
      const candidates = allWords.filter(
        (w) =>
          categories.includes(w.category) &&
          !excludeIds.includes(w.id) &&
          !FORBIDDEN_CATEGORIES.includes(w.category)
      );

      const validCandidates = candidates.filter((candidate) => {
        if (previousWords.length === 0) return true;
        return previousWords.every(
          (prevWord) => !prohibitedCombinations || !prohibitedCombinations(prevWord, candidate)
        );
      });

      if (validCandidates.length > 0) {
        return validCandidates[Math.floor(Math.random() * validCandidates.length)];
      }
    }
    return null;
  };

  const selectedWords = [];
  for (const slot of slots) {
    const word = findWordForSlot(
      slot,
      selectedWords.map((w) => w.id),
      selectedWords
    );

    if (!word) {
      if (curatedSentences && curatedSentences.length > 0) {
        const example = curatedSentences[Math.floor(Math.random() * curatedSentences.length)];
        let unlockedParticles = getUnlockedParticles(state.chapters, LESSONS);
        unlockedParticles = unlockedParticles.filter((p) => p !== particle);
        if (unlockedParticles.length < 3) {
          const basicParticles = ['は', 'の', 'に', 'で', 'を', 'が', 'と', 'も', 'か'];
          unlockedParticles = basicParticles.filter((p) => p !== particle);
        }
        const distractors = shuffleArray(unlockedParticles).slice(0, 3);
        const options = shuffleArray([example.correct, ...distractors]);
        return {
          sentence: example.sentence,
          correctParticle: example.correct,
          options,
          russianHint: example.hint,
          words: [],
        };
      }
      return null;
    }
    selectedWords.push(word);
  }

  const sentence = template(...selectedWords);
  const russianHint = hint(...selectedWords);

  let unlockedParticles = getUnlockedParticles(state.chapters, LESSONS);
  unlockedParticles = unlockedParticles.filter((p) => p !== particle);

  if (unlockedParticles.length < 3) {
    const basicParticles = ['は', 'の', 'に', 'で', 'を', 'が', 'と', 'も', 'か'];
    unlockedParticles = basicParticles.filter((p) => p !== particle);
  }

  const distractors = shuffleArray(unlockedParticles).slice(0, 3);
  const options = shuffleArray([particle, ...distractors]);

  return {
    sentence,
    correctParticle: particle,
    options,
    russianHint,
    words: selectedWords,
  };
}

export function renderTypingMode(word, state, dependencies, modeConfig = {}, renderFlashFn) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, nav, markActivity } =
    dependencies;

  const body = $('#srs-body');
  const displayWriting = word.writing;
  const displayTranslation = word.translation;
  const displayCategory = modeConfig.category || word.category || 'Слово';
  const displayQuestion = modeConfig.question || displayTranslation;
  const displayHint = modeConfig.hint || 'Введите слово на японском';
  const typingMode = modeConfig.mode || CARD_MODES.TYPING;

  let isChecked = false;
  let typingMistakes = 0;

  const capability = typingCapability(word, modeConfig.acceptedAnswers || null);
  if (!capability.canType) {
    throw new Error(`[Typing] Для ${word.id || displayWriting} нет проходимого ответа`);
  }
  const acceptedAnswers = capability.acceptedAnswers;

  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  const keyboardLetters = generateSrsKeyboard(acceptedAnswers);

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="typing-mode-container">
        <div class="typing-prompt">
          <div class="flash-cat">${displayCategory}</div>
          <p class="typing-kanji">${displayQuestion}</p>
          <p class="typing-hint">${displayHint}</p>
        </div>
        <input 
          type="text" 
          class="typing-input" 
          id="typing-input"
          autocomplete="off"
          placeholder="например: だいがく"
        />
        <div class="srs-keyboard-container" id="srs-keyboard">
          ${keyboardLetters
            .map(
              (letter) => `
            <button class="srs-kana-key" data-letter="${letter}">
              <span class="key-hira">${letter}</span>
              <span class="key-kata">${hiraganaToKatakana(letter)}</span>
            </button>
          `
            )
            .join('')}
        </div>
        <div class="srs-keyboard-actions">
          <button class="srs-keyboard-backspace" id="srs-backspace">⌫ Стереть</button>
          <button class="btn-primary typing-check" id="typing-check">Проверить</button>
        </div>
        <div id="typing-hint-message" class="typing-hint hidden" style="color: var(--orange); font-weight: 700; margin-top: 8px;"></div>
      </div>
    </div>`;

  const reviewCardId = (sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx])?.id;
  startReviewTiming(reviewCardId || word.id, typingMode);

  const input = $('#typing-input');
  const checkBtn = $('#typing-check');
  const hintMessage = $('#typing-hint-message');
  const backspaceBtn = $('#srs-backspace');

  $$('.srs-kana-key').forEach((btn) => {
    btn.onclick = () => {
      if (isChecked) return;
      const letter = btn.dataset.letter;
      input.value += letter;
    };
  });

  if (backspaceBtn) {
    backspaceBtn.onclick = () => {
      if (isChecked) return;
      input.value = input.value.slice(0, -1);
    };
  }

  const handleCheck = () => {
    if (isChecked) return;

    const userAnswer = normalizeKanaAnswer(input.value);
    const isCorrect = acceptedAnswers.some((answer) => answer === userAnswer);

    if (isCorrect) {
      input.classList.add('correct');
      input.classList.remove('incorrect', 'shake-error');

      const quality = SRS.qualityFromMistakes(typingMistakes);
      markReviewAnswered(reviewCardId || word.id);

      setTimeout(() => {
        handleRating(quality);
      }, 500);
    } else {
      typingMistakes++;

      if (typingMistakes === 1) {
        input.classList.add('shake-error', 'incorrect');
        input.classList.remove('correct');

        setTimeout(() => {
          input.classList.remove('shake-error');
        }, 500);

        hintMessage.textContent = `Подсказка: начинается на "${acceptedAnswers[0][0]}"`;
        hintMessage.classList.remove('hidden');

        isChecked = false;
      } else {
        input.classList.add('incorrect');
        input.classList.remove('correct', 'shake-error');
        input.disabled = true;
        checkBtn.disabled = true;

        const allAnswers = acceptedAnswers.join(' или ');
        hintMessage.innerHTML = `<p style="color: var(--danger); margin: 8px 0;">❌ Неправильно</p><p style="margin: 4px 0;">Правильный ответ: <strong style="color: var(--primary);">${allAnswers}</strong></p>`;
        hintMessage.classList.remove('hidden');
        markReviewAnswered(reviewCardId || word.id);

        setTimeout(() => {
          handleRating(SRS.Quality.Again);
        }, 1000);
      }
    }

    isChecked = typingMistakes >= 2 || isCorrect;
  };

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    const result = submitReview(card, quality, state, {
      mistakes: typingMistakes,
      hintUsed: typingMistakes > 0,
    });
    if (!sessionManager) setFlashIdx(flashIdx + 1);

    if (result?.xpEligible) {
      appAddXP(XP_CARD);
    }
    save(true);
    markActivity();
    setFlashRevealed(false);
    if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    updateSrsBadge();
  };

  if (checkBtn) {
    checkBtn.onclick = handleCheck;
  }

  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleCheck();
      }
    });
  }

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';

      const srsHeader = document.querySelector('#screen-srs .app-header');
      if (srsHeader) srsHeader.style.display = '';

      const tabsContainer = document.getElementById('srs-tabs-container');
      if (tabsContainer) tabsContainer.classList.remove('hidden');

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              setSessionManager(null);
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      setSessionManager(null);
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

export function renderContextSentenceMode(word, state, dependencies, renderFlashFn) {
  const context = generateWordContext(word);
  if (!context) {
    renderMultipleChoiceMode(word, state, dependencies, {}, renderFlashFn);
    return;
  }

  renderMultipleChoiceMode(
    word,
    state,
    dependencies,
    {
      mode: CARD_MODES.CONTEXT_SENTENCE,
      category: 'Контекст слова',
      question: context.prompt,
      hint: context.meaningCue,
      questionClass: 'context-sentence',
    },
    renderFlashFn
  );
}

function formatRequiredForm(rf) {
  if (!rf) return '';
  if (typeof rf === 'string') return rf;
  const parts = [];
  if (rf.politeness === 'polite') parts.push('Вежливая');
  else if (rf.politeness === 'plain') parts.push('Простая');

  if (rf.polarity === 'affirmative') parts.push('Утверждение');
  else if (rf.polarity === 'negative') parts.push('Отрицание');
  else if (rf.polarity === 'interrogative') parts.push('Вопрос');

  if (rf.tense === 'past') parts.push('Прошедшее');
  else if (rf.tense === 'non-past') parts.push('Наст./Буд.');

  if (rf.type === 'copula') parts.push('Связка (です)');
  else if (rf.type === 'verb') parts.push('Глагол');
  else if (rf.type === 'i-adj') parts.push('い-прил.');
  else if (rf.type === 'na-adj') parts.push('な-прил.');

  return parts.join(' · ') || JSON.stringify(rf);
}

export function renderContextProductionMode(word, state, dependencies, renderFlashFn) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, nav, markActivity } =
    dependencies;

  const currentCard = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];
  const task = selectProductionTask(word, currentCard, state.reviewEvents || []);

  if (!task) {
    console.warn(`[Production] Для ${word.id} нет структурированного задания`);
    if (sessionManager) {
      sessionManager.skipCard(currentCard?.id);
    } else {
      setFlashIdx(flashIdx + 1);
    }
    if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    return;
  }

  const body = $('#srs-body');
  let isChecked = false;
  let typingMistakes = 0;
  let hintUsed = false;

  const acceptedAnswers = task.acceptedAnswers;
  const requiredFormLabel = formatRequiredForm(task.requiredForm);

  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  const keyboardLetters = generateSrsKeyboard(acceptedAnswers);

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="typing-mode-container cp-mode-container">
        <div class="typing-prompt cp-prompt-block">
          <div class="flash-cat">Активное воспроизведение</div>
          <p class="cp-prompt">${task.prompt}</p>
          ${task.meaningCue ? `<p class="cp-meaning-cue">${task.meaningCue}</p>` : ''}
          ${requiredFormLabel ? `<div class="cp-required-form-badge">Форма: <strong>${requiredFormLabel}</strong></div>` : ''}
        </div>
        <input 
          type="text" 
          class="typing-input" 
          id="typing-input"
          autocomplete="off"
          placeholder="Введите фразу по-японски..."
        />
        <div class="srs-keyboard-container" id="srs-keyboard">
          ${keyboardLetters
            .map(
              (letter) => `
            <button class="srs-kana-key" data-letter="${letter}">
              <span class="key-hira">${letter}</span>
              <span class="key-kata">${hiraganaToKatakana(letter)}</span>
            </button>
          `
            )
            .join('')}
        </div>
        <div class="srs-keyboard-actions">
          <button class="srs-keyboard-backspace" id="srs-backspace">⌫ Стереть</button>
          <button class="btn-primary typing-check" id="typing-check">Проверить</button>
        </div>
        <div id="typing-hint-message" class="typing-hint hidden" style="margin-top: 8px;"></div>
      </div>
    </div>`;

  const reviewCardId = (sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx])?.id;
  startReviewTiming(reviewCardId || word.id, CARD_MODES.CONTEXT_PRODUCTION);

  const input = $('#typing-input');
  const checkBtn = $('#typing-check');
  const hintMessage = $('#typing-hint-message');
  const backspaceBtn = $('#srs-backspace');

  $$('.srs-kana-key').forEach((btn) => {
    btn.onclick = () => {
      if (isChecked) return;
      input.value += btn.dataset.letter;
    };
  });

  if (backspaceBtn) {
    backspaceBtn.onclick = () => {
      if (isChecked) return;
      input.value = input.value.slice(0, -1);
    };
  }

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    const result = submitReview(card, quality, state, {
      mode: CARD_MODES.CONTEXT_PRODUCTION,
      taskId: task.id,
      mistakes: typingMistakes,
      hintUsed,
    });
    if (!sessionManager) setFlashIdx(flashIdx + 1);

    if (result?.xpEligible) {
      appAddXP(XP_CARD);
    }
    save(true);
    markActivity();
    setFlashRevealed(false);
    if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    updateSrsBadge();
  };

  const handleCheck = () => {
    if (isChecked) return;

    const evaluation = evaluateProductionAnswer(input.value, task);

    if (evaluation.correct) {
      input.classList.add('correct');
      input.classList.remove('incorrect', 'shake-error');
      isChecked = true;

      const quality = typingMistakes === 0 && !hintUsed ? SRS.Quality.Good : SRS.Quality.Again;
      markReviewAnswered(reviewCardId || word.id);

      setTimeout(() => {
        handleRating(quality);
      }, 500);
    } else {
      typingMistakes++;

      if (typingMistakes === 1) {
        input.classList.add('shake-error', 'incorrect');
        input.classList.remove('correct');

        setTimeout(() => {
          input.classList.remove('shake-error');
        }, 500);

        hintUsed = true;
        const hintText = task.hint || `Начинается на "${acceptedAnswers[0][0]}"`;
        hintMessage.textContent = `💡 Подсказка: ${hintText}`;
        hintMessage.style.color = 'var(--orange)';
        hintMessage.classList.remove('hidden');

        isChecked = false;
      } else {
        input.classList.add('incorrect');
        input.classList.remove('correct', 'shake-error');
        input.disabled = true;
        if (checkBtn) checkBtn.disabled = true;
        isChecked = true;

        const allAnswers = acceptedAnswers.join(' / ');
        const expText = task.explanation
          ? `<p style="margin-top: 4px; font-size: 0.9em; color: var(--text-muted);">${task.explanation}</p>`
          : '';
        hintMessage.innerHTML = `<p style="color: var(--danger); margin: 8px 0;">❌ Неправильно</p><p style="margin: 4px 0;">Правильный ответ: <strong style="color: var(--primary);">${allAnswers}</strong></p>${expText}`;
        hintMessage.classList.remove('hidden');
        markReviewAnswered(reviewCardId || word.id);

        setTimeout(() => {
          handleRating(SRS.Quality.Again);
        }, 1200);
      }
    }
  };

  if (checkBtn) checkBtn.onclick = handleCheck;

  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleCheck();
      }
    });
  }

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';

      const srsHeader = document.querySelector('#screen-srs .app-header');
      if (srsHeader) srsHeader.style.display = '';

      const tabsContainer = document.getElementById('srs-tabs-container');
      if (tabsContainer) tabsContainer.classList.remove('hidden');

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              setSessionManager(null);
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      setSessionManager(null);
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

export function renderMultipleChoiceMode(
  word,
  state,
  dependencies,
  modeConfig = {},
  renderFlashFn
) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    LESSONS,
  } = dependencies;

  const body = $('#srs-body');
  const displayKanji = word.kanji || word.writing;
  const displayTranslation = word.translation;
  const displayCategory = modeConfig.category || word.category || 'Слово';
  const displayQuestion = modeConfig.question || displayTranslation;
  const displayHint = modeConfig.hint || 'Выберите правильное слово';
  const questionClass = modeConfig.questionClass || '';
  const optionLabel = modeConfig.optionLabel || ((option) => option.kanji || option.writing);

  let mistakeCount = 0;

  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  const allWords = LESSONS.flatMap((l) => l.words || []);
  const options = buildMultipleChoiceOptions(word, allWords, optionLabel, {
    isEligible: (candidate) => isWordUnlocked(candidate.id, state.chapters),
  });

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="quiz-mode-container">
        <div class="quiz-prompt">
          <div class="flash-cat">${displayCategory}</div>
          <p class="quiz-question ${questionClass}">${displayQuestion}</p>
          <p class="quiz-hint">${displayHint}</p>
        </div>
        <div class="quiz-options-grid">
          ${options
            .map(
              (opt) => `
            <button class="quiz-option-btn" data-word-id="${opt.id}">
              ${optionLabel(opt)}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    </div>`;

  const reviewCardId = (sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx])?.id;
  startReviewTiming(reviewCardId || word.id, modeConfig.mode || CARD_MODES.MULTIPLE_CHOICE);

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    const result = submitReview(card, quality, state, {
      mistakes: mistakeCount,
      hintUsed: false,
    });
    if (!sessionManager) setFlashIdx(flashIdx + 1);

    if (result?.xpEligible) {
      appAddXP(XP_CARD);
    }
    save(true);
    markActivity();
    setFlashRevealed(false);
    if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    updateSrsBadge();
  };

  $$('.quiz-option-btn').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;

      const selectedWordId = btn.dataset.wordId;
      const isCorrect = selectedWordId === word.id;

      if (isCorrect) {
        btn.classList.add('correct');
        btn.disabled = true;

        const quality = SRS.qualityFromMistakes(mistakeCount);
        markReviewAnswered(reviewCardId || word.id);

        setTimeout(() => {
          handleRating(quality);
        }, 600);
      } else {
        btn.classList.add('incorrect');
        btn.disabled = true;
        mistakeCount++;

        if (mistakeCount >= 2) {
          $$('.quiz-option-btn').forEach((b) => (b.disabled = true));

          $$('.quiz-option-btn').forEach((b) => {
            if (b.dataset.wordId === word.id) {
              b.classList.add('correct');
            }
          });
          markReviewAnswered(reviewCardId || word.id);

          setTimeout(() => {
            handleRating(SRS.Quality.Again);
          }, 1000);
        }
      }
    };
  });

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';

      const srsHeader = document.querySelector('#screen-srs .app-header');
      if (srsHeader) srsHeader.style.display = '';

      const tabsContainer = document.getElementById('srs-tabs-container');
      if (tabsContainer) tabsContainer.classList.remove('hidden');

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              setSessionManager(null);
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      setSessionManager(null);
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

export function renderSentenceBuilding(particleCard, state, dependencies, renderFlashFn) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    LESSONS,
  } = dependencies;

  const body = $('#srs-body');
  let mistakeCount = 0;
  let userSentence = [];

  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  const fallbackToMultipleChoice = (reason) => {
    console.warn(`[sentence-building] ${reason}, fallback на multiple choice`);
    const word = wordById(particleCard.id, LESSONS);
    if (word) {
      renderMultipleChoiceMode(word, state, dependencies, {}, renderFlashFn);
    } else {
      if (sessionManager) {
        submitReview(particleCard, SRS.Quality.Good, state, {
          mode: 'system-fallback',
          responseTimeMs: null,
        });
      } else {
        setFlashIdx(flashIdx + 1);
      }
      if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    }
  };

  const lessonData = LESSONS.find((l) => l.id === particleCard.lessonId);
  if (!lessonData || !lessonData.particles || lessonData.particles.length === 0) {
    fallbackToMultipleChoice(`Нет частиц для урока ${particleCard.lessonId}`);
    return;
  }

  const particle = lessonData.particles[Math.floor(Math.random() * lessonData.particles.length)];
  const quizData = generateParticleQuiz(particle, lessonData, state, LESSONS);

  if (!quizData) {
    fallbackToMultipleChoice('Не удалось сгенерировать предложение');
    return;
  }

  const { sentence, correctParticle, russianHint } = quizData;

  const correctWords = sentence
    .replace(/\s*\[\s*_\s*\]\s*/g, ` ${correctParticle} `)
    .split(/\s+/)
    .filter(Boolean);

  const shuffledWords = shuffleArray([...correctWords]);

  const updateUI = () => {
    const userArea = $('#sentence-user-area');
    const poolArea = $('#sentence-word-pool');

    if (userArea) {
      userArea.innerHTML =
        userSentence.length === 0
          ? '<span class="sentence-placeholder">Нажмите на слова ниже</span>'
          : userSentence
              .map(
                (word, idx) =>
                  `<button class="word-chip selected" data-index="${idx}">${word}</button>`
              )
              .join('');
    }

    if (poolArea) {
      const remainingWords = shuffledWords.filter((w) => !userSentence.includes(w));
      poolArea.innerHTML =
        remainingWords.length === 0
          ? '<span class="sentence-placeholder">Все слова использованы</span>'
          : remainingWords
              .map((word) => `<button class="word-chip available">${word}</button>`)
              .join('');
    }

    $$('#sentence-word-pool .word-chip.available').forEach((chip) => {
      chip.onclick = () => {
        const word = chip.textContent;
        userSentence.push(word);
        updateUI();
      };
    });

    $$('#sentence-user-area .word-chip.selected').forEach((chip) => {
      chip.onclick = () => {
        const index = parseInt(chip.dataset.index);
        userSentence.splice(index, 1);
        updateUI();
      };
    });
  };

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="sentence-building-container">
        <div class="sentence-building-prompt">
          <div class="flash-cat">Составление предложения</div>
          <p class="sentence-building-hint">${russianHint}</p>
          <p class="sentence-building-instruction">Составьте предложение из слов ниже</p>
        </div>
        
        <div class="sentence-user-area" id="sentence-user-area">
          <span class="sentence-placeholder">Нажмите на слова ниже</span>
        </div>
        
        <div class="sentence-word-pool" id="sentence-word-pool"></div>
        
        <div class="sentence-building-actions">
          <button class="btn-secondary" id="sentence-clear-btn">Очистить</button>
          <button class="btn-primary" id="sentence-check-btn">Проверить</button>
        </div>
        
        <div id="sentence-feedback" class="sentence-feedback hidden"></div>
      </div>
    </div>`;

  startReviewTiming(particleCard.id, CARD_MODES.SENTENCE_BUILDING);

  updateUI();

  const clearBtn = $('#sentence-clear-btn');
  const checkBtn = $('#sentence-check-btn');
  const feedback = $('#sentence-feedback');

  if (clearBtn) {
    clearBtn.onclick = () => {
      userSentence = [];
      updateUI();
      if (feedback) {
        feedback.classList.add('hidden');
        feedback.textContent = '';
      }
    };
  }

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    const result = submitReview(card, quality, state, {
      mistakes: mistakeCount,
      hintUsed: mistakeCount > 0,
    });
    if (!sessionManager) setFlashIdx(flashIdx + 1);

    if (result?.xpEligible) {
      appAddXP(XP_CARD);
    }
    save(true);
    markActivity();
    setFlashRevealed(false);
    if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    updateSrsBadge();
  };

  if (checkBtn) {
    checkBtn.onclick = () => {
      if (userSentence.length === 0) {
        if (feedback) {
          feedback.textContent = '⚠️ Составьте предложение из слов';
          feedback.className = 'sentence-feedback warning';
          feedback.classList.remove('hidden');
        }
        return;
      }

      const userAnswer = userSentence.join(' ');
      const correctAnswer = correctWords.join(' ');
      const isCorrect = userAnswer === correctAnswer;

      if (isCorrect) {
        if (feedback) {
          feedback.innerHTML = '✅ Правильно!';
          feedback.className = 'sentence-feedback correct';
          feedback.classList.remove('hidden');
        }

        const quality = SRS.qualityFromMistakes(mistakeCount);
        markReviewAnswered(particleCard.id);
        setTimeout(() => handleRating(quality), 800);
      } else {
        mistakeCount++;

        if (mistakeCount === 1) {
          if (feedback) {
            feedback.innerHTML = `❌ Неправильно. Попробуйте ещё раз.<br><small>Подсказка: "${correctWords[0]}" — первое слово</small>`;
            feedback.className = 'sentence-feedback incorrect';
            feedback.classList.remove('hidden');
          }
        } else {
          if (feedback) {
            feedback.innerHTML = `❌ Неправильно.<br>Правильный порядок: <strong>${correctAnswer}</strong>`;
            feedback.className = 'sentence-feedback incorrect';
            feedback.classList.remove('hidden');
          }

          if (checkBtn) checkBtn.disabled = true;
          if (clearBtn) clearBtn.disabled = true;
          markReviewAnswered(particleCard.id);

          setTimeout(() => handleRating(SRS.Quality.Again), 2000);
        }
      }
    };
  }

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';

      const srsHeader = document.querySelector('#screen-srs .app-header');
      if (srsHeader) srsHeader.style.display = '';

      const tabsContainer = document.getElementById('srs-tabs-container');
      if (tabsContainer) tabsContainer.classList.remove('hidden');

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              setSessionManager(null);
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      setSessionManager(null);
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

export function renderParticleQuizMode(particleCard, state, dependencies, renderFlashFn) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    LESSONS,
  } = dependencies;

  const body = $('#srs-body');
  let mistakeCount = 0;

  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  const fallbackToMultipleChoice = (reason) => {
    console.warn(`[particle-quiz] ${reason}, fallback на multiple choice`);
    const word = wordById(particleCard.id, LESSONS);
    if (word) {
      renderMultipleChoiceMode(word, state, dependencies, {}, renderFlashFn);
    } else {
      if (sessionManager) {
        submitReview(particleCard, SRS.Quality.Good, state, {
          mode: 'system-fallback',
          responseTimeMs: null,
        });
      } else {
        setFlashIdx(flashIdx + 1);
      }
      if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    }
  };

  const lessonData = LESSONS.find((l) => l.id === particleCard.lessonId);
  if (!lessonData || !lessonData.particles || lessonData.particles.length === 0) {
    fallbackToMultipleChoice(`Нет частиц для урока ${particleCard.lessonId}`);
    return;
  }

  const particle = lessonData.particles[Math.floor(Math.random() * lessonData.particles.length)];
  const quizData = generateParticleQuiz(particle, lessonData, state, LESSONS);

  if (!quizData) {
    fallbackToMultipleChoice('Не удалось сгенерировать particle quiz');
    return;
  }

  const { sentence, correctParticle, options, russianHint } = quizData;

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${getProgressText()}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="particle-quiz-container">
        <div class="particle-quiz-prompt">
          <div class="flash-cat">Частица</div>
          <p class="particle-quiz-sentence">${sentence}</p>
          <p class="particle-quiz-hint">${russianHint}</p>
        </div>
        <div class="particle-quiz-options">
          ${options
            .map(
              (opt) => `
            <button class="quiz-option-btn" data-particle="${opt}">
              ${opt}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    </div>`;

  startReviewTiming(particleCard.id, CARD_MODES.PARTICLE_QUIZ);

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    const result = submitReview(card, quality, state, {
      mistakes: mistakeCount,
      hintUsed: mistakeCount > 0,
    });
    if (!sessionManager) setFlashIdx(flashIdx + 1);

    if (result?.xpEligible) {
      appAddXP(XP_CARD);
    }
    save(true);
    markActivity();
    setFlashRevealed(false);
    if (typeof renderFlashFn === 'function') renderFlashFn(state, dependencies);
    updateSrsBadge();
  };

  $$('.quiz-option-btn').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;

      const selectedParticle = btn.dataset.particle;
      const isCorrect = selectedParticle === correctParticle;

      if (isCorrect) {
        btn.classList.add('correct');
        btn.disabled = true;

        const quality = SRS.qualityFromMistakes(mistakeCount);
        markReviewAnswered(particleCard.id);

        setTimeout(() => {
          handleRating(quality);
        }, 600);
      } else {
        btn.classList.add('incorrect');
        btn.disabled = true;
        mistakeCount++;

        if (mistakeCount >= 2) {
          $$('.quiz-option-btn').forEach((b) => (b.disabled = true));

          $$('.quiz-option-btn').forEach((b) => {
            if (b.dataset.particle === correctParticle) {
              b.classList.add('correct');
            }
          });
          markReviewAnswered(particleCard.id);

          setTimeout(() => {
            handleRating(SRS.Quality.Again);
          }, 1000);
        }
      }
    };
  });

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';

      const srsHeader = document.querySelector('#screen-srs .app-header');
      if (srsHeader) srsHeader.style.display = '';

      const tabsContainer = document.getElementById('srs-tabs-container');
      if (tabsContainer) tabsContainer.classList.remove('hidden');

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              setSessionManager(null);
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      setSessionManager(null);
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

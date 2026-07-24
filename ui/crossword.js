/* ui/crossword.js — Crossword puzzle module */

import { $ } from '../src/utils.js';
import { LESSONS } from './home.js';
import { speakJapanese } from '../src/audio-helper.js';
import { showCompletionScreen } from './shared.js';
import {
  getAvailableMiniGameCandidates,
  getWeakCrosswordCandidates,
} from '../src/minigame-word-selectors.js';
import { selectMiniGameWords, recordGameSession } from '../src/minigame-word-rotation.js';

let activeCleanup = null;

export function cleanupCrossword() {
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }
}

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

function hiraganaToKatakana(text) {
  return text
    .split('')
    .map((char) => HIRAGANA_TO_KATAKANA[char] || char)
    .join('');
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Main entry point for Crossword route.
 * Shows Mode Selection screen before grid generation.
 */
export function renderCrossword(state, dependencies = {}) {
  cleanupCrossword();
  renderCrosswordModeSelection(state, dependencies);
}

/**
 * Renders the Mode Selection screen for Crossword.
 */
export function renderCrosswordModeSelection(state, dependencies = {}) {
  cleanupCrossword();

  const body = $('#crossword-body');
  if (!body) return;

  body.innerHTML = `
    <div class="cw-mode-container" data-testid="cw-mode-screen">
      <div class="cw-mode-header">
        <h2>Выберите режим кроссворда</h2>
        <p>Решайте кроссворд из всех доступных слов или оттачивайте сложные слова</p>
      </div>

      <div class="cw-mode-cards">
        <div class="cw-mode-card recommended" data-mode="normal" data-testid="cw-mode-card-normal" tabindex="0" role="button" aria-label="Все слова">
          <span class="cw-badge-recommended">★ Рекомендуется</span>
          <div class="cw-mode-icon">🧩</div>
          <div class="cw-mode-info">
            <h3>Все слова</h3>
            <p>Кроссворд из доступных вам слов</p>
          </div>
          <button class="cw-btn cw-btn-primary">Начать кроссворд</button>
        </div>

        <div class="cw-mode-card" data-mode="weak" data-testid="cw-mode-card-weak" tabindex="0" role="button" aria-label="Слабые слова">
          <div class="cw-mode-icon">🩹</div>
          <div class="cw-mode-info">
            <h3>Слабые слова</h3>
            <p>Повторите слова, в которых раньше ошибались</p>
          </div>
          <button class="cw-btn cw-btn-primary">Начать кроссворд</button>
        </div>
      </div>
    </div>
  `;

  const cards = body.querySelectorAll('.cw-mode-card');
  cards.forEach((card) => {
    const handleSelect = () => {
      const selectedMode = card.dataset.mode || 'normal';
      startCrosswordGame(state, dependencies, selectedMode);
    };

    card.onclick = handleSelect;
    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    };
  });
}

/**
 * Starts a Crossword game batch in specified mode ('normal' | 'weak').
 */
export function startCrosswordGame(state, dependencies = {}, mode = 'normal') {
  cleanupCrossword();

  const body = $('#crossword-body');
  if (!body) return;

  const lessons = dependencies?.lessons || LESSONS;
  const isWeakMode = mode === 'weak';

  // Generate crossword data for specified mode
  const crosswordData = generateCrossword(11, state, lessons, mode);

  if (!crosswordData || !crosswordData.placedWords || crosswordData.placedWords.length < 3) {
    let emptyIcon = '🧩';
    let emptyTitle = 'Недостаточно слов';
    let emptyDesc = 'Откройте больше глав, чтобы играть в кроссворд';
    let showSwitchBtn = false;

    if (isWeakMode) {
      emptyIcon = '🩹';
      const weakCandidates = getWeakCrosswordCandidates(state, lessons);
      if (weakCandidates.length === 0) {
        emptyTitle = 'Слабых слов пока нет';
        emptyDesc =
          'Слабых слов пока нет. Продолжайте занятия в SRS — слова с ошибками появятся здесь автоматически.';
      } else {
        emptyTitle = 'Не удалось составить кроссворд';
        emptyDesc =
          'Не удалось составить кроссворд из доступных слабых слов. Попробуйте позже или выберите обычный режим.';
      }
      showSwitchBtn = true;
    }

    body.innerHTML = `
      <div class="empty-state" data-testid="crossword-empty">
        <span style="font-size:60px">${emptyIcon}</span>
        <h3>${emptyTitle}</h3>
        <p>${emptyDesc}</p>
        ${
          showSwitchBtn
            ? `<button class="cw-btn cw-btn-primary" id="cw-switch-normal-btn" style="margin-top:16px;">Перейти в обычный режим</button>`
            : `<button class="cw-btn cw-btn-secondary" id="cw-back-mode-btn" style="margin-top:16px;">⚙️ Сменить режим</button>`
        }
      </div>
    `;

    const switchBtn = $('#cw-switch-normal-btn');
    if (switchBtn) {
      switchBtn.onclick = () => startCrosswordGame(state, dependencies, 'normal');
    }
    const backBtn = $('#cw-back-mode-btn');
    if (backBtn) {
      backBtn.onclick = () => renderCrosswordModeSelection(state, dependencies);
    }
    return;
  }

  const { grid, placedWords, clues, gridSize } = crosswordData;

  // Initialize answers
  const userAnswers = {};
  placedWords.forEach((pw) => {
    userAnswers[pw.word.id] = { filled: Array(pw.word.length).fill(''), correct: false };
  });

  const modeBadgeText = isWeakMode ? '🩹 Слабые слова' : '🧩 Все слова';

  body.innerHTML = `
    <!-- HUD Header & Controls -->
    <div class="cw-header-bar" data-testid="cw-header-bar">
      <span class="cw-mode-badge" data-testid="cw-mode-badge">${modeBadgeText}</span>
      <div class="cw-header-actions">
        <button class="cw-btn-sm" id="cw-new-game-btn" data-testid="cw-new-game-btn" title="Новый кроссворд">🔄 Новый</button>
        <button class="cw-btn-sm" id="cw-change-mode-btn" data-testid="cw-change-mode-btn" title="Сменить режим">⚙️ Режим</button>
      </div>
    </div>

    <!-- Кнопки зума -->
    <div class="cw-zoom-controls">
      <button class="cw-zoom-btn" id="cw-zoom-in">+</button>
      <button class="cw-zoom-btn" id="cw-zoom-out">−</button>
    </div>

    <!-- Viewport для бесконечного холста -->
    <div class="crossword-viewport" id="crossword-viewport">
      <div class="crossword-canvas">
        <!-- Сетка кроссворда -->
        <div class="crossword-grid" id="crossword-grid" style="
          grid-template-columns: repeat(${gridSize}, var(--cw-cell-size));
          grid-template-rows: repeat(${gridSize}, var(--cw-cell-size));
        ">
          ${renderGridCells(grid, gridSize)}
        </div>
      </div>
    </div>

    <!-- Фиксированная нижняя панель -->
    <div class="crossword-bottom-panel">
      <!-- Активная подсказка -->
      <div class="clue-panel hidden" id="clue-panel">
        <div class="clue-content">
          <span class="clue-translation" id="clue-translation"></span>
          <div class="clue-actions">
            <button class="clue-clear" id="clue-clear">🗑️</button>
            <button class="clue-hint" id="clue-hint">❓</button>
            <button class="clue-speak" id="clue-speak">🔊</button>
          </div>
        </div>
      </div>

      <!-- Кастомная клавиатура -->
      <div class="crossword-keyboard hidden" id="crossword-keyboard"></div>
    </div>

    <!-- Скрытые подсказки -->
    <div class="crossword-clues" style="display: none;">
      <details>
        <summary><strong>По горизонтали</strong></summary>
        <ol>
          ${clues.across.map((c) => `<li value="${c.number}">${c.clue}</li>`).join('')}
        </ol>
      </details>
      <details>
        <summary><strong>По вертикали</strong></summary>
        <ol>
          ${clues.down.map((c) => `<li value="${c.number}">${c.clue}</li>`).join('')}
        </ol>
      </details>
    </div>
  `;

  // Attach Header Controls
  const newGameBtn = $('#cw-new-game-btn');
  if (newGameBtn) {
    newGameBtn.onclick = () => startCrosswordGame(state, dependencies, mode);
  }
  const changeModeBtn = $('#cw-change-mode-btn');
  if (changeModeBtn) {
    changeModeBtn.onclick = () => renderCrosswordModeSelection(state, dependencies);
  }

  // Initialize handlers & zoom
  initCrosswordHandlers(crosswordData, userAnswers, state, dependencies, mode);

  document.querySelectorAll('.grid-cell').forEach((cell) => {
    const r = cell.dataset.row;
    const c = cell.dataset.col;
    if (r !== undefined && c !== undefined) {
      cell.style.gridRow = parseInt(r) + 1;
      cell.style.gridColumn = parseInt(c) + 1;
    }
  });

  initCrosswordZoom();
}

function renderGridCells(grid, gridSize) {
  let html = '';

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cell = grid[row][col];

      if (cell.letter === null) {
        html += `<div class="grid-cell-empty" style="grid-row: ${row + 1}; grid-column: ${col + 1}"></div>`;
      } else {
        const number = cell.number || '';
        html += `
          <div class="grid-cell active" data-row="${row}" data-col="${col}" style="grid-row: ${row + 1}; grid-column: ${col + 1}">
            ${number ? `<span class="cell-number">${number}</span>` : ''}
            <div class="cell-kana">
              <span class="kana-hira" data-answer=""></span>
              <span class="kana-kata"></span>
            </div>
          </div>
        `;
      }
    }
  }

  return html;
}

function initCrosswordHandlers(crosswordData, userAnswers, state, dependencies, mode = 'normal') {
  const { placedWords, grid } = crosswordData;

  // Reset finished state for new party
  window.crosswordFinishedState = null;

  // Save to global state
  window.cwState = {
    userAnswers,
    placedWords,
    grid,
    selectedCell: null,
    direction: 'across',
    currentWordId: null,
    state,
    dependencies,
    mode,
  };

  const viewport = $('#crossword-viewport');
  const keyboard = $('#crossword-keyboard');
  const clearBtn = $('#clue-clear');
  const hintBtn = $('#clue-hint');
  const speakBtn = $('#clue-speak');

  // Показываем клавиатуру
  keyboard.classList.remove('hidden');
  renderKeyboard(keyboard, userAnswers, placedWords, grid);

  // Клики по ячейкам
  const cellClickListener = (e) => {
    const cell = e.target.closest('.grid-cell.active');
    if (!cell) return;

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    if (
      window.cwState.selectedCell &&
      window.cwState.selectedCell.row === row &&
      window.cwState.selectedCell.col === col
    ) {
      window.cwState.direction = window.cwState.direction === 'across' ? 'down' : 'across';
    }

    window.cwState.selectedCell = { row, col };
    selectCell(row, col, placedWords, userAnswers, grid);
  };

  viewport.addEventListener('click', cellClickListener);

  // Кнопка очистки
  clearBtn.onclick = () => {
    if (!window.cwState.currentWordId) return;
    const pw = placedWords.find((p) => p.word.id === window.cwState.currentWordId);
    if (!pw) return;

    const wordAns = userAnswers[pw.word.id];
    if (wordAns.correct) return;

    // Сбрасываем только незаблокированные ячейки
    for (let i = 0; i < pw.word.length; i++) {
      if (wordAns.lockedIndices && wordAns.lockedIndices.has(i)) {
        continue;
      }
      wordAns.filled[i] = '';

      const r = pw.direction === 'across' ? pw.row : pw.row + i;
      const c = pw.direction === 'across' ? pw.col + i : pw.col;

      const cellDom = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
      if (cellDom) {
        const hiraSpan = cellDom.querySelector('.kana-hira');
        const kataSpan = cellDom.querySelector('.kana-kata');
        if (hiraSpan) {
          hiraSpan.dataset.answer = '';
          hiraSpan.textContent = '';
        }
        if (kataSpan) {
          kataSpan.textContent = '';
        }
        cellDom.classList.remove(
          'grid-cell-letter-manual',
          'grid-cell-letter-hint',
          'grid-cell-letter-correct'
        );
      }
    }

    renderKeyboard(keyboard, userAnswers, placedWords, grid);
  };

  // Кнопка подсказки (открывает 1 случайную неразгаданную букву)
  hintBtn.onclick = () => {
    if (!window.cwState.currentWordId) return;

    const pw = placedWords.find((p) => p.word.id === window.cwState.currentWordId);
    if (!pw) return;

    const wordAns = userAnswers[pw.word.id];
    if (wordAns.correct) return;

    // Ищем незаполненные или неверные индексы
    const unrevealedIndices = [];
    for (let i = 0; i < pw.word.length; i++) {
      const isLocked = wordAns.lockedIndices && wordAns.lockedIndices.has(i);
      if (!isLocked && wordAns.filled[i] !== pw.word.kana[i]) {
        unrevealedIndices.push(i);
      }
    }

    if (unrevealedIndices.length === 0) return;

    // Выбираем случайный индекс для подсказки
    const randomIndex = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
    const correctLetter = pw.word.kana[randomIndex];

    // Вписываем правильную букву
    wordAns.filled[randomIndex] = correctLetter;
    wordAns.usedHint = true;

    if (!wordAns.lockedIndices) {
      wordAns.lockedIndices = new Set();
    }
    wordAns.lockedIndices.add(randomIndex);

    const r = pw.direction === 'across' ? pw.row : pw.row + randomIndex;
    const c = pw.direction === 'across' ? pw.col + randomIndex : pw.col;
    const cellDom = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);

    if (cellDom) {
      const hiraSpan = cellDom.querySelector('.kana-hira');
      const kataSpan = cellDom.querySelector('.kana-kata');
      if (hiraSpan) {
        hiraSpan.dataset.answer = correctLetter;
        hiraSpan.textContent = correctLetter;
      }
      if (kataSpan) {
        kataSpan.textContent = hiraganaToKatakana(correctLetter);
      }
      cellDom.classList.add('grid-cell-letter-hint');
    }

    // Синхронизируем пересечения
    const cellData = grid[r][c];
    if (cellData && cellData.wordIds) {
      cellData.wordIds.forEach((wId) => {
        const intersectingPw = placedWords.find((p) => p.word.id === wId);
        if (intersectingPw) {
          const idx = getCellIndexInWord(r, c, intersectingPw);
          if (idx !== -1 && userAnswers[wId]) {
            userAnswers[wId].filled[idx] = correctLetter;
          }
        }
      });
    }

    renderKeyboard(keyboard, userAnswers, placedWords, grid);
    checkWordCompletion(pw, userAnswers, grid, placedWords);
  };

  // Кнопка озвучки
  speakBtn.onclick = () => {
    if (!window.cwState.currentWordId) return;
    const pw = placedWords.find((p) => p.word.id === window.cwState.currentWordId);
    if (pw && pw.word.kana) {
      speakJapanese(pw.word.kana);
    }
  };

  activeCleanup = () => {
    viewport.removeEventListener('click', cellClickListener);
  };
}

function selectCell(row, col, placedWords, userAnswers, grid) {
  const wordsAtCell = placedWords.filter((pw) => {
    if (pw.direction === 'across') {
      return pw.row === row && col >= pw.col && col < pw.col + pw.word.length;
    } else {
      return pw.col === col && row >= pw.row && row < pw.row + pw.word.length;
    }
  });

  if (wordsAtCell.length === 0) return;

  let activeWord = wordsAtCell.find((w) => w.direction === window.cwState.direction);
  if (!activeWord) {
    activeWord = wordsAtCell[0];
    window.cwState.direction = activeWord.direction;
  }

  window.cwState.currentWordId = activeWord.word.id;

  // Обновляем визуальное выделение
  refreshGridCellClasses(placedWords, userAnswers, activeWord.word.id);

  // Покажем подсказку
  const cluePanel = $('#clue-panel');
  const clueTranslation = $('#clue-translation');
  if (cluePanel && clueTranslation) {
    clueTranslation.textContent = activeWord.word.translation;
    cluePanel.classList.remove('hidden');
  }

  // Обновим клавиатуру
  const keyboard = $('#crossword-keyboard');
  if (keyboard) {
    renderKeyboard(keyboard, userAnswers, placedWords, grid);
  }
}

function renderKeyboard(container, userAnswers, placedWords, grid) {
  if (!window.cwState.currentWordId) {
    container.innerHTML = '';
    return;
  }

  const currentWord = placedWords.find((pw) => pw.word.id === window.cwState.currentWordId);
  if (!currentWord) {
    container.innerHTML = '';
    return;
  }

  const correctKana = currentWord.word.kana.split('');
  const allKana = [
    'あ',
    'い',
    'う',
    'え',
    'お',
    'か',
    'き',
    'く',
    'け',
    'こ',
    'さ',
    'し',
    'す',
    'せ',
    'そ',
    'た',
    'ち',
    'つ',
    'て',
    'と',
    'な',
    'に',
    'ぬ',
    'ね',
    'の',
    'は',
    'ひ',
    'ふ',
    'へ',
    'ほ',
    'ま',
    'み',
    'む',
    'め',
    'も',
    'や',
    'ゆ',
    'よ',
    'ら',
    'り',
    'る',
    'れ',
    'ろ',
    'わ',
    'を',
    'ん',
  ];

  // Создаем динамический набор клавиш (буквы слова + 5 случайных дистракторов)
  const distractorPool = allKana.filter((k) => !correctKana.includes(k));
  const selectedDistractors = shuffleArray(distractorPool).slice(
    0,
    Math.max(3, 8 - correctKana.length)
  );
  const keyboardLetters = shuffleArray([...new Set([...correctKana, ...selectedDistractors])]);

  container.innerHTML = `
    <div class="cw-keyboard-grid">
      ${keyboardLetters
        .map(
          (char) => `
        <button class="cw-key" data-char="${char}">${char}</button>
      `
        )
        .join('')}
    </div>
  `;

  // Навешиваем слушатели на клавиши
  container.querySelectorAll('.cw-key').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const letter = btn.dataset.char;
      insertLetterIntoWord(letter, currentWord, userAnswers, grid, placedWords, btn);
    };
  });
}

function insertLetterIntoWord(letter, wordData, userAnswers, grid, placedWords, clickedButton) {
  const wordAnswer = userAnswers[wordData.word.id];

  // Блокируем ввод в полностью правильные слова
  if (wordAnswer.correct) return;

  let emptyIndex = -1;

  for (let i = 0; i < wordData.word.length; i++) {
    const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
    const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;

    const cellDom = $(`.grid-cell[data-row="${r}"][data-col="${c}"] .kana-hira`);

    const isEmptyInFilled = wordAnswer.filled[i] === '';
    const isEmptyInDom = !cellDom || cellDom.textContent.trim() === '';

    if (isEmptyInFilled && isEmptyInDom) {
      emptyIndex = i;
      break;
    }

    // Синхронизация
    if (cellDom && cellDom.textContent.trim() !== '' && wordAnswer.filled[i] === '') {
      wordAnswer.filled[i] = cellDom.textContent.trim();
    }
  }

  if (emptyIndex === -1) return;

  // Вписываем букву
  wordAnswer.filled[emptyIndex] = letter;

  // Обновляем UI
  const r = wordData.direction === 'across' ? wordData.row : wordData.row + emptyIndex;
  const c = wordData.direction === 'across' ? wordData.col + emptyIndex : wordData.col;
  const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);

  if (cell) {
    const hiraSpan = cell.querySelector('.kana-hira');
    const kataSpan = cell.querySelector('.kana-kata');

    if (hiraSpan) {
      hiraSpan.dataset.answer = letter;
      hiraSpan.textContent = letter;
    }

    if (kataSpan) {
      kataSpan.textContent = hiraganaToKatakana(letter);
    }
  }

  const correctLetter = wordData.word.kana[emptyIndex];
  const isCorrect = letter === correctLetter;

  if (isCorrect) {
    if (cell) {
      cell.classList.add('grid-cell-letter-manual');
    }

    if (!wordAnswer.lockedIndices) {
      wordAnswer.lockedIndices = new Set();
    }
    wordAnswer.lockedIndices.add(emptyIndex);
  }

  // Глобальная синхронизация на пересечениях
  const cellData = grid[r][c];
  if (cellData && cellData.wordIds) {
    cellData.wordIds.forEach((wId) => {
      const pw = placedWords.find((p) => p.word.id === wId);
      if (pw) {
        const idx = getCellIndexInWord(r, c, pw);
        if (idx !== -1 && userAnswers[wId]) {
          userAnswers[wId].filled[idx] = letter;
        }
      }
    });
  }

  if (clickedButton) {
    clickedButton.style.opacity = '0.3';
    clickedButton.disabled = true;
  }

  checkWordCompletion(wordData, userAnswers, grid, placedWords);

  const filledCell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
  if (filledCell && typeof filledCell.scrollIntoView === 'function') {
    filledCell.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
  }
}

function getCellIndexInWord(row, col, placedWord) {
  if (placedWord.direction === 'across') {
    if (
      row === placedWord.row &&
      col >= placedWord.col &&
      col < placedWord.col + placedWord.word.length
    ) {
      return col - placedWord.col;
    }
  } else {
    if (
      col === placedWord.col &&
      row >= placedWord.row &&
      row < placedWord.row + placedWord.word.length
    ) {
      return row - placedWord.row;
    }
  }
  return -1;
}

function checkWordCompletion(wordData, userAnswers, grid, placedWords) {
  const wordAns = userAnswers[wordData.word.id];
  const targetKana = wordData.word.kana;
  const userKana = wordAns.filled.join('');

  if (userKana === targetKana) {
    wordAns.correct = true;

    // Подсвечиваем слово как угаданное
    for (let i = 0; i < wordData.word.length; i++) {
      const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
      const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;

      const cellDom = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
      if (cellDom) {
        cellDom.classList.remove('grid-cell-letter-manual');
        cellDom.classList.add('grid-cell-correct');
      }
    }

    // Озвучка при угадывании
    speakJapanese(targetKana);

    // Автоматическое переключение на следующее нерешенное слово
    const nextWord = findNextIncompleteWord(placedWords, userAnswers, wordData.word.id);
    if (nextWord) {
      setTimeout(() => {
        window.cwState.currentWordId = nextWord.word.id;
        window.cwState.direction = nextWord.direction;
        window.cwState.selectedCell = { row: nextWord.row, col: nextWord.col };

        selectCell(nextWord.row, nextWord.col, placedWords, userAnswers, grid);

        const firstCellDom = $(
          `.grid-cell[data-row="${nextWord.row}"][data-col="${nextWord.col}"]`
        );
        if (firstCellDom && typeof firstCellDom.scrollIntoView === 'function') {
          firstCellDom.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center',
          });
        }
      }, 400);
    }

    // Проверяем завершение всего кроссворда
    const allCorrect = Object.values(userAnswers).every((ans) => ans.correct);
    if (allCorrect) {
      completeCrossword(placedWords.length, userAnswers);
    }
  }
}

function findNextIncompleteWord(placedWords, userAnswers, currentWordId) {
  const unsolvedWords = placedWords.filter(
    (pw) => userAnswers[pw.word.id] && !userAnswers[pw.word.id].correct
  );

  const availableWords = unsolvedWords.filter((pw) => pw.word.id !== currentWordId);

  if (availableWords.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableWords.length);
    return availableWords[randomIndex];
  }

  return null;
}

function completeCrossword(totalWords, userAnswers) {
  if (window.crosswordFinishedState?.awarded) return;
  window.crosswordFinishedState = { awarded: true };

  const { state, dependencies, mode = 'normal' } = window.cwState;
  const { save, addXP } = dependencies || {};

  // Подсчитываем слова
  const wordsWithHint = Object.values(userAnswers).filter((a) => a.correct && a.usedHint).length;
  const wordsWithoutHint = Object.values(userAnswers).filter(
    (a) => a.correct && !a.usedHint
  ).length;

  // Награда
  const xpReward = wordsWithoutHint * 20 + wordsWithHint * 10;
  const coinsReward = Math.floor(xpReward / 10);

  if (addXP) addXP(xpReward);
  if (state) {
    state.coins = (state.coins || 0) + coinsReward;
  }
  if (save) save();

  const isWeak = mode === 'weak';
  const subtitleDesc = isWeak ? 'Режим: Слабые слова' : 'Режим: Все слова';

  showCompletionScreen({
    title: 'おめでとう！',
    subtitle: 'Congratulations!',
    desc: `Вы успешно завершили кроссворд! ${subtitleDesc}`,
    theme: 'success',
    rewards: [
      { icon: '📖', label: `${wordsWithoutHint} отгадано, ${wordsWithHint} с подсказкой` },
      { icon: '⭐', label: `+${xpReward} XP` },
      { icon: '🪙', label: `+${coinsReward} монет` },
    ],
    onContinue: () => {
      cleanupCrossword();
      renderCrosswordModeSelection(state, dependencies);
    },
  });
}

export function refreshGridCellClasses(placedWords, userAnswers, currentWordId) {
  document.querySelectorAll('.grid-cell').forEach((cell) => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);

    const wordsAtCell = placedWords.filter((pw) => {
      if (pw.direction === 'across') {
        return pw.row === r && c >= pw.col && c < pw.col + pw.word.length;
      } else {
        return pw.col === c && r >= pw.row && r < pw.row + pw.word.length;
      }
    });

    const correctWords = wordsAtCell.filter(
      (pw) => userAnswers[pw.word.id] && userAnswers[pw.word.id].correct
    );

    cell.classList.remove('active-word', 'selected');

    if (correctWords.length > 0 && correctWords.length === wordsAtCell.length) {
      cell.classList.add('grid-cell-correct');
    }

    if (currentWordId) {
      const isCurrentWord = wordsAtCell.some((pw) => pw.word.id === currentWordId);
      if (isCurrentWord) {
        cell.classList.add('active-word');
      }
    }

    if (
      window.cwState.selectedCell &&
      window.cwState.selectedCell.row === r &&
      window.cwState.selectedCell.col === c
    ) {
      cell.classList.add('selected');
    }
  });
}

function initCrosswordZoom() {
  let scale = 1;
  const canvas = $('.crossword-canvas');
  const zoomInBtn = $('#cw-zoom-in');
  const zoomOutBtn = $('#cw-zoom-out');

  if (!canvas || !zoomInBtn || !zoomOutBtn) return;

  function updateZoom() {
    canvas.style.transform = `scale(${scale})`;
  }

  zoomInBtn.onclick = () => {
    scale = Math.min(scale + 0.2, 1.8);
    updateZoom();
  };

  zoomOutBtn.onclick = () => {
    scale = Math.max(scale - 0.2, 0.6);
    updateZoom();
  };
}

// Генератор кроссворда
function generateCrossword(gridSize, state, lessons = LESSONS, mode = 'normal') {
  const isWeakMode = mode === 'weak';
  const allCandidates = isWeakMode
    ? getWeakCrosswordCandidates(state, lessons)
    : getAvailableMiniGameCandidates(state, lessons);

  const validCandidates = allCandidates.filter(
    (c) => c.kana && c.kana.length >= 2 && c.kana.length <= 8
  );

  if (validCandidates.length < 3) return null;

  const maxAttempts = 20;
  let bestResult = null;
  let bestScore = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const selectedPool = selectMiniGameWords(validCandidates, {
      gameId: 'crossword',
      count: 15,
      mode,
      history: state,
    });

    const result = tryGenerateCrosswordWithPool(gridSize, selectedPool);

    if (result && result.placedWords.length > bestScore) {
      bestScore = result.placedWords.length;
      bestResult = result;
    }

    if (bestScore >= 6) break;
  }

  if (bestResult && bestResult.placedWords.length >= 3) {
    recordGameSession(
      state,
      'crossword',
      bestResult.placedWords.map((pw) => pw.word.id),
      mode
    );
  }

  return bestResult;
}

function tryGenerateCrosswordWithPool(gridSize, candidatePool) {
  const unlockedWords = [];
  const seenKana = new Set();

  candidatePool.forEach((word) => {
    const kana = word.kana || word.writing || '';
    if (kana && !seenKana.has(kana)) {
      seenKana.add(kana);
      unlockedWords.push({
        id: word.id,
        kana,
        kanji: word.kanji || kana,
        translation: word.translation,
        length: kana.length,
      });
    }
  });

  if (unlockedWords.length < 3) return null;

  const shuffledWords = shuffleArray(unlockedWords);

  const grid = Array(gridSize)
    .fill(null)
    .map(() =>
      Array(gridSize)
        .fill(null)
        .map(() => ({ letter: null, wordIds: [] }))
    );
  const placedWords = [];
  const availableWords = [...shuffledWords];

  // Первое слово по центру
  const firstWord = availableWords.shift();
  const startRow = Math.floor(gridSize / 2);
  const startCol = Math.floor((gridSize - firstWord.length) / 2);

  for (let i = 0; i < firstWord.length; i++) {
    grid[startRow][startCol + i].letter = firstWord.kana[i];
    grid[startRow][startCol + i].wordIds.push(firstWord.id);
  }

  placedWords.push({
    word: firstWord,
    row: startRow,
    col: startCol,
    direction: 'across',
    number: 1,
  });

  let wordNumber = 2;
  const maxWords = 10;

  // Ищем пересечения
  while (placedWords.length < maxWords && availableWords.length > 0) {
    let foundIntersection = false;

    for (const placedWord of placedWords) {
      if (foundIntersection) break;

      for (let i = 0; i < placedWord.word.length; i++) {
        if (foundIntersection) break;

        const letter = placedWord.word.kana[i];
        const row = placedWord.direction === 'across' ? placedWord.row : placedWord.row + i;
        const col = placedWord.direction === 'across' ? placedWord.col + i : placedWord.col;

        // Попробуем разместить непересеченное слово через эту букву
        for (let j = 0; j < availableWords.length; j++) {
          const candidate = availableWords[j];
          const matchIndex = candidate.kana.indexOf(letter);

          if (matchIndex !== -1) {
            const newDirection = placedWord.direction === 'across' ? 'down' : 'across';
            const newRow = newDirection === 'down' ? row - matchIndex : row;
            const newCol = newDirection === 'across' ? col - matchIndex : col;

            if (canPlaceWord(grid, gridSize, candidate, newRow, newCol, newDirection)) {
              placeWordOnGrid(grid, candidate, newRow, newCol, newDirection);

              placedWords.push({
                word: candidate,
                row: newRow,
                col: newCol,
                direction: newDirection,
                number: wordNumber++,
              });

              availableWords.splice(j, 1);
              foundIntersection = true;
              break;
            }
          }
        }
      }
    }

    if (!foundIntersection) {
      break;
    }
  }

  // Сбор клик-структуры clue list
  const clues = { across: [], down: [] };
  placedWords.forEach((pw) => {
    const list = pw.direction === 'across' ? clues.across : clues.down;
    list.push({
      number: pw.number,
      clue: pw.word.translation,
      wordId: pw.word.id,
    });
  });

  clues.across.sort((a, b) => a.number - b.number);
  clues.down.sort((a, b) => a.number - b.number);

  return {
    grid,
    placedWords,
    clues,
    gridSize,
  };
}

function canPlaceWord(grid, gridSize, word, row, col, direction) {
  if (direction === 'across') {
    if (col < 0 || col + word.length > gridSize || row < 0 || row >= gridSize) return false;
  } else {
    if (row < 0 || row + word.length > gridSize || col < 0 || col >= gridSize) return false;
  }

  for (let i = 0; i < word.length; i++) {
    const r = direction === 'across' ? row : row + i;
    const c = direction === 'across' ? col + i : col;
    const currentLetter = grid[r][c].letter;

    if (currentLetter !== null && currentLetter !== word.kana[i]) {
      return false;
    }

    // Соседние ячейки (чтобы слова не шли параллельно вплотную)
    if (currentLetter === null) {
      if (direction === 'across') {
        if (r > 0 && grid[r - 1][c].letter !== null) return false;
        if (r < gridSize - 1 && grid[r + 1][c].letter !== null) return false;
      } else {
        if (c > 0 && grid[r][c - 1].letter !== null) return false;
        if (c < gridSize - 1 && grid[r][c + 1].letter !== null) return false;
      }
    }
  }

  // Ячейки прямо до и после слова
  if (direction === 'across') {
    if (col > 0 && grid[row][col - 1].letter !== null) return false;
    if (col + word.length < gridSize && grid[row][col + word.length].letter !== null) return false;
  } else {
    if (row > 0 && grid[row - 1][col].letter !== null) return false;
    if (row + word.length < gridSize && grid[row + word.length][col].letter !== null) return false;
  }

  return true;
}

function placeWordOnGrid(grid, word, row, col, direction) {
  for (let i = 0; i < word.length; i++) {
    const r = direction === 'across' ? row : row + i;
    const c = direction === 'across' ? col + i : col;
    grid[r][c].letter = word.kana[i];
    grid[r][c].wordIds.push(word.id);
  }
}

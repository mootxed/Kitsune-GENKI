/* ui/crossword.js — Crossword puzzle module */

import { $ } from '../src/utils.js';
import { allCards, wordById } from '../src/srs-helpers.js';
import { LESSONS } from './home.js';
import { speakJapanese } from '../src/audio-helper.js';

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

// Проверка разблокировки слова
function isWordUnlocked(wordId, state) {
  return state.srs && state.srs[wordId];
}

/**
 * Рендер экрана кроссворда
 */
export function renderCrossword(state, dependencies) {
  const body = $('#crossword-body');
  const { save, markActivity, toast } = dependencies;

  // Генерируем кроссворд
  const crosswordData = generateCrossword(11, state);

  if (!crosswordData || crosswordData.placedWords.length < 3) {
    body.innerHTML = `
      <div class="empty-state">
        <span style="font-size:60px">🧩</span>
        <h3>Недостаточно слов</h3>
        <p>Откройте больше глав, чтобы играть в кроссворд</p>
      </div>
    `;
    return;
  }

  const { grid, placedWords, clues, gridSize } = crosswordData;

  // Инициализируем ответы
  const userAnswers = {};
  placedWords.forEach((pw) => {
    userAnswers[pw.word.id] = { filled: Array(pw.word.length).fill(''), correct: false };
  });

  body.innerHTML = `
    <div class="crossword-game-layout">
      <!-- Кнопки зума -->
      <div class="cw-zoom-controls">
        <button class="cw-zoom-btn" id="cw-zoom-in">+</button>
        <button class="cw-zoom-btn" id="cw-zoom-out">−</button>
      </div>

      <!-- Сетка кроссворда напрямую -->
      <div class="crossword-grid" id="crossword-grid" style="
        grid-template-columns: repeat(${gridSize}, var(--cw-cell-size));
        grid-template-rows: repeat(${gridSize}, var(--cw-cell-size));
      ">
        ${renderGridCells(grid, gridSize)}
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
        <div class="crossword-keyboard" id="crossword-keyboard"></div>
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
    </div>
  `;

  // Инициализация обработчиков
  initCrosswordHandlers(crosswordData, userAnswers, state, dependencies);

  // Позиционирование ячеек в CSS Grid
  document.querySelectorAll('.grid-cell').forEach((cell) => {
    const r = cell.dataset.row;
    const c = cell.dataset.col;
    if (r !== undefined && c !== undefined) {
      cell.style.gridRow = parseInt(r) + 1;
      cell.style.gridColumn = parseInt(c) + 1;
    }
  });

  // Инициализация зума
  initCrosswordZoom();
}

function renderGridCells(grid, gridSize) {
  let html = '';

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cell = grid[row][col];

      if (cell.letter === null) {
        html += `<div style="grid-row: ${row + 1}; grid-column: ${col + 1}"></div>`;
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

function initCrosswordHandlers(crosswordData, userAnswers, state, dependencies) {
  const { placedWords, grid } = crosswordData;
  const { save, markActivity, toast } = dependencies;

  // Сохраняем в глобальное состояние
  window.cwState = {
    userAnswers,
    placedWords,
    grid,
    state,
    dependencies,
  };

  // Обработчик клика по ячейке
  document.querySelectorAll('.grid-cell.active').forEach((cell) => {
    cell.onclick = () => {
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);

      // Находим и выбираем слово
      const word = findWordAtCell(row, col, placedWords);
      if (word) {
        selectWord(word, crosswordData, userAnswers);
      }
    };
  });

  // Выбрать первое слово автоматически
  if (placedWords.length > 0) {
    selectWord(placedWords[0], crosswordData, userAnswers);
  }
}

function selectWord(wordData, crosswordData, userAnswers) {
  const { grid, placedWords } = crosswordData;

  // Сохраняем текущее слово
  window.currentCrosswordWord = wordData;

  // Обновляем классы ячеек
  refreshGridCellClasses(placedWords, userAnswers, wordData.word.id);

  // Обновляем Clue Panel
  updateCluePanel(wordData.word, userAnswers, grid, placedWords);

  // Генерируем клавиатуру
  generateKeyboard(wordData, userAnswers, grid, placedWords);

  // Показываем панель
  const bottomPanel = $('.crossword-bottom-panel');
  if (bottomPanel) bottomPanel.classList.add('active');
}

function updateCluePanel(word, userAnswers, grid, placedWords) {
  const panel = $('#clue-panel');
  const translationEl = $('#clue-translation');
  const speakBtn = $('#clue-speak');
  const { state, dependencies } = window.cwState;
  const { save, toast } = dependencies;

  if (panel && translationEl) {
    panel.classList.remove('hidden');
    translationEl.textContent = word.translation;

    if (speakBtn) {
      speakBtn.onclick = () => speakJapanese(word.kana);
    }

    // Кнопка "Очистить слово"
    const clearBtn = $('#clue-clear');
    if (clearBtn) {
      clearBtn.onclick = () => {
        const wordData = window.currentCrosswordWord;
        if (!wordData) return;

        // Проверяем, разгадано ли слово
        for (let i = 0; i < wordData.word.length; i++) {
          const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
          const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;
          const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
          if (cell && cell.classList.contains('correct')) {
            return;
          }
        }

        const wordAnswer = userAnswers[wordData.word.id];
        if (!wordAnswer) return;

        // Очищаем все буквы с учетом пересечений
        for (let i = 0; i < wordData.word.length; i++) {
          const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
          const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;

          // Получаем все слова, проходящие через эту ячейку
          const cellData = grid[r][c];
          if (cellData && cellData.wordIds) {
            // Очищаем эту ячейку во ВСЕХ пересекающихся словах
            cellData.wordIds.forEach((wId) => {
              const pw = placedWords.find((p) => p.word.id === wId);
              if (pw && userAnswers[wId]) {
                const cellIdx = getCellIndexInWord(r, c, pw);
                if (cellIdx !== -1) {
                  userAnswers[wId].filled[cellIdx] = '';
                }
              }
            });
          }

          // Очищаем DOM
          const cellDom = $(`.grid-cell[data-row="${r}"][data-col="${c}"] .kana-hira`);
          if (cellDom) {
            cellDom.textContent = '';
            cellDom.dataset.answer = '';
          }
          const kataDom = $(`.grid-cell[data-row="${r}"][data-col="${c}"] .kana-kata`);
          if (kataDom) {
            kataDom.textContent = '';
          }
        }

        // Перегенерируем клавиатуру
        generateKeyboard(wordData, userAnswers, grid, placedWords);
      };
    }

    // Кнопка подсказки
    const hintBtn = $('#clue-hint');
    if (hintBtn) {
      hintBtn.onclick = () => {
        const wordData = window.currentCrosswordWord;
        if (!wordData) return;

        const wordAnswer = userAnswers[wordData.word.id];
        if (!wordAnswer) return;

        // Помечаем флаг подсказки
        wordAnswer.usedHint = true;

        // Если слово уже разгадано, не даём подсказку
        if (wordAnswer.correct) return;

        // Находим пустые индексы
        const emptyIndices = [];
        for (let i = 0; i < wordData.word.length; i++) {
          if (wordAnswer.filled[i] === '') {
            emptyIndices.push(i);
          }
        }

        if (emptyIndices.length === 0) return;

        const srsCard = state.srs[wordData.word.id];
        if (srsCard) {
          if (srsCard.progress === undefined) srsCard.progress = 0;
          srsCard.progress = Math.max(0, srsCard.progress - 5);
        }
        save();

        // Выбираем случайный пустой индекс
        const randomIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        const correctLetter = wordData.word.kana[randomIndex];

        // Записываем букву
        wordAnswer.filled[randomIndex] = correctLetter;

        // Вычисляем координаты
        const r = wordData.direction === 'across' ? wordData.row : wordData.row + randomIndex;
        const c = wordData.direction === 'across' ? wordData.col + randomIndex : wordData.col;

        const cellData = grid[r][c];

        // Синхронизируем с пересекающимися словами
        if (cellData && cellData.wordIds) {
          cellData.wordIds.forEach((wId) => {
            const pw = placedWords.find((p) => p.word.id === wId);
            if (pw) {
              const cellIdx = getCellIndexInWord(r, c, pw);
              if (cellIdx !== -1 && userAnswers[wId]) {
                userAnswers[wId].filled[cellIdx] = correctLetter;
              }
            }
          });
        }

        // Обновляем ячейку в DOM
        const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
        if (cell) {
          const hiraSpan = cell.querySelector('.kana-hira');
          const kataSpan = cell.querySelector('.kana-kata');

          if (hiraSpan) {
            hiraSpan.dataset.answer = correctLetter;
            hiraSpan.textContent = correctLetter;

            if (kataSpan) {
              kataSpan.textContent = hiraganaToKatakana(correctLetter);
            }
          }
        }

        // Перегенерируем клавиатуру
        generateKeyboard(wordData, userAnswers, grid, placedWords);

        // Проверяем заполненность слова
        checkWordCompletion(wordData, userAnswers, grid, placedWords);
      };
    }
  }
}

function generateKeyboard(wordData, userAnswers, grid, placedWords) {
  const keyboard = $('#crossword-keyboard');
  if (!keyboard) return;

  const wordAnswer = userAnswers[wordData.word.id];

  // Учитываем предзаполненные пересечения
  const neededLetters = [];
  for (let i = 0; i < wordData.word.length; i++) {
    const letter = wordData.word.kana[i];
    const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
    const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;

    // Проверяем, заполнена ли ячейка
    const cellDom = $(`.grid-cell[data-row="${r}"][data-col="${c}"] .kana-hira`);
    const isActuallyEmpty = !cellDom || !cellDom.dataset.answer;

    if (isActuallyEmpty) {
      neededLetters.push(letter);
    }
  }

  // Добавляем distractors
  const allKana = Object.keys(HIRAGANA_TO_KATAKANA);
  const distractors = [];
  while (distractors.length < 4) {
    const randomKana = allKana[Math.floor(Math.random() * allKana.length)];
    if (!wordData.word.kana.includes(randomKana) && !distractors.includes(randomKana)) {
      distractors.push(randomKana);
    }
  }

  const keyboardLetters = shuffleArray([...neededLetters, ...distractors]);

  keyboard.innerHTML = keyboardLetters
    .map(
      (letter) => `
    <button class="kana-key" data-letter="${letter}">
      <span class="key-hira">${letter}</span>
      <span class="key-kata">${hiraganaToKatakana(letter)}</span>
    </button>
  `
    )
    .join('');

  // Обработчики кнопок
  document.querySelectorAll('.kana-key').forEach((btn) => {
    btn.onclick = () => {
      const letter = btn.dataset.letter;
      insertLetterIntoWord(letter, btn, wordData, userAnswers, grid, placedWords);
    };
  });
}

function insertLetterIntoWord(letter, buttonElement, wordData, userAnswers, grid, placedWords) {
  const wordAnswer = userAnswers[wordData.word.id];
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

  // Скрываем кнопку
  buttonElement.style.opacity = '0.3';
  buttonElement.disabled = true;

  // Проверяем заполненность
  checkWordCompletion(wordData, userAnswers, grid, placedWords);
}

function checkWordCompletion(wordData, userAnswers, grid, placedWords) {
  const { state, dependencies } = window.cwState;
  const { save, markActivity, toast, addXP } = dependencies;

  // Проверяем ВСЕ слова
  placedWords.forEach((pw) => {
    const wordAnswer = userAnswers[pw.word.id];
    if (!wordAnswer) return;

    const allFilled = wordAnswer.filled.every((l) => l !== '');
    if (!allFilled) return;

    const userWord = wordAnswer.filled.join('');
    const correctWord = pw.word.kana;

    if (userWord === correctWord && !wordAnswer.correct) {
      wordAnswer.correct = true;

      const srsCard = state.srs[pw.word.id];
      if (srsCard) {
        if (srsCard.progress === undefined) srsCard.progress = 0;
        if (!wordAnswer.usedHint) {
          srsCard.progress = Math.min(100, srsCard.progress + 8);
        }
      }

      // Подсвечиваем зеленым
      for (let i = 0; i < pw.word.length; i++) {
        const r = pw.direction === 'across' ? pw.row : pw.row + i;
        const c = pw.direction === 'across' ? pw.col + i : pw.col;
        const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
        if (cell) {
          cell.classList.add('correct');
          cell.classList.remove('highlighted');
        }
      }

      // Обновляем классы всех ячеек
      refreshGridCellClasses(placedWords, userAnswers, wordData.word.id);

      // Награда только за активное слово
      if (pw.word.id === wordData.word.id) {
        if (markActivity) markActivity(toast);
        if (addXP) addXP(5);
        toast('✅ Правильно!');

        // Переходим к следующему
        setTimeout(() => {
          const nextWord = findNextIncompleteWord(placedWords, userAnswers);
          if (nextWord) {
            selectWord(nextWord, { grid, placedWords, gridSize: grid.length }, userAnswers);
          } else {
            completeCrossword(placedWords.length, userAnswers);
          }
        }, 1000);
      }
    }
  });

  // Проверка завершения
  const allCompleted = placedWords.every(
    (pw) => userAnswers[pw.word.id] && userAnswers[pw.word.id].correct
  );
  if (allCompleted && !window.crosswordFinished) {
    window.crosswordFinished = true;
    setTimeout(() => {
      completeCrossword(placedWords.length, userAnswers);
    }, 1000);
  }
}

function findNextIncompleteWord(placedWords, userAnswers) {
  for (const pw of placedWords) {
    if (!userAnswers[pw.word.id].correct) {
      return pw;
    }
  }
  return null;
}

function completeCrossword(totalWords, userAnswers) {
  const { state, dependencies } = window.cwState;
  const { save, toast, addXP } = dependencies;

  // Подсчитываем слова
  const wordsWithHint = Object.values(userAnswers).filter((a) => a.correct && a.usedHint).length;
  const wordsWithoutHint = Object.values(userAnswers).filter(
    (a) => a.correct && !a.usedHint
  ).length;

  // Награда
  const xpReward = wordsWithoutHint * 20 + wordsWithHint * 10;
  const coinsReward = Math.floor(xpReward / 10);

  if (addXP) addXP(xpReward);
  state.coins = (state.coins || 0) + coinsReward;
  save();

  toast(`🎉 Кроссворд завершён! +${xpReward} XP, +${coinsReward} монет`);

  // Возвращаемся назад
  setTimeout(() => {
    if (window.nav) window.nav('sensei');
  }, 2000);
}

function refreshGridCellClasses(placedWords, userAnswers, currentWordId) {
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

    const isCorrect = correctWords.length > 0;
    const hasCleanCorrect = correctWords.some((pw) => !userAnswers[pw.word.id].usedHint);
    const isActiveWord = currentWordId && wordsAtCell.some((pw) => pw.word.id === currentWordId);

    cell.classList.remove('highlighted', 'correct', 'correct-hint');
    if (isCorrect) {
      if (hasCleanCorrect) {
        cell.classList.add('correct');
      } else {
        cell.classList.add('correct-hint');
      }
    } else if (isActiveWord) {
      cell.classList.add('highlighted');
    }
  });
}

function findWordAtCell(row, col, placedWords) {
  for (const pw of placedWords) {
    if (pw.direction === 'across') {
      if (pw.row === row && col >= pw.col && col < pw.col + pw.word.length) {
        return pw;
      }
    } else {
      if (pw.col === col && row >= pw.row && row < pw.row + pw.word.length) {
        return pw;
      }
    }
  }
  return null;
}

function getCellIndexInWord(row, col, wordData) {
  if (wordData.direction === 'across') {
    return col - wordData.col;
  } else {
    return row - wordData.row;
  }
}

function initCrosswordZoom() {
  let currentZoom = 40;
  const gridEl = $('#crossword-grid');

  const updateZoom = (delta) => {
    currentZoom = Math.max(30, Math.min(80, currentZoom + delta));
    if (gridEl) gridEl.style.setProperty('--cw-cell-size', `${currentZoom}px`);
  };

  const zoomInBtn = $('#cw-zoom-in');
  const zoomOutBtn = $('#cw-zoom-out');
  if (zoomInBtn) zoomInBtn.onclick = () => updateZoom(5);
  if (zoomOutBtn) zoomOutBtn.onclick = () => updateZoom(-5);
}

// Генератор кроссворда
function generateCrossword(gridSize, state) {
  const maxAttempts = 20;
  let bestResult = null;
  let bestScore = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = tryGenerateCrossword(gridSize, state);

    if (result && result.placedWords.length > bestScore) {
      bestScore = result.placedWords.length;
      bestResult = result;
    }

    if (bestScore >= 6) break;
  }

  return bestResult;
}

function tryGenerateCrossword(gridSize, state) {
  // Собираем разблокированные слова
  const unlockedWords = [];
  const seenKana = new Set();

  LESSONS.forEach((lesson) => {
    lesson.words.forEach((word) => {
      if (isWordUnlocked(word.id, state) && word.writing) {
        if (seenKana.has(word.writing)) return;
        seenKana.add(word.writing);

        unlockedWords.push({
          id: word.id,
          kana: word.writing,
          kanji: word.kanji || word.writing,
          translation: word.translation,
          length: word.writing.length,
        });
      }
    });
  });

  if (unlockedWords.length < 6) return null;

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

      for (let k = 0; k < placedWord.word.length; k++) {
        if (foundIntersection) break;
        const placedLetter = placedWord.word.kana[k];

        for (let wordIdx = 0; wordIdx < availableWords.length; wordIdx++) {
          const word = availableWords[wordIdx];

          for (let j = 0; j < word.length; j++) {
            const wordLetter = word.kana[j];

            if (wordLetter === placedLetter) {
              const newDirection = placedWord.direction === 'across' ? 'down' : 'across';
              let newRow, newCol;

              if (newDirection === 'down') {
                newRow = placedWord.row - j;
                newCol = placedWord.col + k;
              } else {
                newRow = placedWord.row + k;
                newCol = placedWord.col - j;
              }

              if (canPlaceWord(grid, word, newRow, newCol, newDirection, gridSize)) {
                placeWord(grid, word, newRow, newCol, newDirection, wordNumber);
                placedWords.push({
                  word,
                  row: newRow,
                  col: newCol,
                  direction: newDirection,
                  number: wordNumber,
                });
                wordNumber++;

                availableWords.splice(wordIdx, 1);
                foundIntersection = true;
                break;
              }
            }
          }

          if (foundIntersection) break;
        }
      }
    }

    if (!foundIntersection) break;
  }

  // Перенумерация
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c]) {
        grid[r][c].number = null;
      }
    }
  }

  let currentNumber = 1;

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = grid[r][c];
      if (!cell || cell.letter === null) continue;

      const startingWords = placedWords.filter((pw) => pw.row === r && pw.col === c);

      if (startingWords.length > 0) {
        cell.number = currentNumber;
        startingWords.forEach((pw) => {
          pw.number = currentNumber;
        });
        currentNumber++;
      }
    }
  }

  const clues = {
    across: placedWords
      .filter((p) => p.direction === 'across')
      .map((p) => ({
        number: p.number,
        clue: `${p.word.kanji} — ${p.word.translation}`,
      })),
    down: placedWords
      .filter((p) => p.direction === 'down')
      .map((p) => ({
        number: p.number,
        clue: `${p.word.kanji} — ${p.word.translation}`,
      })),
  };

  return { grid, placedWords, clues, gridSize };
}

function canPlaceWord(grid, word, row, col, direction, gridSize) {
  const length = word.length;

  if (direction === 'across') {
    if (col < 0 || col + length > gridSize || row < 0 || row >= gridSize) return false;
  } else {
    if (row < 0 || row + length > gridSize || col < 0 || col >= gridSize) return false;
  }

  if (direction === 'across') {
    if (col > 0 && grid[row][col - 1].letter !== null) return false;
    if (col + length < gridSize && grid[row][col + length].letter !== null) return false;
  } else {
    if (row > 0 && grid[row - 1][col].letter !== null) return false;
    if (row + length < gridSize && grid[row + length][col].letter !== null) return false;
  }

  for (let i = 0; i < length; i++) {
    const r = direction === 'across' ? row : row + i;
    const c = direction === 'across' ? col + i : col;
    const cell = grid[r][c];
    const wordLetter = word.kana[i];

    if (cell.letter !== null) {
      if (cell.letter !== wordLetter) return false;
    } else {
      if (direction === 'across') {
        if (r > 0 && grid[r - 1][c].letter !== null) return false;
        if (r < gridSize - 1 && grid[r + 1][c].letter !== null) return false;
      } else {
        if (c > 0 && grid[r][c - 1].letter !== null) return false;
        if (c < gridSize - 1 && grid[r][c + 1].letter !== null) return false;
      }
    }
  }

  return true;
}

function placeWord(grid, word, row, col, direction, number) {
  for (let i = 0; i < word.length; i++) {
    const r = direction === 'across' ? row : row + i;
    const c = direction === 'across' ? col + i : col;
    grid[r][c].letter = word.kana[i];
    grid[r][c].wordIds.push(word.id);
    if (i === 0) grid[r][c].number = number;
  }
}

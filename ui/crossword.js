/* ui/crossword.js — Crossword puzzle module */

import { $ } from '../src/utils.js';
import { allCards, wordById } from '../src/srs-helpers.js';
import { LESSONS } from './home.js';
import { speakJapanese } from '../src/audio-helper.js';
import { showCompletionScreen } from './shared.js';

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

  // Глобальный обработчик Backspace/Delete
  const handleKeydown = (e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      handleBackspaceDelete(userAnswers, grid, placedWords);
    }
  };
  document.addEventListener('keydown', handleKeydown);

  // Глобальный обработчик для закрытия панели при клике вне
  const handleOutsideClick = (e) => {
    const bottomPanel = $('.crossword-bottom-panel');

    if (!bottomPanel || !bottomPanel.classList.contains('active')) return;

    // Проверяем, был ли клик по играбельной ячейке или по панели
    const isClickOnPlayableCell = e.target.closest('.grid-cell.active');
    const isClickOnPanel = bottomPanel.contains(e.target);

    // Закрываем панель только если клик НЕ на играбельной ячейке И НЕ на панели
    if (!isClickOnPlayableCell && !isClickOnPanel) {
      bottomPanel.classList.remove('active');

      const cluePanel = $('#clue-panel');
      const keyboard = $('#crossword-keyboard');

      if (cluePanel) cluePanel.classList.add('hidden');
      if (keyboard) keyboard.classList.add('hidden');

      window.currentCrosswordWord = null;

      // Убираем подсветку со всех ячеек
      document.querySelectorAll('.grid-cell.highlighted').forEach((cell) => {
        cell.classList.remove('highlighted');
      });
    }
  };
  document.addEventListener('click', handleOutsideClick);

  // Выбрать первое слово автоматически
  if (placedWords.length > 0) {
    selectWord(placedWords[0], crosswordData, userAnswers);
  }
}

function selectWord(wordData, crosswordData, userAnswers) {
  const { grid, placedWords } = crosswordData;

  // GUARD: Абсолютная блокировка при повторном клике на уже активное слово
  if (window.currentCrosswordWord && window.currentCrosswordWord.word.id === wordData.word.id) {
    return; // Полная заморозка клавиатуры — никаких изменений
  }

  // Очищаем сохраненный layout при смене слова
  delete wordData.keyboardLayout;
  delete wordData.keyboardLetterFrequency;

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

  // Центруем viewport на первую ячейку активного слова
  const firstCell = $(`.grid-cell[data-row="${wordData.row}"][data-col="${wordData.col}"]`);
  if (firstCell) {
    firstCell.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });
  }
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

        const wordAnswer = userAnswers[wordData.word.id];
        if (!wordAnswer) return;

        // Блокируем очистку полностью правильных слов
        if (wordAnswer.correct) return;

        // Очищаем все буквы с учетом пересечений и защиты
        for (let i = 0; i < wordData.word.length; i++) {
          // НОВАЯ ПРОВЕРКА: Не очищаем зафиксированные буквы
          if (wordAnswer.lockedIndices && wordAnswer.lockedIndices.has(i)) {
            continue;
          }

          const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
          const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;

          // Проверяем, защищена ли ячейка другим правильным словом
          const cellData = grid[r][c];
          let isProtected = false;

          if (cellData && cellData.wordIds) {
            isProtected = cellData.wordIds.some((wId) => {
              // Пропускаем текущее активное слово
              if (wId === wordData.word.id) return false;
              // Проверяем, правильно ли другое слово
              return userAnswers[wId] && userAnswers[wId].correct;
            });
          }

          // Если ячейка защищена, пропускаем её
          if (isProtected) continue;

          // Очищаем эту ячейку во ВСЕХ пересекающихся словах (кроме защищённых)
          if (cellData && cellData.wordIds) {
            cellData.wordIds.forEach((wId) => {
              const pw = placedWords.find((p) => p.word.id === wId);
              if (pw && userAnswers[wId]) {
                // Не трогаем правильные слова
                if (userAnswers[wId].correct) return;

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

        // НОВАЯ ЛОГИКА: Помечаем hint-букву как зафиксированную и защищённую
        if (!wordAnswer.lockedIndices) {
          wordAnswer.lockedIndices = new Set();
        }
        wordAnswer.lockedIndices.add(randomIndex);

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

        // Обновляем ячейку в DOM с классом hint
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

          // Применяем жёлтую подсветку для hint-буквы
          cell.classList.add('grid-cell-letter-hint');
        }

        // ИСПРАВЛЕНО: Перегенерируем клавиатуру вместо глобального отключения кнопок.
        // Это позволяет корректно учесть использование подсказки и оставить возможность
        // ввода оставшихся дубликатов той же буквы, если они есть в слове
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

  // Показываем клавиатуру
  keyboard.classList.remove('hidden');

  const wordAnswer = userAnswers[wordData.word.id];

  // Проверяем, нужно ли генерировать новый layout
  const needsNewLayout = !wordData.keyboardLayout || !wordData.keyboardLetterFrequency;

  if (needsNewLayout) {
    // Учитываем предзаполненные пересечения и подсчитываем частоту нужных букв
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

    // Подсчитываем частоту каждой буквы (для поддержки повторяющихся символов)
    const letterFrequency = {};
    neededLetters.forEach((letter) => {
      letterFrequency[letter] = (letterFrequency[letter] || 0) + 1;
    });

    // Создаем массив с повторяющимися буквами согласно их частоте
    const neededWithDuplicates = [];
    Object.entries(letterFrequency).forEach(([letter, count]) => {
      for (let i = 0; i < count; i++) {
        neededWithDuplicates.push(letter);
      }
    });

    // Ограничиваем до максимум 8 символов
    const limitedNeeded = neededWithDuplicates.slice(0, 8);

    // Добавляем distractors до ровно 8 символов
    const allKana = Object.keys(HIRAGANA_TO_KATAKANA);
    const distractors = [];
    const targetTotal = 8;
    const distractorCount = targetTotal - limitedNeeded.length;

    while (distractors.length < distractorCount) {
      const randomKana = allKana[Math.floor(Math.random() * allKana.length)];
      if (!wordData.word.kana.includes(randomKana) && !distractors.includes(randomKana)) {
        distractors.push(randomKana);
      }
    }

    // Перемешиваем и гарантируем ровно 8 символов
    const keyboardLetters = shuffleArray([...limitedNeeded, ...distractors]).slice(0, 8);

    // Сохраняем layout и частоту для последующих использований
    wordData.keyboardLayout = keyboardLetters;
    wordData.keyboardLetterFrequency = letterFrequency;
  }

  // Рендерим UI с существующим или новым layout
  keyboard.innerHTML = wordData.keyboardLayout
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
    const letter = btn.dataset.letter;

    // Проверяем, сколько раз эта буква нужна в слове
    const neededCount = wordData.keyboardLetterFrequency[letter] || 0;

    // Подсчитываем, сколько раз уже использована корректно и зафиксирована
    let usedCount = 0;
    for (let i = 0; i < wordData.word.length; i++) {
      // Считаем только правильно размещённые И зафиксированные буквы
      if (
        wordData.word.kana[i] === letter &&
        wordAnswer.filled[i] === letter &&
        wordAnswer.lockedIndices &&
        wordAnswer.lockedIndices.has(i)
      ) {
        usedCount++;
      }
    }

    // Если буква использована полностью, визуально приглушаем
    if (usedCount >= neededCount && neededCount > 0) {
      btn.style.opacity = '0.3';
      btn.disabled = true;
    }

    btn.onclick = (e) => {
      const clickedButton = e.currentTarget;
      const letterToInsert = clickedButton.dataset.letter;
      insertLetterIntoWord(letterToInsert, wordData, userAnswers, grid, placedWords, clickedButton);
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

  // НОВАЯ ЛОГИКА: Немедленная валидация вставленной буквы
  const correctLetter = wordData.word.kana[emptyIndex];
  const isCorrect = (letter === correctLetter);

  if (isCorrect) {
    // Добавляем класс для зеленой подсветки (ручной ввод)
    if (cell) {
      cell.classList.add('grid-cell-letter-manual');
    }

    // Помечаем букву как зафиксированную в userAnswers
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

  // Отключаем только конкретную нажатую кнопку
  if (clickedButton) {
    clickedButton.style.opacity = '0.3';
    clickedButton.disabled = true;
  }

  // Проверяем заполненность
  checkWordCompletion(wordData, userAnswers, grid, placedWords);

  // Центрируем только что заполненную ячейку для плавного следования камеры
  const filledCell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
  if (filledCell) {
    filledCell.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });
  }
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

        // Переходим к следующему
        setTimeout(() => {
          const nextWord = findNextIncompleteWord(placedWords, userAnswers, wordData.word.id);
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

function findNextIncompleteWord(placedWords, userAnswers, currentWordId) {
  // 1. Отфильтровать все нерешённые слова
  const unsolvedWords = placedWords.filter(
    (pw) => userAnswers[pw.word.id] && !userAnswers[pw.word.id].correct
  );
  
  // 2. Исключить текущее слово из пула
  const availableWords = unsolvedWords.filter(
    (pw) => pw.word.id !== currentWordId
  );
  
  // 3. Если есть доступные слова, выбрать случайное
  if (availableWords.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableWords.length);
    return availableWords[randomIndex];
  }
  
  // 4. Если остались только решённые слова, вернуть null
  return null;
}

function completeCrossword(totalWords, userAnswers) {
  const { state, dependencies } = window.cwState;
  const { save, addXP } = dependencies;

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

  // Показываем полноэкранный модал успеха
  showCompletionScreen({
    title: 'おめでとう！',
    subtitle: 'Congratulations!',
    desc: 'Вы успешно завершили кроссворд и получили награды!',
    theme: 'success',
    rewards: [
      { icon: '📖', label: `${wordsWithoutHint} отгадано, ${wordsWithHint} с подсказкой` },
      { icon: '⭐', label: `+${xpReward} XP` },
      { icon: '🪙', label: `+${coinsReward} монет` }
    ],
    onContinue: () => {
      if (window.nav) window.nav('sensei');
    }
  });
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

function handleBackspaceDelete(userAnswers, grid, placedWords) {
  const wordData = window.currentCrosswordWord;
  if (!wordData) return;

  const wordAnswer = userAnswers[wordData.word.id];
  if (!wordAnswer) return;

  // Блокируем удаление из полностью правильных слов
  if (wordAnswer.correct) return;

  // Находим последнюю заполненную ячейку в текущем слове, пропуская защищённые и зафиксированные
  let targetIndex = -1;
  for (let i = wordData.word.length - 1; i >= 0; i--) {
    if (wordAnswer.filled[i] !== '') {
      // НОВАЯ ПРОВЕРКА: Блокируем удаление зафиксированных правильных букв
      if (wordAnswer.lockedIndices && wordAnswer.lockedIndices.has(i)) {
        continue; // Пропускаем зафиксированную букву
      }

      // Вычисляем координаты ячейки
      const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
      const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;

      // Проверяем, защищена ли ячейка другим правильным словом
      const cellData = grid[r][c];
      let isProtected = false;

      if (cellData && cellData.wordIds) {
        isProtected = cellData.wordIds.some((wId) => {
          // Пропускаем текущее активное слово
          if (wId === wordData.word.id) return false;
          // Проверяем, правильно ли другое слово
          return userAnswers[wId] && userAnswers[wId].correct;
        });
      }

      // Если ячейка не защищена, используем её
      if (!isProtected) {
        targetIndex = i;
        break;
      }
    }
  }

  if (targetIndex === -1) return;

  // Вычисляем координаты ячейки для удаления
  const r = wordData.direction === 'across' ? wordData.row : wordData.row + targetIndex;
  const c = wordData.direction === 'across' ? wordData.col + targetIndex : wordData.col;

  // Получаем все слова, проходящие через эту ячейку
  const cellData = grid[r][c];
  if (cellData && cellData.wordIds) {
    // Очищаем эту ячейку во ВСЕХ пересекающихся словах (кроме защищённых)
    cellData.wordIds.forEach((wId) => {
      const pw = placedWords.find((p) => p.word.id === wId);
      if (pw && userAnswers[wId]) {
        // Не трогаем правильные слова
        if (userAnswers[wId].correct) return;

        const cellIdx = getCellIndexInWord(r, c, pw);
        if (cellIdx !== -1) {
          userAnswers[wId].filled[cellIdx] = '';
          userAnswers[wId].correct = false;
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

  // Убираем все классы подсветки с ячейки
  const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
  if (cell) {
    cell.classList.remove('correct', 'correct-hint', 'grid-cell-letter-manual', 'grid-cell-letter-hint');
  }

  // Ревалидация всех затронутых слов
  if (cellData && cellData.wordIds) {
    cellData.wordIds.forEach((wId) => {
      const pw = placedWords.find((p) => p.word.id === wId);
      if (pw && userAnswers[wId]) {
        revalidateWord(pw, userAnswers, grid);
      }
    });
  }

  // Обновляем классы всех ячеек
  refreshGridCellClasses(placedWords, userAnswers, wordData.word.id);

  // Перегенерируем клавиатуру
  generateKeyboard(wordData, userAnswers, grid, placedWords);

  // Центрируем только что очищенную ячейку (новая позиция курсора)
  const clearedCell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
  if (clearedCell) {
    clearedCell.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center'
    });
  }
}

function revalidateWord(wordData, userAnswers, grid) {
  const wordAnswer = userAnswers[wordData.word.id];
  if (!wordAnswer) return;

  const allFilled = wordAnswer.filled.every((l) => l !== '');
  if (!allFilled) {
    wordAnswer.correct = false;
    // Убираем подсветку со всех ячеек этого слова
    for (let i = 0; i < wordData.word.length; i++) {
      const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
      const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;
      const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
      if (cell) {
        cell.classList.remove('correct', 'correct-hint');
      }
    }
    return;
  }

  const userWord = wordAnswer.filled.join('');
  const correctWord = wordData.word.kana;

  if (userWord === correctWord && !wordAnswer.correct) {
    wordAnswer.correct = true;
    // Подсвечиваем заново
    for (let i = 0; i < wordData.word.length; i++) {
      const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
      const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;
      const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
      if (cell) {
        if (wordAnswer.usedHint) {
          cell.classList.add('correct-hint');
        } else {
          cell.classList.add('correct');
        }
      }
    }
  } else if (userWord !== correctWord) {
    wordAnswer.correct = false;
    // Убираем подсветку
    for (let i = 0; i < wordData.word.length; i++) {
      const r = wordData.direction === 'across' ? wordData.row : wordData.row + i;
      const c = wordData.direction === 'across' ? wordData.col + i : wordData.col;
      const cell = $(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
      if (cell) {
        cell.classList.remove('correct', 'correct-hint');
      }
    }
  }
}

function initCrosswordZoom() {
  let currentScale = 1.0;
  const gridEl = $('#crossword-grid');
  const viewport = $('#crossword-viewport');

  const updateZoom = (delta) => {
    currentScale = Math.max(0.6, Math.min(2.0, currentScale + delta));
    if (gridEl) {
      gridEl.style.transform = `scale(${currentScale})`;
    }
  };

  // Центрируем сетку при загрузке
  if (viewport && gridEl) {
    setTimeout(() => {
      const scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      const scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
      viewport.scrollLeft = scrollLeft;
      viewport.scrollTop = scrollTop;
    }, 100);
  }

  const zoomInBtn = $('#cw-zoom-in');
  const zoomOutBtn = $('#cw-zoom-out');
  if (zoomInBtn) zoomInBtn.onclick = () => updateZoom(0.2);
  if (zoomOutBtn) zoomOutBtn.onclick = () => updateZoom(-0.2);
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
                // Создаем временную копию для проверки
                const tempGrid = JSON.parse(JSON.stringify(grid));
                const tempPlacedWords = [...placedWords];

                placeWord(tempGrid, word, newRow, newCol, newDirection, wordNumber);
                tempPlacedWords.push({
                  word,
                  row: newRow,
                  col: newCol,
                  direction: newDirection,
                  number: wordNumber,
                });

                // Постпроверка валидности сетки
                if (validateGridIntegrity(tempGrid, tempPlacedWords, gridSize)) {
                  // Все в порядке, применяем изменения к реальной сетке
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
                // Если валидация не прошла, продолжаем поиск другого места
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
  // Строгая валидация: используем реальную длину kana
  if (!word.kana || word.kana.length === 0) {
    return false;
  }

  const actualLength = word.kana.length;

  // Проверка границ сетки с реальной длиной
  if (direction === 'across') {
    if (col < 0 || col + actualLength > gridSize || row < 0 || row >= gridSize) return false;
  } else {
    if (row < 0 || row + actualLength > gridSize || col < 0 || col >= gridSize) return false;
  }

  // Проверка пустоты перед началом и после конца слова
  if (direction === 'across') {
    if (col > 0 && grid[row][col - 1].letter !== null) return false;
    if (col + actualLength < gridSize && grid[row][col + actualLength].letter !== null)
      return false;
  } else {
    if (row > 0 && grid[row - 1][col].letter !== null) return false;
    if (row + actualLength < gridSize && grid[row + actualLength][col].letter !== null)
      return false;
  }

  let intersectionCount = 0;

  for (let i = 0; i < actualLength; i++) {
    const r = direction === 'across' ? row : row + i;
    const c = direction === 'across' ? col + i : col;
    const cell = grid[r][c];
    const wordLetter = word.kana[i];

    if (cell.letter !== null) {
      // Ячейка занята — проверяем совпадение буквы
      if (cell.letter !== wordLetter) {
        return false;
      }
      intersectionCount++;
    } else {
      // Ячейка пустая — проверяем соседние ячейки
      // (но разрешаем пересечения перпендикулярных слов)
      if (direction === 'across') {
        // Проверяем верх и низ
        if (r > 0 && grid[r - 1][c].letter !== null) {
          return false;
        }
        if (r < gridSize - 1 && grid[r + 1][c].letter !== null) {
          return false;
        }
      } else {
        // Проверяем лево и право
        if (c > 0 && grid[r][c - 1].letter !== null) {
          return false;
        }
        if (c < gridSize - 1 && grid[r][c + 1].letter !== null) {
          return false;
        }
      }
    }
  }

  // Требование: минимум одно пересечение (кроме первого слова)
  // Это условие проверяется на уровне алгоритма размещения
  return intersectionCount >= 1;
}

function placeWord(grid, word, row, col, direction, number) {
  const actualLength = word.kana.length;

  for (let i = 0; i < actualLength; i++) {
    const r = direction === 'across' ? row : row + i;
    const c = direction === 'across' ? col + i : col;
    grid[r][c].letter = word.kana[i];
    grid[r][c].wordIds.push(word.id);
    if (i === 0) grid[r][c].number = number;
  }
}

/**
 * Валидация целостности сетки после размещения слова
 * Проверяет, что все размещенные слова соответствуют своим координатам и длинам
 */
function validateGridIntegrity(grid, placedWords, gridSize) {
  for (const pw of placedWords) {
    const { word, row, col, direction } = pw;
    const actualLength = word.kana.length;

    // Проверка границ
    if (direction === 'across') {
      if (col < 0 || col + actualLength > gridSize || row < 0 || row >= gridSize) {
        return false;
      }
    } else {
      if (row < 0 || row + actualLength > gridSize || col < 0 || col >= gridSize) {
        return false;
      }
    }

    // Проверка соответствия букв
    for (let i = 0; i < actualLength; i++) {
      const r = direction === 'across' ? row : row + i;
      const c = direction === 'across' ? col + i : col;
      const cell = grid[r][c];

      if (!cell || cell.letter !== word.kana[i]) {
        return false;
      }

      // Проверка, что wordId присутствует в ячейке
      if (!cell.wordIds.includes(word.id)) {
        return false;
      }
    }

    // Проверка, что в ячейке не более 2 слов (одно горизонтальное, одно вертикальное)
    for (let i = 0; i < actualLength; i++) {
      const r = direction === 'across' ? row : row + i;
      const c = direction === 'across' ? col + i : col;
      const cell = grid[r][c];

      if (cell.wordIds.length > 2) {
        return false;
      }
    }
  }

  return true;
}

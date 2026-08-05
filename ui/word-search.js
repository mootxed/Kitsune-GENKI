/* ui/word-search.js — Word Search mini-game UI module */

import { $ } from '../src/utils.js';
import { WORD_SEARCH_DIFFICULTIES, generateWordSearchGrid } from '../src/word-search-generator.js';
import {
  getAvailableWordSearchCandidates,
  getWeakWordSearchCandidates,
} from '../src/minigame-word-selectors.js';
import { selectMiniGameWords, recordGameSession } from '../src/minigame-word-rotation.js';
import { speakJapanese, stopSpeaking } from '../src/audio-helper.js';
import { showCompletionScreen } from './shared.js';
import { LESSONS } from './home.js';
import { setSafeHTML } from '../src/security-helpers.js';

let activeCleanup = null;

export const PALETTE = Object.freeze([
  { id: 0, bg: '#c8e6c9', ink: '#1b5e20', border: '#4caf50', softBg: 'rgba(76, 175, 80, 0.15)' },
  { id: 1, bg: '#bbdefb', ink: '#0d47a1', border: '#2196f3', softBg: 'rgba(33, 150, 243, 0.15)' },
  { id: 2, bg: '#ffe0b2', ink: '#e65100', border: '#ff9800', softBg: 'rgba(255, 152, 0, 0.15)' },
  { id: 3, bg: '#e1bee7', ink: '#4a148c', border: '#9c27b0', softBg: 'rgba(156, 39, 176, 0.15)' },
  { id: 4, bg: '#f8bbd0', ink: '#880e4f', border: '#e91e63', softBg: 'rgba(233, 30, 99, 0.15)' },
  { id: 5, bg: '#b2dfdb', ink: '#004d40', border: '#009688', softBg: 'rgba(0, 150, 136, 0.15)' },
  { id: 6, bg: '#fff9c4', ink: '#f57f17', border: '#fbc02d', softBg: 'rgba(251, 192, 45, 0.18)' },
  { id: 7, bg: '#c5cae9', ink: '#1a237e', border: '#3f51b5', softBg: 'rgba(63, 81, 181, 0.15)' },
  { id: 8, bg: '#ffccbc', ink: '#bf360c', border: '#ff5722', softBg: 'rgba(255, 87, 34, 0.15)' },
  { id: 9, bg: '#dbedc6', ink: '#33691e', border: '#8bc34a', softBg: 'rgba(139, 195, 74, 0.15)' },
]);

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function cleanupWordSearch() {
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = '';

  document.body.classList.remove('ws-focus-mode');

  if (typeof stopSpeaking === 'function') {
    try {
      stopSpeaking();
    } catch {
      // Ignore audio stop errors
    }
  }

  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }
}

/**
 * Main entry point for Word Search route.
 * Shows Mode & Difficulty Selection screen on initial enter.
 */
export function renderWordSearch(state, dependencies = {}) {
  cleanupWordSearch();
  renderDifficultySelectionScreen(state, dependencies);
}

/**
 * Renders the Mode & Difficulty Selection screen.
 *
 * @param {Object} state
 * @param {Object} dependencies
 * @param {string} [mode='normal'] - 'normal' | 'weak'
 */
export function renderDifficultySelectionScreen(state, dependencies = {}, mode = 'normal') {
  cleanupWordSearch();

  const body = $('#word-search-body');
  if (!body) return;

  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = '';

  const lessons = dependencies.lessons || LESSONS || [];
  const normalCandidates = getAvailableWordSearchCandidates(state, lessons);
  const weakCandidates = getWeakWordSearchCandidates(state, lessons);

  const isWeakMode = mode === 'weak';
  const availableCount = isWeakMode ? weakCandidates.length : normalCandidates.length;

  const difficulties = [
    WORD_SEARCH_DIFFICULTIES.easy,
    WORD_SEARCH_DIFFICULTIES.medium,
    WORD_SEARCH_DIFFICULTIES.hard,
  ];

  // If weak mode has insufficient words for even easy mode (< 4), show empty state
  if (isWeakMode && availableCount < 4) {
    const isTotalEmpty = normalCandidates.length === 0;

    setSafeHTML(
      body,
      `
      <div class="ws-difficulty-container" data-testid="ws-difficulty-screen">
        <div class="ws-mode-switcher" data-testid="ws-mode-switcher">
          <button class="ws-mode-btn ${!isWeakMode ? 'active' : ''}" data-mode="normal" aria-pressed="${!isWeakMode}">
            Все слова
          </button>
          <button class="ws-mode-btn ${isWeakMode ? 'active' : ''}" data-mode="weak" aria-pressed="${isWeakMode}">
            🩹 Слабые слова
          </button>
        </div>

        <div class="empty-state" data-testid="word-search-weak-empty" style="margin-top:24px;">
          <span style="font-size:60px">🩹</span>
          <h3>${isTotalEmpty ? 'Откройте больше глав' : 'Слабых слов пока недостаточно'}</h3>
          <p>${
            isTotalEmpty
              ? 'Откройте или отметьте изученными больше глав'
              : 'Продолжайте занятия в SRS — слова с ошибками появятся здесь автоматически'
          }</p>
          <button class="ws-btn ws-btn-primary" id="ws-switch-to-normal-btn" style="margin-top:16px;">
            Играть со всеми словами
          </button>
        </div>
      </div>
    `
    );

    const normalModeBtn = body.querySelector('.ws-mode-btn[data-mode="normal"]');
    if (normalModeBtn) {
      normalModeBtn.onclick = () => renderDifficultySelectionScreen(state, dependencies, 'normal');
    }
    const switchToNormalBtn = $('#ws-switch-to-normal-btn');
    if (switchToNormalBtn) {
      switchToNormalBtn.onclick = () =>
        renderDifficultySelectionScreen(state, dependencies, 'normal');
    }
    return;
  }

  setSafeHTML(
    body,
    `
    <div class="ws-difficulty-container" data-testid="ws-difficulty-screen">
      <div class="ws-mode-switcher" data-testid="ws-mode-switcher">
        <button class="ws-mode-btn ${!isWeakMode ? 'active' : ''}" data-mode="normal" aria-pressed="${!isWeakMode}">
          Все слова
        </button>
        <button class="ws-mode-btn ${isWeakMode ? 'active' : ''}" data-mode="weak" aria-pressed="${isWeakMode}">
          🩹 Слабые слова
        </button>
      </div>
      <p class="ws-mode-description">
        ${
          isWeakMode
            ? `Слова, в которых были ошибки или низкая уверенность • Доступно слабых слов: ${availableCount}`
            : 'Слова из доступных вам глав'
        }
      </p>

      <div class="ws-difficulty-header">
        <h2>Выберите сложность</h2>
        <p>Найдите японские слова в сетке по их русскому переводу</p>
      </div>

      <div class="ws-difficulty-cards">
        ${difficulties
          .map((d) => {
            const minRequired = d.minCount || d.targetCount;
            const isInsufficient = isWeakMode && availableCount < minRequired;
            const missing = minRequired - availableCount;

            return `
          <div class="ws-difficulty-card ${d.recommended && !isInsufficient ? 'recommended' : ''} ${
            isInsufficient ? 'disabled' : ''
          }" data-difficulty-id="${d.id}" data-testid="ws-diff-card-${d.id}">
            ${
              d.recommended && !isInsufficient
                ? '<span class="ws-badge-recommended">★ Рекомендуется</span>'
                : ''
            }
            <div class="ws-diff-icon">${d.icon}</div>
            <div class="ws-diff-info">
              <h3>${escapeHtml(d.label)}</h3>
              <div class="ws-diff-meta">Сетка ${d.gridSize}×${d.gridSize} • ${d.targetCount} слов</div>
              <p>${escapeHtml(d.description)}</p>
              ${
                isInsufficient
                  ? `<div class="ws-diff-warning">Нужно ещё ${missing} слабых слов</div>`
                  : ''
              }
            </div>
            <button class="ws-btn ws-btn-primary ws-diff-select-btn" ${
              isInsufficient ? 'disabled aria-disabled="true"' : ''
            }>
              ${isInsufficient ? `Недостаточно слов` : 'Начать игру'}
            </button>
          </div>
        `;
          })
          .join('')}
      </div>
    </div>
  `
  );

  // Mode switcher listeners
  const modeBtns = body.querySelectorAll('.ws-mode-btn');
  modeBtns.forEach((btn) => {
    btn.onclick = () => {
      const selectedMode = btn.dataset.mode;
      renderDifficultySelectionScreen(state, dependencies, selectedMode);
    };
  });

  // Difficulty selection listeners
  const cards = body.querySelectorAll('.ws-difficulty-card:not(.disabled)');
  cards.forEach((card) => {
    card.onclick = () => {
      const diffId = card.dataset.difficultyId;
      startWordSearchGame(state, dependencies, diffId, mode);
    };
  });
}

/**
 * Starts a Word Search game batch with specified difficulty and mode.
 */
export function startWordSearchGame(
  state,
  dependencies = {},
  difficultyId = 'medium',
  mode = 'normal'
) {
  cleanupWordSearch();

  const body = $('#word-search-body');
  if (!body) return;

  const isWeakMode = mode === 'weak';
  const diffConfig = WORD_SEARCH_DIFFICULTIES[difficultyId] || WORD_SEARCH_DIFFICULTIES.medium;
  const lessons = dependencies.lessons || LESSONS || [];
  const toast = dependencies.toast || window.toast || (() => {});
  const save = dependencies.save || (() => {});

  // Enable focus mode (hide tabbar)
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';
  document.body.classList.add('ws-focus-mode');

  // 1. Retrieve candidate pool based on mode using shared rotation selector
  const candidates = isWeakMode
    ? getWeakWordSearchCandidates(state, lessons)
    : getAvailableWordSearchCandidates(state, lessons);

  const selectedPool = selectMiniGameWords(candidates, {
    gameId: 'wordSearch',
    count: diffConfig.targetCount + 4,
    mode,
    history: state,
  });

  // 2. Generate word search grid for exact difficulty
  const gameData = generateWordSearchGrid(selectedPool, {
    gridSize: diffConfig.gridSize,
    targetCount: diffConfig.targetCount,
    minCount: diffConfig.minCount,
  });

  // Check if grid generation succeeded
  if (
    !gameData.success ||
    !gameData.placedWords ||
    gameData.placedWords.length < diffConfig.minCount
  ) {
    setSafeHTML(
      body,
      `
      <div class="empty-state" data-testid="word-search-empty">
        <span style="font-size:60px">${isWeakMode ? '🩹' : '🔍'}</span>
        <h3>${isWeakMode ? 'Не удалось составить игру' : 'Недостаточно подходящих слов'}</h3>
        <p>${
          isWeakMode
            ? 'Не удалось составить игру из текущего набора слабых слов.'
            : `Для сложности «${escapeHtml(diffConfig.label)}» требуется больше слов. Начните больше глав или добавьте слова в SRS.`
        }</p>
        <button class="ws-btn ws-btn-secondary" id="ws-change-diff-empty-btn" style="margin-top:16px;">
          ${isWeakMode ? 'Перейти в обычный режим' : '⚙️ Сменить сложность'}
        </button>
      </div>
    `
    );

    const changeDiffBtn = $('#ws-change-diff-empty-btn');
    if (changeDiffBtn) {
      changeDiffBtn.onclick = () =>
        renderDifficultySelectionScreen(state, dependencies, isWeakMode ? 'normal' : mode);
    }
    return;
  }

  const { grid, placedWords, gridSize } = gameData;

  // Record placed words into rotation history for active mode
  recordGameSession(
    state,
    'wordSearch',
    placedWords.map((pw) => pw.id),
    mode
  );

  // Local Game State
  const gameState = {
    mode,
    difficultyId,
    diffConfig,
    grid,
    placedWords,
    gridSize,
    foundWordIds: new Set(),
    wrongAttempts: 0,
    hintsUsed: 0,
    maxHints: 3,
    startedAt: Date.now(),
    completed: false,
    xpAwarded: false,
    activePath: [],
    startCell: null,
    pointerId: null,
    timerInterval: null,
    hintTimeout: null,
  };

  const badgeText = isWeakMode
    ? `🩹 Слабые слова · ${escapeHtml(diffConfig.label)}`
    : `Все слова · ${escapeHtml(diffConfig.label)}`;

  // Build Game UI Markup (Compact HUD + Clue Strip + Grid)
  setSafeHTML(
    body,
    `
    <div class="ws-container" data-difficulty="${escapeHtml(difficultyId)}" data-mode="${escapeHtml(mode)}" data-testid="word-search-game">
      <!-- Header Info Bar (Single Line Compact HUD) -->
      <div class="ws-info-bar">
        <div class="ws-info-left">
          <span class="ws-diff-badge" data-testid="ws-diff-badge">${badgeText}</span>
          <div class="ws-counter" data-testid="ws-counter" aria-label="Прогресс">
            <span id="ws-found-count">0</span> / ${placedWords.length}
          </div>
        </div>

        <div class="ws-controls">
          <button class="ws-icon-btn ws-btn-hint" id="ws-hint-btn" data-testid="ws-hint-btn" aria-label="Подсказка (${gameState.maxHints} осталось)" title="Подсказка (${gameState.maxHints} осталось)">
            💡 <span id="ws-hints-left">${gameState.maxHints}</span>
          </button>
          <button class="ws-icon-btn" id="ws-new-game-btn" data-testid="ws-new-game-btn" aria-label="Новая игра" title="Новая игра">
            🔄
          </button>
          <button class="ws-icon-btn" id="ws-change-diff-btn" data-testid="ws-change-diff-btn" aria-label="Сменить сложность" title="Сменить сложность">
            ⚙️
          </button>
        </div>
      </div>

      <!-- Translations Strip (Compact Fixed Height Panel, 2 Rows Grid) -->
      <div class="ws-clue-strip ws-translations-list" id="ws-translations-list" data-testid="ws-translations-list">
        ${placedWords
          .map(
            (pw) => `
          <div class="ws-clue-card ws-translation-item" data-word-id="${pw.id}" data-color-index="${pw.colorIndex || 0}" data-testid="ws-translation-${pw.id}" title="${escapeHtml(pw.translation)}">
            <span class="ws-clue-check ws-status-icon">✓</span>
            <span class="ws-clue-translation ws-translation-text">${escapeHtml(pw.translation)}</span>
          </div>
        `
          )
          .join('')}
      </div>

      <!-- Letter Grid Container -->
      <div class="ws-grid-wrapper">
        <div class="ws-grid" id="ws-grid" style="--grid-size: ${gridSize}; grid-template-columns: repeat(${gridSize}, 1fr); grid-template-rows: repeat(${gridSize}, 1fr);" data-testid="ws-grid" tabIndex="0" role="grid" aria-label="Сетка поиска слов">
          ${grid
            .flatMap((row, rIdx) =>
              row.map(
                (cell, cIdx) => `
              <div class="ws-cell" data-row="${rIdx}" data-col="${cIdx}" data-testid="ws-cell-${rIdx}-${cIdx}" role="gridcell">
                <span class="ws-char">${cell.char}</span>
              </div>
            `
              )
            )
            .join('')}
        </div>
      </div>
    </div>
  `
  );

  // UI Element References
  const gridEl = $('#ws-grid');
  const foundCountEl = $('#ws-found-count');
  const hintBtn = $('#ws-hint-btn');
  const hintsLeftEl = $('#ws-hints-left');
  const newGameBtn = $('#ws-new-game-btn');
  const changeDiffBtn = $('#ws-change-diff-btn');

  function getCellEl(row, col) {
    return gridEl?.querySelector(`.ws-cell[data-row="${row}"][data-col="${col}"]`);
  }

  function getCellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cellEl = el?.closest('.ws-cell');
    if (!cellEl) return null;
    const r = parseInt(cellEl.dataset.row, 10);
    const c = parseInt(cellEl.dataset.col, 10);
    if (Number.isInteger(r) && Number.isInteger(c)) {
      return { row: r, col: c };
    }
    return null;
  }

  function isValidDirection(r1, c1, r2, c2) {
    const dr = r2 - r1;
    const dc = c2 - c1;
    return dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
  }

  function getLineCells(r1, c1, r2, c2) {
    const dr = Math.sign(r2 - r1);
    const dc = Math.sign(c2 - c1);
    const steps = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
    const cells = [];
    for (let i = 0; i <= steps; i++) {
      cells.push({ row: r1 + dr * i, col: c1 + dc * i });
    }
    return cells;
  }

  function updateCellFoundVisual(row, col) {
    const cellEl = getCellEl(row, col);
    if (!cellEl) return;
    const indexes = Array.from(grid[row][col].foundColorIndexes);
    if (indexes.length === 0) {
      cellEl.classList.remove('ws-cell-found');
      cellEl.style.background = '';
      cellEl.style.borderColor = '';
      cellEl.style.color = '';
      return;
    }

    cellEl.classList.add('ws-cell-found');
    const firstColor = PALETTE[indexes[0] % PALETTE.length];

    if (indexes.length === 1) {
      cellEl.style.background = firstColor.bg;
      cellEl.style.borderColor = firstColor.border;
      cellEl.style.color = firstColor.ink;
    } else {
      // Split background gradient for overlapping words
      const colors = indexes.map((i) => PALETTE[i % PALETTE.length].bg);
      const step = 100 / colors.length;
      const gradientParts = colors.map(
        (c, idx) => `${c} ${idx * step}%, ${c} ${(idx + 1) * step}%`
      );
      cellEl.style.background = `linear-gradient(135deg, ${gradientParts.join(', ')})`;
      cellEl.style.borderColor = firstColor.border;
      cellEl.style.color = firstColor.ink;
    }
  }

  function clearActiveSelection() {
    gridEl?.querySelectorAll('.ws-cell-active').forEach((el) => {
      el.classList.remove('ws-cell-active');
    });
  }

  function renderActiveSelection(path) {
    clearActiveSelection();
    path.forEach(({ row, col }) => {
      const cellEl = getCellEl(row, col);
      if (cellEl) {
        cellEl.classList.add('ws-cell-active');
      }
    });
  }

  // Grid Pointer Selection Handlers
  function onPointerDown(e) {
    if (gameState.completed) return;
    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (!cell) return;

    try {
      gridEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture fallback
    }

    gameState.pointerId = e.pointerId;
    gameState.startCell = cell;
    gameState.activePath = [cell];
    renderActiveSelection(gameState.activePath);
  }

  function onPointerMove(e) {
    if (gameState.pointerId === null || !gameState.startCell) return;
    const currentCell = getCellFromPoint(e.clientX, e.clientY);
    if (!currentCell) return;

    const { row: r1, col: c1 } = gameState.startCell;
    const { row: r2, col: c2 } = currentCell;

    if (isValidDirection(r1, c1, r2, c2)) {
      gameState.activePath = getLineCells(r1, c1, r2, c2);
      renderActiveSelection(gameState.activePath);
    }
  }

  function onPointerUp() {
    if (gameState.pointerId === null || gameState.activePath.length === 0) return;

    if (gameState.pointerId !== null) {
      try {
        gridEl.releasePointerCapture(gameState.pointerId);
      } catch {
        // Ignore release capture errors
      }
    }

    const currentPath = [...gameState.activePath];
    const selectedKana = currentPath.map(({ row, col }) => grid[row][col].char).join('');

    // Find matching un-found placed word
    const matchedWord = placedWords.find((pw) => {
      if (gameState.foundWordIds.has(pw.id)) return false;
      if (pw.kana !== selectedKana) return false;
      if (pw.cells.length !== currentPath.length) return false;

      return pw.cells.every(
        (cell, idx) => cell.row === currentPath[idx].row && cell.col === currentPath[idx].col
      );
    });

    if (matchedWord) {
      // Correct answer!
      gameState.foundWordIds.add(matchedWord.id);
      const colorItem = PALETTE[matchedWord.colorIndex % PALETTE.length];

      // Mark cells and update multi-color sets
      matchedWord.cells.forEach(({ row, col }) => {
        grid[row][col].foundColorIndexes.add(matchedWord.colorIndex);
        updateCellFoundVisual(row, col);
      });

      // Update translation card with matching word color & status checkmark
      const transItem = body.querySelector(
        `.ws-translation-item[data-word-id="${matchedWord.id}"]`
      );
      if (transItem) {
        transItem.classList.add('ws-found');
        transItem.style.borderColor = colorItem.border;
        transItem.style.backgroundColor = colorItem.softBg;
        transItem.style.color = colorItem.ink;
        transItem.setAttribute(
          'aria-label',
          `Прослушать найденное слово: ${matchedWord.translation}`
        );
      }

      // Voice audio
      speakJapanese(matchedWord.kana);

      // Counter
      if (foundCountEl) {
        foundCountEl.textContent = String(gameState.foundWordIds.size);
      }

      toast(`✨ Найдено: ${matchedWord.translation}`);

      // Check completion
      if (gameState.foundWordIds.size === placedWords.length) {
        completeGame();
      }
    } else {
      // Wrong attempt
      gameState.wrongAttempts++;
      currentPath.forEach(({ row, col }) => {
        const cellEl = getCellEl(row, col);
        if (cellEl && !grid[row][col].foundColorIndexes.size) {
          cellEl.classList.add('ws-cell-wrong');
        }
      });

      setTimeout(() => {
        currentPath.forEach(({ row, col }) => {
          const cellEl = getCellEl(row, col);
          if (cellEl) {
            cellEl.classList.remove('ws-cell-wrong');
          }
        });
      }, 350);
    }

    clearActiveSelection();
    gameState.startCell = null;
    gameState.activePath = [];
    gameState.pointerId = null;
  }

  function onPointerCancel() {
    if (gameState.pointerId !== null) {
      try {
        gridEl.releasePointerCapture(gameState.pointerId);
      } catch {
        // Ignore capture release errors
      }
    }
    clearActiveSelection();
    gameState.startCell = null;
    gameState.activePath = [];
    gameState.pointerId = null;
  }

  // Register grid pointer listeners
  gridEl.addEventListener('pointerdown', onPointerDown);
  gridEl.addEventListener('pointermove', onPointerMove);
  gridEl.addEventListener('pointerup', onPointerUp);
  gridEl.addEventListener('pointercancel', onPointerCancel);

  // Click translation item to listen to voice
  const translationItems = body.querySelectorAll('.ws-translation-item');
  translationItems.forEach((item) => {
    item.onclick = () => {
      if (!item.classList.contains('ws-found')) return;
      const wordId = item.dataset.wordId;
      const word = placedWords.find((w) => w.id === wordId);
      if (word && word.kana) {
        speakJapanese(word.kana);
      }
    };
  });

  // Hint button
  hintBtn.onclick = () => {
    if (gameState.completed) return;
    if (gameState.hintsUsed >= gameState.maxHints) {
      toast('🔒 Достигнут лимит подсказок');
      return;
    }

    const unfoundWords = placedWords.filter((w) => !gameState.foundWordIds.has(w.id));
    if (unfoundWords.length === 0) return;

    const pickedWord = unfoundWords[Math.floor(Math.random() * unfoundWords.length)];
    gameState.hintsUsed++;

    const hintsLeft = gameState.maxHints - gameState.hintsUsed;
    if (hintsLeftEl) {
      hintsLeftEl.textContent = String(hintsLeft);
    }

    if (hintsLeft <= 0) {
      hintBtn.disabled = true;
      hintBtn.setAttribute('aria-disabled', 'true');
    }

    hintBtn.setAttribute('aria-label', `Подсказка (${hintsLeft} осталось)`);
    hintBtn.setAttribute('title', `Подсказка (${hintsLeft} осталось)`);

    // Highlight starting cell for 1.5s
    const firstCellEl = getCellEl(pickedWord.startRow, pickedWord.startCol);
    if (firstCellEl) {
      firstCellEl.classList.add('ws-cell-hint');
      if (gameState.hintTimeout) clearTimeout(gameState.hintTimeout);
      gameState.hintTimeout = setTimeout(() => {
        firstCellEl.classList.remove('ws-cell-hint');
      }, 1500);
    }
  };

  // Header controls
  newGameBtn.onclick = () => startWordSearchGame(state, dependencies, difficultyId, mode);
  changeDiffBtn.onclick = () => renderDifficultySelectionScreen(state, dependencies, mode);

  // Completion
  function completeGame() {
    gameState.completed = true;
    const durationSec = Math.floor((Date.now() - gameState.startedAt) / 1000);

    if (!gameState.xpAwarded) {
      gameState.xpAwarded = true;
      if (typeof state.xp === 'number') {
        state.xp += 10;
      } else {
        state.xp = 10;
      }
      save();
    }

    const completionDesc = isWeakMode
      ? `Режим: Слабые слова · Сложность: ${diffConfig.label}`
      : `Режим: Все слова · Сложность: ${diffConfig.label}`;

    // Call global completion screen from ui/shared.js
    showCompletionScreen({
      title: 'みつけた！',
      subtitle: 'Все слова найдены',
      desc: completionDesc,
      theme: 'success',
      rewards: [
        { icon: '🔍', label: `${placedWords.length} слов` },
        { icon: '⏱️', label: formatTime(durationSec) },
        { icon: '❌', label: `${gameState.wrongAttempts} ошибок` },
        { icon: '💡', label: `${gameState.hintsUsed} подсказок` },
        { icon: '⭐', label: '+10 XP' },
      ],
      onContinue: () => {
        cleanupWordSearch();
        renderDifficultySelectionScreen(state, dependencies, mode);
      },
    });
  }

  // Cleanup handler
  activeCleanup = () => {
    gridEl.removeEventListener('pointerdown', onPointerDown);
    gridEl.removeEventListener('pointermove', onPointerMove);
    gridEl.removeEventListener('pointerup', onPointerUp);
    gridEl.removeEventListener('pointercancel', onPointerCancel);
    if (gameState.hintTimeout) clearTimeout(gameState.hintTimeout);
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  };
}

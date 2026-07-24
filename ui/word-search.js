/* ui/word-search.js — Word Search mini-game UI module */

import { $ } from '../src/utils.js';
import { WORD_SEARCH_DIFFICULTIES, generateWordSearchGrid } from '../src/word-search-generator.js';
import { getAvailableWordSearchCandidates } from '../src/word-search-selectors.js';
import { speakJapanese } from '../src/audio-helper.js';
import { LESSONS } from './home.js';

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
  if (typeof activeCleanup === 'function') {
    activeCleanup();
    activeCleanup = null;
  }
}

/**
 * Main entry point for Word Search route.
 * Shows Difficulty Selection screen on initial enter.
 */
export function renderWordSearch(state, dependencies = {}) {
  cleanupWordSearch();
  renderDifficultySelectionScreen(state, dependencies);
}

/**
 * Renders the Difficulty Selection screen.
 */
export function renderDifficultySelectionScreen(state, dependencies = {}) {
  cleanupWordSearch();

  const body = $('#word-search-body');
  if (!body) return;

  const difficulties = [
    WORD_SEARCH_DIFFICULTIES.easy,
    WORD_SEARCH_DIFFICULTIES.medium,
    WORD_SEARCH_DIFFICULTIES.hard,
  ];

  body.innerHTML = `
    <div class="ws-difficulty-container" data-testid="ws-difficulty-screen">
      <div class="ws-difficulty-header">
        <h2>Выберите сложность</h2>
        <p>Найдите японские слова в сетке по их русскому переводу</p>
      </div>

      <div class="ws-difficulty-cards">
        ${difficulties
          .map(
            (d) => `
          <div class="ws-difficulty-card ${d.recommended ? 'recommended' : ''}" data-difficulty-id="${d.id}" data-testid="ws-diff-card-${d.id}">
            ${d.recommended ? '<span class="ws-badge-recommended">★ Рекомендуется</span>' : ''}
            <div class="ws-diff-icon">${d.icon}</div>
            <div class="ws-diff-info">
              <h3>${escapeHtml(d.label)}</h3>
              <div class="ws-diff-meta">Сетка ${d.gridSize}×${d.gridSize} • ${d.targetCount} слов</div>
              <p>${escapeHtml(d.description)}</p>
            </div>
            <button class="ws-btn ws-btn-primary ws-diff-select-btn">Начать игра</button>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;

  const cards = body.querySelectorAll('.ws-difficulty-card');
  cards.forEach((card) => {
    card.onclick = () => {
      const diffId = card.dataset.difficultyId;
      startWordSearchGame(state, dependencies, diffId);
    };
  });
}

/**
 * Starts a Word Search game batch with specified difficulty.
 */
export function startWordSearchGame(state, dependencies = {}, difficultyId = 'medium') {
  cleanupWordSearch();

  const body = $('#word-search-body');
  if (!body) return;

  const diffConfig = WORD_SEARCH_DIFFICULTIES[difficultyId] || WORD_SEARCH_DIFFICULTIES.medium;
  const lessons = dependencies.lessons || LESSONS || [];
  const nav = dependencies.nav || window.nav || (() => {});
  const toast = dependencies.toast || window.toast || (() => {});
  const save = dependencies.save || (() => {});

  // 1. Retrieve available candidates
  const candidates = getAvailableWordSearchCandidates(state, lessons);

  // 2. Generate word search grid for exact difficulty
  const gameData = generateWordSearchGrid(candidates, {
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
    body.innerHTML = `
      <div class="empty-state" data-testid="word-search-empty">
        <span style="font-size:60px">🔍</span>
        <h3>Недостаточно подходящих слов</h3>
        <p>Для сложности «${escapeHtml(diffConfig.label)}» требуется больше слов. Начните больше глав или добавьте слова в SRS.</p>
        <button class="ws-btn ws-btn-secondary" id="ws-change-diff-empty-btn" style="margin-top:16px;">
          ⚙️ Сменить сложность
        </button>
      </div>
    `;

    const changeDiffBtn = $('#ws-change-diff-empty-btn');
    if (changeDiffBtn) {
      changeDiffBtn.onclick = () => renderDifficultySelectionScreen(state, dependencies);
    }
    return;
  }

  const { grid, placedWords, gridSize } = gameData;

  // Local Game State
  const gameState = {
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

  // Build Game UI Markup
  body.innerHTML = `
    <div class="ws-container" data-difficulty="${escapeHtml(difficultyId)}" data-testid="word-search-game">
      <!-- Header Info Bar -->
      <div class="ws-info-bar">
        <div class="ws-info-left">
          <span class="ws-diff-badge" data-testid="ws-diff-badge">${diffConfig.icon} ${escapeHtml(diffConfig.label)} (${gridSize}×${gridSize})</span>
          <div class="ws-counter" data-testid="ws-counter">
            Найдено: <span id="ws-found-count">0</span> / ${placedWords.length}
          </div>
        </div>

        <div class="ws-controls">
          <button class="ws-btn ws-btn-hint" id="ws-hint-btn" data-testid="ws-hint-btn">
            💡 Подсказка (<span id="ws-hints-left">${gameState.maxHints}</span>)
          </button>
          <button class="ws-btn ws-btn-secondary" id="ws-new-game-btn" data-testid="ws-new-game-btn">
            🔄 Новая игра
          </button>
          <button class="ws-btn ws-btn-secondary" id="ws-change-diff-btn" data-testid="ws-change-diff-btn">
            ⚙️ Сменить сложность
          </button>
        </div>
      </div>

      <!-- Translations List (Top, 2-Column Grid with Pre-reserved Space) -->
      <div class="ws-translations-section">
        <div class="ws-translations-label">Ищите слова:</div>
        <div class="ws-translations-list" id="ws-translations-list" data-testid="ws-translations-list">
          ${placedWords
            .map(
              (w) => `
            <div class="ws-translation-item" data-word-id="${escapeHtml(w.id)}" data-color-index="${w.colorIndex}" data-testid="ws-translation-${escapeHtml(w.id)}">
              <div class="ws-translation-header">
                <span class="ws-status-icon">✓</span>
                <span class="ws-translation-text">${escapeHtml(w.translation)}</span>
              </div>
              <div class="ws-translation-kana">${escapeHtml(w.kana)}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Word Search Grid -->
      <div class="ws-grid-wrapper">
        <div class="ws-grid" id="ws-grid" data-testid="ws-grid" style="grid-template-columns: repeat(${gridSize}, 1fr);">
          ${grid
            .map((row, r) =>
              row
                .map(
                  (cell, c) => `
              <div class="ws-cell" data-row="${r}" data-col="${c}" data-testid="ws-cell-${r}-${c}">
                ${escapeHtml(cell.char)}
              </div>
            `
                )
                .join('')
            )
            .join('')}
        </div>
      </div>

      <!-- Completion Modal -->
      <div class="ws-modal-overlay hidden" id="ws-modal" data-testid="ws-modal">
        <div class="ws-modal-card">
          <span class="ws-modal-icon">🎉</span>
          <h2>Партия завершена!</h2>
          <div class="ws-modal-stats">
            <div class="ws-stat-row"><span>Сложность:</span> <strong>${escapeHtml(diffConfig.label)}</strong></div>
            <div class="ws-stat-row"><span>Найдено слов:</span> <strong>${placedWords.length} / ${placedWords.length}</strong></div>
            <div class="ws-stat-row"><span>Время:</span> <strong id="ws-completion-time">00:00</strong></div>
            <div class="ws-stat-row"><span>Ошибок:</span> <strong id="ws-wrong-attempts">0</strong></div>
            <div class="ws-stat-row"><span>Подсказок:</span> <strong id="ws-hints-used">0</strong></div>
          </div>
          <div class="ws-modal-actions">
            <button class="ws-btn ws-btn-primary" id="ws-restart-btn">Сыграть ещё</button>
            <button class="ws-btn ws-btn-secondary" id="ws-modal-change-diff-btn">Сменить сложность</button>
            <button class="ws-btn ws-btn-secondary" id="ws-exit-btn">В инструменты</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const gridEl = $('#ws-grid');
  const foundCountEl = $('#ws-found-count');
  const hintsLeftEl = $('#ws-hints-left');
  const hintBtn = $('#ws-hint-btn');
  const newGameBtn = $('#ws-new-game-btn');
  const changeDiffBtn = $('#ws-change-diff-btn');
  const modalEl = $('#ws-modal');

  // Cell DOM helper
  function getCellEl(r, c) {
    return gridEl.querySelector(`.ws-cell[data-row="${r}"][data-col="${c}"]`);
  }

  // Clear active selection path highlight
  function clearActiveSelection() {
    gridEl.querySelectorAll('.ws-cell-active').forEach((el) => {
      el.classList.remove('ws-cell-active');
    });
  }

  // Render active selection path
  function renderActivePath(path) {
    clearActiveSelection();
    path.forEach(({ row, col }) => {
      const el = getCellEl(row, col);
      if (el) el.classList.add('ws-cell-active');
    });
  }

  // Re-apply cell styles considering multi-color intersections
  function updateCellFoundVisual(r, c) {
    const cellObj = grid[r][c];
    const cellEl = getCellEl(r, c);
    if (!cellEl || !cellObj || cellObj.foundColorIndexes.size === 0) return;

    cellEl.classList.remove('ws-cell-active');
    cellEl.classList.add('ws-cell-found');

    const colorIndexes = Array.from(cellObj.foundColorIndexes);

    if (colorIndexes.length === 1) {
      const paletteItem = PALETTE[colorIndexes[0] % PALETTE.length];
      cellEl.style.backgroundColor = paletteItem.bg;
      cellEl.style.color = paletteItem.ink;
      cellEl.style.backgroundImage = 'none';
    } else {
      // Linear gradient combining 2 (or more) word colors for intersections
      const color1 = PALETTE[colorIndexes[0] % PALETTE.length].bg;
      const color2 = PALETTE[colorIndexes[1] % PALETTE.length].bg;
      cellEl.style.backgroundImage = `linear-gradient(135deg, ${color1} 50%, ${color2} 50%)`;
      cellEl.style.backgroundColor = color1;
      cellEl.style.color = '#111';
    }
  }

  // Compute valid straight line path along 4 directions
  function computeStraightPath(startRow, startCol, targetRow, targetCol) {
    const dRow = targetRow - startRow;
    const dCol = targetCol - startCol;

    // 1. Horizontal (L -> R)
    if (dRow === 0 && dCol >= 0) {
      const path = [];
      for (let c = startCol; c <= targetCol; c++) {
        path.push({ row: startRow, col: c });
      }
      return path;
    }

    // 2. Vertical (T -> B)
    if (dCol === 0 && dRow >= 0) {
      const path = [];
      for (let r = startRow; r <= targetRow; r++) {
        path.push({ row: r, col: startCol });
      }
      return path;
    }

    // 3. Diagonal Down-Right
    if (dRow > 0 && dRow === dCol) {
      const path = [];
      for (let i = 0; i <= dRow; i++) {
        path.push({ row: startRow + i, col: startCol + i });
      }
      return path;
    }

    // 4. Diagonal Down-Left
    if (dRow > 0 && dRow === -dCol) {
      const path = [];
      for (let i = 0; i <= dRow; i++) {
        path.push({ row: startRow + i, col: startCol - i });
      }
      return path;
    }

    if (dRow < 0 && dCol < 0) return [{ row: startRow, col: startCol }];

    const candidatesList = [];
    if (dCol > 0) {
      candidatesList.push({ row: startRow, col: targetCol, distance: Math.abs(dRow) });
    }
    if (dRow > 0) {
      candidatesList.push({ row: targetRow, col: startCol, distance: Math.abs(dCol) });
    }
    if (dRow > 0 && dCol > 0) {
      const steps = Math.min(dRow, dCol);
      candidatesList.push({
        row: startRow + steps,
        col: startCol + steps,
        distance: Math.abs(dRow - dCol),
      });
    }
    if (dRow > 0 && dCol < 0) {
      const steps = Math.min(dRow, Math.abs(dCol));
      candidatesList.push({
        row: startRow + steps,
        col: startCol - steps,
        distance: Math.abs(dRow - Math.abs(dCol)),
      });
    }

    if (candidatesList.length > 0) {
      candidatesList.sort((a, b) => a.distance - b.distance);
      const best = candidatesList[0];
      return computeStraightPath(startRow, startCol, best.row, best.col);
    }

    return [{ row: startRow, col: startCol }];
  }

  // Pointer Handlers
  function onPointerDown(e) {
    if (gameState.completed) return;
    const targetCell = e.target.closest('.ws-cell');
    if (!targetCell) return;

    e.preventDefault();
    const r = parseInt(targetCell.dataset.row, 10);
    const c = parseInt(targetCell.dataset.col, 10);

    gameState.startCell = { row: r, col: c };
    gameState.activePath = [{ row: r, col: c }];
    gameState.pointerId = e.pointerId;

    try {
      gridEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors on unsupported test environments
    }

    renderActivePath(gameState.activePath);
  }

  function onPointerMove(e) {
    if (!gameState.startCell || gameState.completed) return;

    const hoveredCell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ws-cell');
    if (!hoveredCell) return;

    const r = parseInt(hoveredCell.dataset.row, 10);
    const c = parseInt(hoveredCell.dataset.col, 10);

    const path = computeStraightPath(gameState.startCell.row, gameState.startCell.col, r, c);
    gameState.activePath = path;
    renderActivePath(path);
  }

  function onPointerUp() {
    if (!gameState.startCell || gameState.completed) return;

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

    if (hintsLeftEl) {
      hintsLeftEl.textContent = String(gameState.maxHints - gameState.hintsUsed);
    }

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
  newGameBtn.onclick = () => startWordSearchGame(state, dependencies, difficultyId);
  changeDiffBtn.onclick = () => renderDifficultySelectionScreen(state, dependencies);

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

    if (modalEl) {
      const timeEl = modalEl.querySelector('#ws-completion-time');
      const wrongEl = modalEl.querySelector('#ws-wrong-attempts');
      const hintsEl = modalEl.querySelector('#ws-hints-used');

      if (timeEl) timeEl.textContent = formatTime(durationSec);
      if (wrongEl) wrongEl.textContent = String(gameState.wrongAttempts);
      if (hintsEl) hintsEl.textContent = String(gameState.hintsUsed);

      modalEl.classList.remove('hidden');

      const restartBtn = modalEl.querySelector('#ws-restart-btn');
      const modalChangeDiffBtn = modalEl.querySelector('#ws-modal-change-diff-btn');
      const exitBtn = modalEl.querySelector('#ws-exit-btn');

      if (restartBtn) {
        restartBtn.onclick = () => startWordSearchGame(state, dependencies, difficultyId);
      }
      if (modalChangeDiffBtn) {
        modalChangeDiffBtn.onclick = () => renderDifficultySelectionScreen(state, dependencies);
      }
      if (exitBtn) {
        exitBtn.onclick = () => nav('sensei');
      }
    }
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

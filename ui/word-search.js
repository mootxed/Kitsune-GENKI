/* ui/word-search.js — Word Search mini-game UI module */

import { $ } from '../src/utils.js';
import { generateWordSearchGrid } from '../src/word-search-generator.js';
import { getAvailableWordSearchCandidates } from '../src/word-search-selectors.js';
import { speakJapanese } from '../src/audio-helper.js';
import { LESSONS } from './home.js';

let activeCleanup = null;

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

export function renderWordSearch(state, dependencies = {}) {
  // Always clean up handlers from previous render
  cleanupWordSearch();

  const body = $('#word-search-body');
  if (!body) return;

  const lessons = dependencies.lessons || LESSONS || [];
  const nav = dependencies.nav || window.nav || (() => {});
  const toast = dependencies.toast || window.toast || (() => {});
  const save = dependencies.save || (() => {});

  // 1. Retrieve available candidates
  const candidates = getAvailableWordSearchCandidates(state, lessons);

  // 2. Generate word search grid
  const gameData = generateWordSearchGrid(candidates, {
    baseSize: 9,
    maxSize: 10,
    targetCount: 6,
    minCount: 4,
  });

  // Check if grid generation succeeded with at least 4 words
  if (!gameData.success || !gameData.placedWords || gameData.placedWords.length < 4) {
    body.innerHTML = `
      <div class="empty-state" data-testid="word-search-empty">
        <span style="font-size:60px">🔍</span>
        <h3>Недостаточно доступных слов</h3>
        <p>Начните больше глав или добавьте слова в SRS</p>
      </div>
    `;
    return;
  }

  const { grid, placedWords, gridSize } = gameData;

  // Local Game State
  const gameState = {
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

  // Build UI Markup
  body.innerHTML = `
    <div class="ws-container" data-testid="word-search-game">
      <!-- Top Info Bar -->
      <div class="ws-info-bar">
        <div class="ws-counter" data-testid="ws-counter">
          Найдено: <span id="ws-found-count">0</span> / ${placedWords.length}
        </div>
        <div class="ws-controls">
          <button class="ws-btn ws-btn-hint" id="ws-hint-btn" data-testid="ws-hint-btn">
            💡 Подсказка (<span id="ws-hints-left">${gameState.maxHints}</span>)
          </button>
          <button class="ws-btn ws-btn-secondary" id="ws-new-game-btn" data-testid="ws-new-game-btn">
            🔄 Новая игра
          </button>
        </div>
      </div>

      <!-- Translations List (Top) -->
      <div class="ws-translations-section">
        <div class="ws-translations-label">Ищите слова:</div>
        <div class="ws-translations-list" id="ws-translations-list" data-testid="ws-translations-list">
          ${placedWords
            .map(
              (w) => `
            <div class="ws-translation-item" data-word-id="${escapeHtml(w.id)}" data-testid="ws-translation-${escapeHtml(w.id)}">
              <span class="ws-translation-text">${escapeHtml(w.translation)}</span>
              <span class="ws-translation-kana hidden">${escapeHtml(w.kana)}</span>
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

      <!-- Completion Modal / Screen (Hidden by default) -->
      <div class="ws-modal-overlay hidden" id="ws-modal" data-testid="ws-modal">
        <div class="ws-modal-card">
          <span class="ws-modal-icon">🎉</span>
          <h2>Партия завершена!</h2>
          <div class="ws-modal-stats">
            <div class="ws-stat-row"><span>Найдено слов:</span> <strong>${placedWords.length} / ${placedWords.length}</strong></div>
            <div class="ws-stat-row"><span>Время:</span> <strong id="ws-completion-time">00:00</strong></div>
            <div class="ws-stat-row"><span>Ошибочных попыток:</span> <strong id="ws-wrong-attempts">0</strong></div>
            <div class="ws-stat-row"><span>Использовано подсказок:</span> <strong id="ws-hints-used">0</strong></div>
          </div>
          <div class="ws-modal-actions">
            <button class="ws-btn ws-btn-primary" id="ws-restart-btn">Сыграть ещё</button>
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
  const modalEl = $('#ws-modal');

  // Cell helper
  function getCellEl(r, c) {
    return gridEl.querySelector(`.ws-cell[data-row="${r}"][data-col="${c}"]`);
  }

  // Clear active path highlights
  function clearActiveSelection() {
    gridEl.querySelectorAll('.ws-cell-active').forEach((el) => {
      el.classList.remove('ws-cell-active');
    });
  }

  // Update DOM selection based on current activePath
  function renderActivePath(path) {
    clearActiveSelection();
    path.forEach(({ row, col }) => {
      const el = getCellEl(row, col);
      if (el) el.classList.add('ws-cell-active');
    });
  }

  // Validate and compute path vector along the 4 allowed directions
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

    // 3. Diagonal Down-Right (dx=1, dy=1)
    if (dRow > 0 && dRow === dCol) {
      const path = [];
      for (let i = 0; i <= dRow; i++) {
        path.push({ row: startRow + i, col: startCol + i });
      }
      return path;
    }

    // 4. Diagonal Down-Left (dx=-1, dy=1)
    if (dRow > 0 && dRow === -dCol) {
      const path = [];
      for (let i = 0; i <= dRow; i++) {
        path.push({ row: startRow + i, col: startCol - i });
      }
      return path;
    }

    // If pointer is moving in non-straight direction, project to nearest cell along direction rays
    // Find closest ray among the 4 valid directions:
    // Ray 0: dx=1, dy=0
    // Ray 1: dx=0, dy=1
    // Ray 2: dx=1, dy=1
    // Ray 3: dx=-1, dy=1
    if (dRow < 0 && dCol < 0) return [{ row: startRow, col: startCol }];

    const candidates = [];

    // Check Horizontal projection
    if (dCol > 0) {
      candidates.push({ row: startRow, col: targetCol, distance: Math.abs(dRow) });
    }
    // Check Vertical projection
    if (dRow > 0) {
      candidates.push({ row: targetRow, col: startCol, distance: Math.abs(dCol) });
    }
    // Check Diag Down-Right projection
    if (dRow > 0 && dCol > 0) {
      const steps = Math.min(dRow, dCol);
      candidates.push({
        row: startRow + steps,
        col: startCol + steps,
        distance: Math.abs(dRow - dCol),
      });
    }
    // Check Diag Down-Left projection
    if (dRow > 0 && dCol < 0) {
      const steps = Math.min(dRow, Math.abs(dCol));
      candidates.push({
        row: startRow + steps,
        col: startCol - steps,
        distance: Math.abs(dRow - Math.abs(dCol)),
      });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      const best = candidates[0];
      return computeStraightPath(startRow, startCol, best.row, best.col);
    }

    return [{ row: startRow, col: startCol }];
  }

  // Pointer Event Handlers
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
      // Ignore capture errors on unsupported synthetic test environments
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

    // Check if path matches any un-found placed word
    const matchedWord = placedWords.find((pw) => {
      if (gameState.foundWordIds.has(pw.id)) return false;
      if (pw.kana !== selectedKana) return false;
      if (pw.cells.length !== currentPath.length) return false;

      // Verify cell coordinates sequence match
      return pw.cells.every(
        (cell, idx) => cell.row === currentPath[idx].row && cell.col === currentPath[idx].col
      );
    });

    if (matchedWord) {
      // Correct answer!
      gameState.foundWordIds.add(matchedWord.id);

      // Permanently mark cells
      matchedWord.cells.forEach(({ row, col }) => {
        const cellEl = getCellEl(row, col);
        if (cellEl) {
          cellEl.classList.remove('ws-cell-active');
          cellEl.classList.add('ws-cell-found');
        }
      });

      // Strike through translation item
      const transItem = body.querySelector(
        `.ws-translation-item[data-word-id="${matchedWord.id}"]`
      );
      if (transItem) {
        transItem.classList.add('ws-found');
        const kanaText = transItem.querySelector('.ws-translation-kana');
        if (kanaText) kanaText.classList.remove('hidden');
      }

      // Play voice audio
      speakJapanese(matchedWord.kana);

      // Update counter
      if (foundCountEl) {
        foundCountEl.textContent = String(gameState.foundWordIds.size);
      }

      toast(`✨ Найдено: ${matchedWord.translation}`);

      // Check if all words found
      if (gameState.foundWordIds.size === placedWords.length) {
        completeGame();
      }
    } else {
      // Wrong attempt
      gameState.wrongAttempts++;
      currentPath.forEach(({ row, col }) => {
        const cellEl = getCellEl(row, col);
        if (cellEl) {
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
        // Ignore release capture errors
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

  // Click on translation to listen to audio
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

  // Hint Button handler
  hintBtn.onclick = () => {
    if (gameState.completed) return;
    if (gameState.hintsUsed >= gameState.maxHints) {
      toast('🔒 Достигнут лимит подсказок');
      return;
    }

    // Pick a random un-found word
    const unfoundWords = placedWords.filter((w) => !gameState.foundWordIds.has(w.id));
    if (unfoundWords.length === 0) return;

    const pickedWord = unfoundWords[Math.floor(Math.random() * unfoundWords.length)];
    gameState.hintsUsed++;

    if (hintsLeftEl) {
      hintsLeftEl.textContent = String(gameState.maxHints - gameState.hintsUsed);
    }

    // Highlight starting cell for 1.5 seconds
    const firstCellEl = getCellEl(pickedWord.startRow, pickedWord.startCol);
    if (firstCellEl) {
      firstCellEl.classList.add('ws-cell-hint');
      if (gameState.hintTimeout) clearTimeout(gameState.hintTimeout);
      gameState.hintTimeout = setTimeout(() => {
        firstCellEl.classList.remove('ws-cell-hint');
      }, 1500);
    }
  };

  // Restart / New Game buttons
  newGameBtn.onclick = () => renderWordSearch(state, dependencies);

  // Complete game
  function completeGame() {
    gameState.completed = true;
    const durationSec = Math.floor((Date.now() - gameState.startedAt) / 1000);

    // Award +10 XP once per batch without altering FSRS
    if (!gameState.xpAwarded) {
      gameState.xpAwarded = true;
      if (typeof state.xp === 'number') {
        state.xp += 10;
      } else {
        state.xp = 10;
      }
      save();
    }

    // Show completion modal
    if (modalEl) {
      const timeEl = modalEl.querySelector('#ws-completion-time');
      const wrongEl = modalEl.querySelector('#ws-wrong-attempts');
      const hintsEl = modalEl.querySelector('#ws-hints-used');

      if (timeEl) timeEl.textContent = formatTime(durationSec);
      if (wrongEl) wrongEl.textContent = String(gameState.wrongAttempts);
      if (hintsEl) hintsEl.textContent = String(gameState.hintsUsed);

      modalEl.classList.remove('hidden');

      const restartBtn = modalEl.querySelector('#ws-restart-btn');
      const exitBtn = modalEl.querySelector('#ws-exit-btn');

      if (restartBtn) {
        restartBtn.onclick = () => renderWordSearch(state, dependencies);
      }
      if (exitBtn) {
        exitBtn.onclick = () => nav('sensei');
      }
    }
  }

  // Cleanup handler for route switching
  activeCleanup = () => {
    gridEl.removeEventListener('pointerdown', onPointerDown);
    gridEl.removeEventListener('pointermove', onPointerMove);
    gridEl.removeEventListener('pointerup', onPointerUp);
    gridEl.removeEventListener('pointercancel', onPointerCancel);
    if (gameState.hintTimeout) clearTimeout(gameState.hintTimeout);
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  };
}

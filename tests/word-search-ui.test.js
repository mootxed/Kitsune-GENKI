import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderDifficultySelectionScreen,
  startWordSearchGame,
  cleanupWordSearch,
  PALETTE,
} from '../ui/word-search.js';

describe('Word Search UI & Integration Tests', () => {
  let state;
  let dependencies;

  const mockLessons = [
    {
      id: 1,
      words: [
        { id: 'L1_V001', writing: 'みず', translation: 'вода' },
        { id: 'L1_V002', writing: 'がくせい', kanji: '学生', translation: 'студент' },
        { id: 'L1_V003', writing: 'テレビ', kanji: 'テレビ', translation: 'телевизор' },
        { id: 'L1_V004', writing: 'たべる', kanji: '食べる', translation: 'есть' },
        { id: 'L1_V005', writing: 'ともだち', kanji: '友達', translation: 'друг' },
        { id: 'L1_V006', writing: 'ほん', kanji: '本', translation: 'книга' },
        { id: 'L1_V007', writing: 'ねこ', kanji: '猫', translation: 'кошка' },
        { id: 'L1_V008', writing: 'いぬ', kanji: '犬', translation: 'собака' },
        { id: 'L1_V009', writing: 'くるま', kanji: '車', translation: 'машина' },
        { id: 'L1_V010', writing: 'さかな', kanji: '魚', translation: 'рыба' },
        { id: 'L1_V011', writing: 'やま', kanji: '山', translation: 'гора' },
        { id: 'L1_V012', kanji: '川', writing: 'かわ', translation: 'река' },
      ],
    },
  ];

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app-body">
        <div class="tabbar" style="display: flex;"></div>
        <div id="completion-overlay" class="hidden">
          <div id="completion-title"></div>
          <div id="completion-subtitle"></div>
          <div id="completion-desc"></div>
          <div id="completion-rewards"></div>
          <button id="btn-completion-continue"></button>
        </div>
        <section class="screen hidden" id="screen-sensei">
          <div id="sensei-body"></div>
        </section>
        <section class="screen hidden" id="screen-word-search">
          <div id="word-search-body"></div>
        </section>
      </div>
    `;

    state = {
      chapters: {
        1: { started: true },
      },
      srs: {
        L1_V001: { id: 'L1_V001', state: 3, reps: 5, lapses: 2, stability: 1 },
        L1_V002: { id: 'L1_V002', state: 3, reps: 5, lapses: 2, stability: 1 },
        L1_V003: { id: 'L1_V003', state: 3, reps: 5, lapses: 2, stability: 1 },
        L1_V004: { id: 'L1_V004', state: 3, reps: 5, lapses: 2, stability: 1 },

        L1_V005: { id: 'L1_V005', state: 2, reps: 10, lapses: 0, stability: 30 },
      },
      xp: 100,
    };

    dependencies = {
      nav: vi.fn(),
      toast: vi.fn(),
      save: vi.fn(),
      lessons: mockLessons,
    };

    cleanupWordSearch();
    vi.restoreAllMocks();
  });

  // Mode Switcher UI
  it('WS-MODE-1. На экране виден выбор «Все слова / Слабые слова»', () => {
    renderDifficultySelectionScreen(state, dependencies);
    const switcher = document.querySelector('[data-testid="ws-mode-switcher"]');
    expect(switcher).not.toBeNull();
    const modeBtns = switcher.querySelectorAll('.ws-mode-btn');
    expect(modeBtns.length).toBe(2);
  });

  it('WS-MODE-2. По умолчанию выбран normal', () => {
    renderDifficultySelectionScreen(state, dependencies);
    const normalBtn = document.querySelector('.ws-mode-btn[data-mode="normal"]');
    expect(normalBtn.classList.contains('active')).toBe(true);
    expect(normalBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('WS-MODE-3. При weak mode показывается количество слабых слов', () => {
    renderDifficultySelectionScreen(state, dependencies, 'weak');
    const desc = document.querySelector('.ws-mode-description');
    expect(desc).not.toBeNull();
    expect(desc.textContent).toContain('Доступно слабых слов: 4');
  });

  it('WS-MODE-4. Недоступная сложность disabled', () => {
    renderDifficultySelectionScreen(state, dependencies, 'weak');
    const hardCard = document.querySelector('[data-testid="ws-diff-card-hard"]');
    expect(hardCard.classList.contains('disabled')).toBe(true);
    const btn = hardCard.querySelector('button');
    expect(btn.disabled).toBe(true);
  });

  it('WS-MODE-5. Лёгкая weak-партия запускается с 4 слабыми словами', () => {
    startWordSearchGame(state, dependencies, 'easy', 'weak');
    const gameContainer = document.querySelector('[data-testid="word-search-game"]');
    expect(gameContainer).not.toBeNull();
    expect(gameContainer.dataset.mode).toBe('weak');
  });

  it('WS-MODE-6. «Новая игра» сохраняет mode и difficulty', () => {
    startWordSearchGame(state, dependencies, 'easy', 'weak');
    const newGameBtn = document.getElementById('ws-new-game-btn');
    newGameBtn.click();

    const gameContainer = document.querySelector('[data-testid="word-search-game"]');
    expect(gameContainer.dataset.mode).toBe('weak');
    expect(gameContainer.dataset.difficulty).toBe('easy');
  });

  it('WS-MODE-7. «Сменить сложность» сохраняет mode', () => {
    startWordSearchGame(state, dependencies, 'easy', 'weak');
    const changeDiffBtn = document.getElementById('ws-change-diff-btn');
    changeDiffBtn.click();

    const weakBtn = document.querySelector('.ws-mode-btn[data-mode="weak"]');
    expect(weakBtn.classList.contains('active')).toBe(true);
  });

  it('WS-MODE-8. HUD показывает weak mode badge', () => {
    startWordSearchGame(state, dependencies, 'easy', 'weak');
    const badge = document.querySelector('[data-testid="ws-diff-badge"]');
    expect(badge.textContent).toContain('🩹 Слабые слова');
  });

  it('WS-MODE-9. Empty state предлагает обычный режим при отсутствии слабых слов', () => {
    const emptyState = { chapters: { 1: { started: true } }, srs: {} };
    renderDifficultySelectionScreen(emptyState, dependencies, 'weak');

    const emptyContainer = document.querySelector('[data-testid="word-search-weak-empty"]');
    expect(emptyContainer).not.toBeNull();
    const switchBtn = document.getElementById('ws-switch-to-normal-btn');
    expect(switchBtn).not.toBeNull();
  });

  it('WS-MODE-10. Результат партии не изменяет SRS/mastery', () => {
    const originalSrs = JSON.stringify(state.srs);
    startWordSearchGame(state, dependencies, 'easy', 'weak');
    expect(JSON.stringify(state.srs)).toBe(originalSrs);
  });

  // Focus Mode & Elements
  it('1. Во время игры tabbar скрыт (Focus Mode)', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const tabbar = document.querySelector('.tabbar');
    expect(tabbar.style.display).toBe('none');
    expect(document.body.classList.contains('ws-focus-mode')).toBe(true);
  });

  it('2. На экране сложности tabbar видим', () => {
    renderDifficultySelectionScreen(state, dependencies);
    const tabbar = document.querySelector('.tabbar');
    expect(tabbar.style.display).toBe('');
    expect(document.body.classList.contains('ws-focus-mode')).toBe(false);
  });

  it('3. HUD содержит компактные icon-buttons с aria-label', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const hintBtn = document.getElementById('ws-hint-btn');
    const newGameBtn = document.getElementById('ws-new-game-btn');
    const changeDiffBtn = document.getElementById('ws-change-diff-btn');

    expect(hintBtn.getAttribute('aria-label')).toBeTruthy();
    expect(newGameBtn.getAttribute('aria-label')).toBeTruthy();
    expect(changeDiffBtn.getAttribute('aria-label')).toBeTruthy();
  });

  it('7. Cleanup восстанавливает tabbar', () => {
    startWordSearchGame(state, dependencies, 'medium');
    cleanupWordSearch();
    const tabbar = document.querySelector('.tabbar');
    expect(tabbar.style.display).toBe('');
    expect(document.body.classList.contains('ws-focus-mode')).toBe(false);
  });

  it('8. Лёгкая создаёт сетку 7×7', () => {
    startWordSearchGame(state, dependencies, 'easy');
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('easy');

    const cells = document.querySelectorAll('.ws-cell');
    expect(cells.length).toBe(49);
  });

  it('16. Палитры хватает минимум на 10 цветов', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(10);
  });
});

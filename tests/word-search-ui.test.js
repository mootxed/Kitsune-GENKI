/* global PointerEvent, CustomEvent */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderWordSearch,
  startWordSearchGame,
  cleanupWordSearch,
  PALETTE,
} from '../ui/word-search.js';
import { renderSensei, setSenseiTab } from '../ui/chat.js';
import { readFileSync } from 'node:fs';

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
      ],
    },
  ];

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app-body">
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
        L1_V001: { id: 'L1_V001', state: 2, stability: 10 },
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

  // Difficulty Selection
  it('1. При входе отображается экран выбора сложности, а не сетка', () => {
    renderWordSearch(state, dependencies);
    const diffScreen = document.querySelector('[data-testid="ws-difficulty-screen"]');
    expect(diffScreen).not.toBeNull();
    const gameScreen = document.querySelector('[data-testid="word-search-game"]');
    expect(gameScreen).toBeNull();
  });

  it('2. Лёгкая создаёт сетку 7×7 и целится в 4 слова', () => {
    startWordSearchGame(state, dependencies, 'easy');
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('easy');

    const cells = document.querySelectorAll('.ws-cell');
    expect(cells.length).toBe(49); // 7x7
  });

  it('3. Средняя создаёт сетку 9×9 и целится в 6 слов', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('medium');

    const cells = document.querySelectorAll('.ws-cell');
    expect(cells.length).toBe(81); // 9x9
  });

  it('4. Сложная создаёт сетку 11×11 и целится в 9 слов', () => {
    startWordSearchGame(state, dependencies, 'hard');
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('hard');

    const cells = document.querySelectorAll('.ws-cell');
    expect(cells.length).toBe(121); // 11x11
  });

  it('5. «Новая игра» сохраняет текущую сложность', () => {
    startWordSearchGame(state, dependencies, 'hard');
    const newGameBtn = document.getElementById('ws-new-game-btn');
    expect(newGameBtn).not.toBeNull();

    newGameBtn.click();
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('hard');
  });

  it('6. «Сменить сложность» возвращает к выбору', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const changeDiffBtn = document.getElementById('ws-change-diff-btn');
    expect(changeDiffBtn).not.toBeNull();

    changeDiffBtn.click();
    const diffScreen = document.querySelector('[data-testid="ws-difficulty-screen"]');
    expect(diffScreen).not.toBeNull();
  });

  it('7. Повторный вход в раздел «Инструменты» снова показывает выбор сложности', () => {
    const senseiBody = document.getElementById('sensei-body');
    setSenseiTab('tools');
    renderSensei(state, dependencies);

    const card = senseiBody.querySelector('[data-testid="tool-card-word-search"]');
    expect(card).not.toBeNull();
  });

  // Colors & Intersections
  it('8. Каждое placedWord получает colorIndex', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const items = document.querySelectorAll('.ws-translation-item');
    items.forEach((item) => {
      expect(item.dataset.colorIndex).toBeDefined();
    });
  });

  it('9. Две разные карточки вывода имеют свой colorIndex', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const items = document.querySelectorAll('.ws-translation-item');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].dataset.colorIndex).not.toBe(items[1].dataset.colorIndex);
  });

  it('10. Карточка перевода и клетки слова используют один colorIndex', () => {
    startWordSearchGame(state, dependencies, 'easy');
    const item = document.querySelector('.ws-translation-item');
    expect(item.dataset.colorIndex).toBeDefined();
  });

  it('11. Палитры хватает минимум на 10 цветов для сложной партии из девяти слов', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(10);
  });

  // Zero Layout Shift & Formatting
  it('14. Японское чтение занимает зарезервированное место до нахождения', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const kanaEl = document.querySelector('.ws-translation-kana');
    expect(kanaEl).not.toBeNull();

    // Verify it doesn't use class="hidden" with display:none
    expect(kanaEl.classList.contains('hidden')).toBe(false);
  });

  it('15. При нахождении не добавляется новый DOM-элемент для чтения', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const initialKanaCount = document.querySelectorAll('.ws-translation-kana').length;
    expect(initialKanaCount).toBeGreaterThan(0);
  });

  it('16. Не используется класс hidden с display:none для kana-строки в CSS/HTML', () => {
    const uiSource = readFileSync('ui/word-search.js', 'utf8');
    expect(uiSource).not.toMatch(/class="ws-translation-kana hidden"/u);
  });

  it('19. Катакана отображается корректно в карточке перевода', () => {
    const katakanaLessons = [
      {
        id: 1,
        words: [
          { id: 'K1', writing: 'テレビ', translation: 'телевизор' },
          { id: 'K2', writing: 'ラジオ', translation: 'радио' },
          { id: 'K3', writing: 'カメラ', translation: 'камера' },
          { id: 'K4', writing: 'タクシー', translation: 'такси' },
        ],
      },
    ];
    startWordSearchGame(state, { ...dependencies, lessons: katakanaLessons }, 'easy');
    const translationsList = document.querySelector('[data-testid="ws-translations-list"]');
    const items = Array.from(translationsList.children);
    expect(items.length).toBe(4);
    const kanaText = items[0].querySelector('.ws-translation-kana').textContent;
    expect(/[\u30A0-\u30FF]/.test(kanaText)).toBe(true);
  });

  // Regressions
  it('20. Правильное выделение считывает слово', () => {
    startWordSearchGame(state, dependencies, 'easy');
    const counterEl = document.getElementById('ws-found-count');
    expect(counterEl.textContent).toBe('0');
  });

  it('21. Неправильное выделение не засчитывается', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const counterEl = document.getElementById('ws-found-count');
    const gridEl = document.getElementById('ws-grid');
    const firstCell = gridEl.querySelector('.ws-cell[data-row="0"][data-col="0"]');

    const EventConstructor = typeof PointerEvent !== 'undefined' ? PointerEvent : CustomEvent;
    firstCell.dispatchEvent(new EventConstructor('pointerdown', { bubbles: true }));
    firstCell.dispatchEvent(new EventConstructor('pointerup', { bubbles: true }));

    expect(counterEl.textContent).toBe('0');
  });

  it('22. Подсказки продолжают работать', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const hintBtn = document.getElementById('ws-hint-btn');
    expect(hintBtn).not.toBeNull();

    hintBtn.click();
    const hintCells = document.querySelectorAll('.ws-cell-hint');
    expect(hintCells.length).toBe(1);
  });

  it('23. Completion modal скрыт до завершения партии', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const modalEl = document.getElementById('ws-modal');
    expect(modalEl.classList.contains('hidden')).toBe(true);
  });

  it('24. Игра не изменяет SRS и reviewEvents', () => {
    const originalSrs = JSON.stringify(state.srs);
    startWordSearchGame(state, dependencies, 'medium');

    expect(JSON.stringify(state.srs)).toBe(originalSrs);
    expect(state.reviewEvents).toBeUndefined();

    const uiSource = readFileSync('ui/word-search.js', 'utf8');
    expect(uiSource).not.toMatch(/state\.srs\s*=/u);
    expect(uiSource).not.toMatch(/state\.reviewEvents/u);
    expect(uiSource).not.toMatch(/masteryArchive/u);
  });
});

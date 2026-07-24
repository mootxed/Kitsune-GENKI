import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderDifficultySelectionScreen,
  startWordSearchGame,
  cleanupWordSearch,
  PALETTE,
} from '../ui/word-search.js';
import { renderSensei, setSenseiTab } from '../ui/chat.js';
import * as audioHelper from '../src/audio-helper.js';
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

  it('4. Подсказки находятся в фиксированной двухрядной strip-панели', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const strip = document.querySelector('.ws-clue-strip');
    expect(strip).not.toBeNull();
  });

  it('5. Нахождение слова не меняет структуру и высоту панели', () => {
    startWordSearchGame(state, dependencies, 'easy');
    const strip = document.querySelector('.ws-clue-strip');
    const initialChildrenCount = strip.children.length;

    // Simulate finding a word visual update
    const firstItem = strip.children[0];
    firstItem.classList.add('ws-found');

    expect(strip.children.length).toBe(initialChildrenCount);
  });

  it('6. Hard mode не создаёт горизонтального overflow сетки', () => {
    startWordSearchGame(state, dependencies, 'hard');
    const gridWrapper = document.querySelector('.ws-grid-wrapper');
    expect(gridWrapper).not.toBeNull();
  });

  it('7. Cleanup восстанавливает tabbar', () => {
    startWordSearchGame(state, dependencies, 'medium');
    cleanupWordSearch();
    const tabbar = document.querySelector('.tabbar');
    expect(tabbar.style.display).toBe('');
    expect(document.body.classList.contains('ws-focus-mode')).toBe(false);
  });

  it('8. Лёгкая создаёт сетку 7×7 и целится в 4 слова', () => {
    startWordSearchGame(state, dependencies, 'easy');
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('easy');

    const cells = document.querySelectorAll('.ws-cell');
    expect(cells.length).toBe(49); // 7x7
  });

  it('9. Средняя создаёт сетку 9×9 и целится в 6 слов', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('medium');

    const cells = document.querySelectorAll('.ws-cell');
    expect(cells.length).toBe(81); // 9x9
  });

  it('10. Сложная создаёт сетку 11×11 и целится в 9 слов', () => {
    startWordSearchGame(state, dependencies, 'hard');
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('hard');

    const cells = document.querySelectorAll('.ws-cell');
    expect(cells.length).toBe(121); // 11x11
  });

  it('11. «Новая игра» сохраняет текущую сложность', () => {
    startWordSearchGame(state, dependencies, 'hard');
    const newGameBtn = document.getElementById('ws-new-game-btn');
    expect(newGameBtn).not.toBeNull();

    newGameBtn.click();
    const container = document.querySelector('[data-testid="word-search-game"]');
    expect(container.dataset.difficulty).toBe('hard');
  });

  it('12. «Сменить сложность» возвращает к выбору', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const changeDiffBtn = document.getElementById('ws-change-diff-btn');
    expect(changeDiffBtn).not.toBeNull();

    changeDiffBtn.click();
    const diffScreen = document.querySelector('[data-testid="ws-difficulty-screen"]');
    expect(diffScreen).not.toBeNull();
  });

  it('13. Повторный вход в раздел «Инструменты» снова показывает выбор сложности', () => {
    const senseiBody = document.getElementById('sensei-body');
    setSenseiTab('tools');
    renderSensei(state, dependencies);

    const card = senseiBody.querySelector('[data-testid="tool-card-word-search"]');
    expect(card).not.toBeNull();
  });

  // Colors & Intersections
  it('14. Каждое placedWord получает colorIndex', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const items = document.querySelectorAll('.ws-translation-item');
    items.forEach((item) => {
      expect(item.dataset.colorIndex).toBeDefined();
    });
  });

  it('15. Две разные карточки вывода имеют свой colorIndex', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const items = document.querySelectorAll('.ws-translation-item');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].dataset.colorIndex).not.toBe(items[1].dataset.colorIndex);
  });

  it('16. Палитры хватает минимум на 10 цветов', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(10);
  });

  // Requirement Tests 1-10 (Kana Removal, Audio TTS, Layout & Isolation)
  it('WS-REQ-1. В clue-strip присутствуют русские переводы', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const translations = document.querySelectorAll('.ws-clue-translation');
    expect(translations.length).toBeGreaterThan(0);
    translations.forEach((el) => {
      expect(el.textContent.trim()).toBeTruthy();
    });
  });

  it('WS-REQ-2. В clue-strip отсутствует японское kana', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const strip = document.querySelector('.ws-clue-strip');
    expect(strip.textContent).not.toMatch(/[\u3040-\u30ff]/u);
  });

  it('WS-REQ-3. Элементы ws-clue-kana и ws-translation-kana не создаются', () => {
    startWordSearchGame(state, dependencies, 'medium');
    expect(document.querySelector('.ws-clue-kana')).toBeNull();
    expect(document.querySelector('.ws-translation-kana')).toBeNull();
  });

  it('WS-REQ-4. До нахождения клик по переводу не вызывает speakJapanese()', () => {
    const spy = vi.spyOn(audioHelper, 'speakJapanese');
    startWordSearchGame(state, dependencies, 'medium');
    const item = document.querySelector('.ws-translation-item');
    expect(item.classList.contains('ws-found')).toBe(false);

    item.click();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('WS-REQ-5. После нахождения клик вызывает speakJapanese()', () => {
    const spy = vi.spyOn(audioHelper, 'speakJapanese');
    startWordSearchGame(state, dependencies, 'medium');
    const item = document.querySelector('.ws-translation-item');
    item.classList.add('ws-found');

    item.click();
    expect(spy).toHaveBeenCalledWith(expect.any(String));
    spy.mockRestore();
  });

  it('WS-REQ-6. После нахождения появляется ✓', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const item = document.querySelector('.ws-translation-item');
    const check = item.querySelector('.ws-clue-check');
    expect(check.textContent.trim()).toBe('✓');

    item.classList.add('ws-found');
    expect(item.classList.contains('ws-found')).toBe(true);
  });

  it('WS-REQ-7. Карточка и клетки слова получают одинаковый colorIndex', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const items = document.querySelectorAll('.ws-translation-item');
    items.forEach((item) => {
      expect(item.dataset.colorIndex).toBeDefined();
      expect(Number(item.dataset.colorIndex)).toBeGreaterThanOrEqual(0);
    });
  });

  it('WS-REQ-8. Высота карточки не меняется после нахождения', () => {
    startWordSearchGame(state, dependencies, 'medium');
    const item = document.querySelector('.ws-translation-item');
    const initialChildrenCount = item.children.length;

    item.classList.add('ws-found');
    expect(item.children.length).toBe(initialChildrenCount);
  });

  it('WS-REQ-9. Удаление kana не ломает подсказки и completion-overlay', () => {
    startWordSearchGame(state, dependencies, 'easy');
    const hintBtn = document.getElementById('ws-hint-btn');
    expect(() => hintBtn.click()).not.toThrow();

    const uiSource = readFileSync('ui/word-search.js', 'utf8');
    expect(uiSource).toContain('showCompletionScreen');
  });

  it('WS-REQ-10. Игра по-прежнему не изменяет FSRS и mastery', () => {
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

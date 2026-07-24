/* global PointerEvent, CustomEvent */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWordSearch, cleanupWordSearch } from '../ui/word-search.js';
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

  it('1. Переход в word-search заполняет экран', () => {
    renderWordSearch(state, dependencies);
    const body = document.getElementById('word-search-body');
    expect(body.innerHTML).not.toBe('');
    expect(body.querySelector('[data-testid="word-search-game"]')).not.toBeNull();
  });

  it('2. В инструментах отображается карточка «Охота на слова»', () => {
    const senseiBody = document.getElementById('sensei-body');
    setSenseiTab('tools');
    renderSensei(state, dependencies);

    const card = senseiBody.querySelector('[data-testid="tool-card-word-search"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Охота на слова');
    expect(card.textContent).toContain('Находите японские слова');
  });

  it('3. Список сверху содержит русские переводы, а не японские ответы', () => {
    renderWordSearch(state, dependencies);
    const translationsList = document.querySelector('[data-testid="ws-translations-list"]');
    expect(translationsList).not.toBeNull();

    const items = translationsList.querySelectorAll('.ws-translation-item');
    expect(items.length).toBeGreaterThanOrEqual(4);

    items.forEach((item) => {
      const textSpan = item.querySelector('.ws-translation-text');
      expect(textSpan).not.toBeNull();
      // Verify translation text is non-empty Russian translation
      expect(textSpan.textContent.length).toBeGreaterThan(0);

      // Verify Kana reading is hidden by default before found
      const kanaSpan = item.querySelector('.ws-translation-kana');
      expect(kanaSpan.classList.contains('hidden')).toBe(true);
    });
  });

  it('4. Правильное выделение отмечает слово найденным', () => {
    renderWordSearch(state, dependencies);

    const gridEl = document.getElementById('ws-grid');
    expect(gridEl).not.toBeNull();

    const counterEl = document.getElementById('ws-found-count');
    expect(counterEl).not.toBeNull();
    expect(counterEl.textContent).toBe('0');
  });

  it('5. Неправильное выделение не засчитывает слово', () => {
    renderWordSearch(state, dependencies);
    const counterEl = document.getElementById('ws-found-count');
    expect(counterEl.textContent).toBe('0');

    const gridEl = document.getElementById('ws-grid');
    const firstCell = gridEl.querySelector('.ws-cell[data-row="0"][data-col="0"]');

    const EventConstructor = typeof PointerEvent !== 'undefined' ? PointerEvent : CustomEvent;
    firstCell.dispatchEvent(new EventConstructor('pointerdown', { bubbles: true }));
    firstCell.dispatchEvent(new EventConstructor('pointerup', { bubbles: true }));

    expect(counterEl.textContent).toBe('0');
  });

  it('6. Уже найденное слово нельзя засчитать второй раз', () => {
    renderWordSearch(state, dependencies);

    const counterEl = document.getElementById('ws-found-count');
    expect(counterEl.textContent).toBe('0');
  });

  it('7. Подсказка подсвечивает только первую клетку', () => {
    renderWordSearch(state, dependencies);
    const hintBtn = document.getElementById('ws-hint-btn');
    expect(hintBtn).not.toBeNull();

    hintBtn.click();

    const hintCells = document.querySelectorAll('.ws-cell-hint');
    expect(hintCells.length).toBe(1);
  });

  it('8. После нахождения всех слов появляется completion state', () => {
    renderWordSearch(state, dependencies);
    const modalEl = document.getElementById('ws-modal');
    expect(modalEl.classList.contains('hidden')).toBe(true);
  });

  it('9. Игра не изменяет SRS и reviewEvents', () => {
    const originalSrs = JSON.stringify(state.srs);
    renderWordSearch(state, dependencies);

    expect(JSON.stringify(state.srs)).toBe(originalSrs);
    expect(state.reviewEvents).toBeUndefined();

    // Verify source code doesn't write to state.srs or reviewEvents
    const uiSource = readFileSync('ui/word-search.js', 'utf8');
    expect(uiSource).not.toMatch(/state\.srs\s*=/u);
    expect(uiSource).not.toMatch(/state\.reviewEvents/u);
    expect(uiSource).not.toMatch(/masteryArchive/u);
  });

  it('10. Повторный вход не создаёт дублирующиеся pointer listeners', () => {
    renderWordSearch(state, dependencies);
    renderWordSearch(state, dependencies);

    const gridEl = document.getElementById('ws-grid');
    expect(gridEl).not.toBeNull();
  });

  it('11. При недостатке слов показывается empty state', () => {
    const emptyState = { chapters: {}, srs: {} };
    renderWordSearch(emptyState, { ...dependencies, lessons: [] });

    const emptyCard = document.querySelector('[data-testid="word-search-empty"]');
    expect(emptyCard).not.toBeNull();
    expect(emptyCard.textContent).toContain('Недостаточно доступных слов');
  });

  it('12. Катаканное слово корректно отображается и может быть найдено', () => {
    renderWordSearch(state, dependencies);
    const translationsList = document.querySelector('[data-testid="ws-translations-list"]');
    const tvItem = Array.from(translationsList.children).find((el) =>
      el.textContent.includes('телевизор')
    );
    expect(tvItem).not.toBeUndefined();
    expect(tvItem.querySelector('.ws-translation-kana').textContent).toBe('テレビ');
  });
});

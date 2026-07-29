import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLibraryNotes } from '../ui/stories.js';

describe('Mini-textbook collapsible notes UI', () => {
  let state;
  let saveMock;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="library-body"></div>
    `;

    saveMock = vi.fn();

    const shortContent = 'Это короткая заметка для быстрого чтения.';
    const longContent =
      'Заголовок темы грамматики.\n'.repeat(15) +
      'Очень длинное подробное объяснение с примерами и объяснениями грамматических правил. '.repeat(
        10
      );

    state = {
      savedNotes: [
        {
          id: 'note-long-1',
          title: 'Длинная заметка 1',
          date: '2026-07-29',
          content: longContent,
        },
        {
          id: 'note-short-2',
          title: 'Короткая заметка 2',
          date: '2026-07-29',
          content: shortContent,
        },
      ],
    };
  });

  it('long note is collapsed by default and short note is shown in full without toggle button', () => {
    renderLibraryNotes(state, { save: saveMock });

    // Клик по вкладке Заметки (если рендерится внутри renderStories)
    const cardLong = document.querySelector('[data-note-id="note-long-1"]');
    const cardShort = document.querySelector('[data-note-id="note-short-2"]');

    expect(cardLong).not.toBeNull();
    expect(cardShort).not.toBeNull();

    const contentLong = cardLong.querySelector('.note-content');
    expect(contentLong.classList.contains('note-content-collapsed')).toBe(true);

    const toggleBtnLong = cardLong.querySelector('.note-toggle');
    expect(toggleBtnLong).not.toBeNull();
    expect(toggleBtnLong.getAttribute('aria-expanded')).toBe('false');
    expect(toggleBtnLong.textContent.trim()).toBe('Развернуть');

    const toggleBtnShort = cardShort.querySelector('.note-toggle');
    expect(toggleBtnShort).toBeNull();
  });

  it('clicking "Развернуть" expands long note and updates aria-expanded, clicking again collapses it', () => {
    renderLibraryNotes(state, { save: saveMock });

    const cardLong = document.querySelector('[data-note-id="note-long-1"]');
    const toggleBtn = cardLong.querySelector('.note-toggle');
    const content = cardLong.querySelector('.note-content');

    // Клик 1: Развернуть
    toggleBtn.click();

    const updatedCardLong = document.querySelector('[data-note-id="note-long-1"]');
    const updatedToggleBtn = updatedCardLong.querySelector('.note-toggle');
    const updatedContent = updatedCardLong.querySelector('.note-content');

    expect(updatedContent.classList.contains('note-content-expanded')).toBe(true);
    expect(updatedContent.classList.contains('note-content-collapsed')).toBe(false);
    expect(updatedToggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(updatedToggleBtn.textContent.trim()).toBe('Свернуть');

    // Клик 2: Свернуть
    updatedToggleBtn.click();

    const reCollapsedCard = document.querySelector('[data-note-id="note-long-1"]');
    const reCollapsedToggle = reCollapsedCard.querySelector('.note-toggle');
    const reCollapsedContent = reCollapsedCard.querySelector('.note-content');

    expect(reCollapsedContent.classList.contains('note-content-collapsed')).toBe(true);
    expect(reCollapsedToggle.getAttribute('aria-expanded')).toBe('false');
    expect(reCollapsedToggle.textContent.trim()).toBe('Развернуть');
  });

  it('deleting note works in both collapsed and expanded states without breaking note order', () => {
    renderLibraryNotes(state, { save: saveMock });

    // Разворачиваем длинную заметку
    const toggleBtn = document.querySelector('[data-note-id="note-long-1"] .note-toggle');
    toggleBtn.click();

    // Удаляем короткую заметку
    const deleteShortBtn = document.querySelector('[data-note-id="note-short-2"] .note-delete');
    deleteShortBtn.click();

    expect(state.savedNotes.length).toBe(1);
    expect(state.savedNotes[0].id).toBe('note-long-1');
    expect(saveMock).toHaveBeenCalledTimes(1);

    // Проверяем, что первая заметка осталась в развёрнутом состоянии после перерендера
    const remainingCard = document.querySelector('[data-note-id="note-long-1"]');
    expect(
      remainingCard.querySelector('.note-content').classList.contains('note-content-expanded')
    ).toBe(true);
  });
});

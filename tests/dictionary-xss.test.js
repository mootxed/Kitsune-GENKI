/* tests/dictionary-xss.test.js — Security tests for DOM XSS prevention in dictionary search */

import { describe, it, expect } from 'vitest';
import { emptyState } from '../ui/flashcards/dictionary.js';
import { escapeHtml } from '../src/utils.js';

describe('Dictionary DOM XSS Security', () => {
  it('escapes HTML tags in search input strings via escapeHtml helper', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const escaped = escapeHtml(malicious);
    expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('safely renders emptyState without parsing HTML tags in icon, title or desc', () => {
    const maliciousPayload = '<img src=x onerror=alert(1)>" onclick="alert(2)';
    const html = emptyState(
      '🔍',
      'Ничего не найдено',
      `По запросу "${maliciousPayload}" слова не найдены.`
    );

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');

    // Simulate browser parsing in DOM
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('img')).toBeNull();
    const descEl = container.querySelector('.empty-state-desc');
    expect(descEl).not.toBeNull();
    expect(descEl.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

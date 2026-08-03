/* tests/srs-badge-markup.test.js */
import { describe, it, expect, beforeEach } from 'vitest';
import { updateSrsBadge } from '../ui/shared.js';
import { state } from '../state/store.js';

describe('SRS Badge Updates with #tab-srs-badge Selector', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button class="tab" data-nav="srs">
        <span class="tab-badge hidden" id="tab-srs-badge">0</span>
        <span>SRS</span>
      </button>
    `;
    window.dueCards = () => [{ id: 'w1' }, { id: 'w2' }];
    // State initialization helper
    window.state = window.state || {};
    window.state.srs = {
      w1: { id: 'w1', due: Date.now() - 1000 },
      w2: { id: 'w2', due: Date.now() - 1000 },
    };
  });

  it('1. Updates #tab-srs-badge text and unhides when due cards exist', () => {
    updateSrsBadge();
    const badge = document.getElementById('tab-srs-badge');
    expect(badge.textContent).toBe('2');
    expect(badge.classList.contains('hidden')).toBe(false);
  });

  it('2. Hides badge when due cards count is 0', () => {
    window.dueCards = () => [];
    updateSrsBadge();
    const badge = document.getElementById('tab-srs-badge');
    expect(badge.classList.contains('hidden')).toBe(true);
  });
});

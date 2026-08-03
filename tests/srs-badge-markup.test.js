/* tests/srs-badge-markup.test.js */
import { describe, it, expect, beforeEach } from 'vitest';
import { updateSrsBadge } from '../ui/shared.js';

describe('SRS Badge Updates with #tab-srs-badge Selector', () => {
  beforeEach(() => {
    delete window.dueCards;
    document.body.innerHTML = `
      <button class="tab" data-nav="srs">
        <span class="tab-badge hidden" id="tab-srs-badge">0</span>
        <span>SRS</span>
      </button>
    `;
    const past = Date.now() - 100000;
    window.state = {
      srs: {
        w1: { id: 'w1', due: past, reps: 1, lapses: 0, state: 2 },
        w2: { id: 'w2', due: past, reps: 1, lapses: 0, state: 2 },
      },
    };
  });

  it('1. Updates #tab-srs-badge text and unhides when due cards exist', () => {
    updateSrsBadge();
    const badge = document.getElementById('tab-srs-badge');
    expect(badge.textContent).toBe('2');
    expect(badge.classList.contains('hidden')).toBe(false);
  });

  it('2. Hides badge when due cards count is 0', () => {
    window.state.srs = {
      w1: { id: 'w1', due: Date.now() + 100000, reps: 1, lapses: 0, state: 2 },
    };
    updateSrsBadge();
    const badge = document.getElementById('tab-srs-badge');
    expect(badge.classList.contains('hidden')).toBe(true);
  });
});

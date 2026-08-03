/* tests/sync-avatars-preservation.test.js */
import { describe, it, expect, beforeEach } from 'vitest';
import { syncAvatars } from '../ui/shared.js';

describe('syncAvatars Logo Preservation', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span class="logo-fox brand-fox-mark"><svg class="fox-mark"><use href="#i-fox-mark" /></svg></span>
      <span class="user-avatar">КГ</span>
    `;
    window.state = window.state || {};
    window.state.currentAvatar = '👑';
  });

  it('1. Updates .user-avatar elements without destroying .brand-fox-mark SVG logo', () => {
    syncAvatars();
    const brandMark = document.querySelector('.brand-fox-mark');
    const userAvatar = document.querySelector('.user-avatar');

    expect(brandMark.querySelector('svg')).not.toBeNull();
    expect(userAvatar.textContent).toBe('👑');
  });
});

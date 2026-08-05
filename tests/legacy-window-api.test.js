/* tests/legacy-window-api.test.js — Unit tests for installLegacyWindowApi adapter */

import { describe, test, expect, vi } from 'vitest';
import { installLegacyWindowApi } from '../adapters/legacy-window-api.js';

describe('Legacy Window API Adapter', () => {
  test('installs and cleans up legacy window exports correctly', () => {
    const fakeWindow = {};
    const mockToast = vi.fn();
    const mockNav = vi.fn();

    const cleanup = installLegacyWindowApi({
      target: fakeWindow,
      toast: mockToast,
      nav: mockNav,
    });

    expect(fakeWindow.toast).toBe(mockToast);
    expect(fakeWindow.nav).toBe(mockNav);

    cleanup();

    expect(fakeWindow.toast).toBeUndefined();
    expect(fakeWindow.nav).toBeUndefined();
  });
});

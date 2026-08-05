import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toast } from '../ui/app-shell.js';
import { initializeServiceWorker } from '../bootstrap/initialize-service-worker.js';
import * as swManager from '../src/sw-update-manager.js';

describe('Service Worker Update Toast Notification Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('DEV', false);
    document.body.innerHTML = '<div id="toast"></div>';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cancels existing toast timer, remains visible indefinitely, and handles update and later actions', async () => {
    const toastElem = document.getElementById('toast');

    // 1. Show ordinary toast with short timer (1000ms)
    toast('Обычное сообщение', { duration: 1000 });
    expect(toastElem.textContent).toBe('Обычное сообщение');
    expect(toastElem.classList.contains('show')).toBe(true);

    // Advance 500ms (before timer expires)
    vi.advanceTimersByTime(500);

    // 2. Trigger SW update notification
    let onUpdateCallback;
    vi.spyOn(swManager, 'registerAndManageSW').mockImplementation(async (url, options) => {
      onUpdateCallback = options.onUpdateAvailable;
    });

    const mockWaitingWorker = { postMessage: vi.fn() };
    await initializeServiceWorker();
    expect(typeof onUpdateCallback).toBe('function');
    onUpdateCallback(mockWaitingWorker);

    // Verify rich notification rendered
    expect(toastElem.querySelector('#sw-update-btn')).not.toBeNull();
    expect(toastElem.querySelector('#sw-later-btn')).not.toBeNull();
    expect(toastElem.classList.contains('show')).toBe(true);

    // 3. Advance fake timers past original 1000ms timer duration
    vi.advanceTimersByTime(2000);

    // 4. Ensure update notification remains visible
    expect(toastElem.classList.contains('show')).toBe(true);
    expect(toastElem.querySelector('#sw-update-btn')).not.toBeNull();

    // 5. Test both buttons
    // Test 'Позже' button closes toast
    const laterBtn = toastElem.querySelector('#sw-later-btn');
    laterBtn.click();
    expect(toastElem.classList.contains('show')).toBe(false);

    // Show update notification again to test 'Обновить' button
    onUpdateCallback(mockWaitingWorker);
    expect(toastElem.classList.contains('show')).toBe(true);

    const updateBtn = toastElem.querySelector('#sw-update-btn');
    updateBtn.click();

    expect(mockWaitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(toastElem.textContent).toBe('Обновление...');
  });
});

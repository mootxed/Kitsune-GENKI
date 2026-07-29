import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router } from '../router.js';

describe('Router Async Navigation & Race Condition Elimination', () => {
  let router;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="screen-home" class="screen hidden"></div>
      <div id="screen-dictionary" class="screen hidden"></div>
      <div id="screen-settings" class="screen hidden"></div>
      <div id="screen-srs" class="screen hidden"><div id="srs-body"></div></div>
    `;
    router = new Router();
    router.screens = ['home', 'dictionary', 'settings', 'srs'];
  });

  it('keeps exactly one visible screen in DOM after navigation', async () => {
    router.registerRenderHandler('home', () => {});
    await router.navigate('home');

    const visibleScreens = document.querySelectorAll('.screen:not(.hidden)');
    expect(visibleScreens.length).toBe(1);
    expect(visibleScreens[0].id).toBe('screen-home');
  });

  it('aborts stale async render when navigating rapidly between screens', async () => {
    let slowRenderCompleted = false;

    router.registerRenderHandler('dictionary', async (options, context) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (context.signal.aborted) return;
      slowRenderCompleted = true;
    });

    router.registerRenderHandler('settings', () => {});

    // Navigate to dictionary, then immediately to settings before dictionary finishes
    const nav1 = router.navigate('dictionary');
    const nav2 = router.navigate('settings');

    await Promise.all([nav1, nav2]);

    expect(slowRenderCompleted).toBe(false);
    expect(router.currentScreen).toBe('settings');

    const visibleScreens = document.querySelectorAll('.screen:not(.hidden)');
    expect(visibleScreens.length).toBe(1);
    expect(visibleScreens[0].id).toBe('screen-settings');
  });

  it('does not overwrite active SRS session card when mode is session', async () => {
    let dashboardRendered = false;

    router.registerRenderHandler('srs', async (options, context) => {
      if (options?.mode === 'session') return;
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (context.signal.aborted) return;
      dashboardRendered = true;
      const srsBody = document.getElementById('srs-body');
      if (srsBody) srsBody.innerHTML = '<div class="dashboard">SRS Dashboard</div>';
    });

    // SRS card session launch
    await router.navigate('srs', { mode: 'session' });
    document.getElementById('srs-body').innerHTML = '<div class="card">Flashcard #1</div>';

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(dashboardRendered).toBe(false);
    expect(document.getElementById('srs-body').innerHTML).toContain('Flashcard #1');
  });

  it('handles AbortError quietly without logging unhandled errors', async () => {
    const errorSpy = vi.spyOn(console, 'error');

    router.registerRenderHandler('dictionary', async (options, context) => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    await router.navigate('dictionary');

    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Ошибка при рендере экрана dictionary'),
      expect.anything()
    );
    errorSpy.mockRestore();
  });

  it('allows repeated navigation to the same screen cleanly', async () => {
    let renderCount = 0;
    router.registerRenderHandler('home', () => {
      renderCount++;
    });

    await router.navigate('home');
    await router.navigate('home');

    expect(renderCount).toBe(2);
    expect(router.currentScreen).toBe('home');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router } from '../router.js';
import { registerSrsTabs, activateSrsTab } from '../ui/srs-tab-controller.js';

describe('SRS Alias Async Render Cancellation', () => {
  let router;

  beforeEach(() => {
    document.body.innerHTML = `
      <section class="screen hidden" id="screen-home"></section>
      <section class="screen hidden" id="screen-srs">
        <div id="srs-tabs-container">
          <button class="lib-tab" data-tab="repetition">Повторение</button>
          <button class="lib-tab" data-tab="dictionary">Словарь</button>
          <button class="lib-tab" data-tab="user-dictionaries">Мои словари</button>
        </div>
        <div id="srs-body"></div>
      </section>
    `;
    router = new Router();
  });

  it('aborts active SRS tab render and does NOT modify hidden #srs-body when leaving dictionary route alias', async () => {
    let capturedSignal = null;
    let resolveSlowRender;
    const slowRenderPromise = new Promise((resolve) => {
      resolveSlowRender = resolve;
    });

    registerSrsTabs({
      dictionary: {
        title: 'Словарь',
        subtitle: 'Поиск и изучение слов',
        render: async (_opts, ctx) => {
          capturedSignal = ctx.signal;
          await slowRenderPromise;
          if (ctx.signal.aborted) return null;
          const body = document.getElementById('srs-body');
          if (body) body.innerHTML = '<div id="stale-content">STALE</div>';
          return true;
        },
      },
    });

    // 1. Navigate to 'dictionary' alias
    const navPromise = router.navigate('dictionary');

    // 2. Start slow render of SRS dictionary tab
    const tabPromise = activateSrsTab('dictionary', {
      routeContext: { signal: router.currentAbortController?.signal },
    });

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal.aborted).toBe(false);

    // 3. Navigate away to 'home' before render finishes
    await router.navigate('home');

    // 4. Verify AbortSignal got aborted === true
    expect(capturedSignal.aborted).toBe(true);

    // 5. Complete slow render
    resolveSlowRender();
    await tabPromise;
    await navPromise;

    // 6. Verify hidden #srs-body was not modified by stale render
    const body = document.getElementById('srs-body');
    expect(body.querySelector('#stale-content')).toBeNull();
    expect(body.innerHTML).toBe('');
  });

  it('aborts active SRS tab render and does NOT modify hidden #srs-body when leaving user-dictionaries route alias', async () => {
    let capturedSignal = null;
    let resolveSlowRender;
    const slowRenderPromise = new Promise((resolve) => {
      resolveSlowRender = resolve;
    });

    registerSrsTabs({
      'user-dictionaries': {
        title: 'Мои словари',
        subtitle: 'Личные слова отдельно от очереди',
        render: async (_opts, ctx) => {
          capturedSignal = ctx.signal;
          await slowRenderPromise;
          if (ctx.signal.aborted) return null;
          const body = document.getElementById('srs-body');
          if (body) body.innerHTML = '<div id="stale-user-dict">STALE USER DICT</div>';
          return true;
        },
      },
    });

    // 1. Navigate to 'user-dictionaries' alias
    const navPromise = router.navigate('user-dictionaries');

    // 2. Start slow render of user-dictionaries tab
    const tabPromise = activateSrsTab('user-dictionaries', {
      routeContext: { signal: router.currentAbortController?.signal },
    });

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal.aborted).toBe(false);

    // 3. Navigate away to 'home' before render finishes
    await router.navigate('home');

    // 4. Verify AbortSignal got aborted === true
    expect(capturedSignal.aborted).toBe(true);

    // 5. Complete slow render
    resolveSlowRender();
    await tabPromise;
    await navPromise;

    // 6. Verify hidden #srs-body was not modified by stale render
    const body = document.getElementById('srs-body');
    expect(body.querySelector('#stale-user-dict')).toBeNull();
    expect(body.innerHTML).toBe('');
  });
});

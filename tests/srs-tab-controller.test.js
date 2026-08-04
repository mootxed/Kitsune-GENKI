// tests/srs-tab-controller.test.js
// Unit tests for the SRS tab controller logic imported from ui/srs-tab-controller.js

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerSrsTabs,
  activateSrsTab,
  abortActiveSrsTabRender,
  getActiveSrsRenderController,
  getSrsRenderVersion,
} from '../ui/srs-tab-controller.js';

function createMinimalSrsDom() {
  document.body.innerHTML = `
    <div id="screen-srs" class="">
      <header class="app-header" style="display:flex;">
        <h1 class="app-title" id="srs-screen-title">Повторение</h1>
        <p class="app-subtitle" id="srs-screen-subtitle">Очередь FSRS и короткие сессии</p>
      </header>
      <div id="srs-tabs-container" role="tablist">
        <button class="lib-tab active" data-tab="repetition" role="tab" aria-selected="true" tabindex="0">Повторение</button>
        <button class="lib-tab" data-tab="dictionary" role="tab" aria-selected="false" tabindex="-1">Словарь</button>
        <button class="lib-tab" data-tab="particles" role="tab" aria-selected="false" tabindex="-1">Частицы</button>
        <button class="lib-tab" data-tab="user-dictionaries" role="tab" aria-selected="false" tabindex="-1">Мои словари</button>
      </div>
      <div id="srs-body"></div>
    </div>
    <div class="tabbar"><button class="tab active" data-nav="srs">SRS</button></div>
    <div id="completion-overlay" class=""></div>
  `;
}

function setupTestTabs() {
  registerSrsTabs({
    repetition: {
      title: 'Повторение',
      subtitle: 'Очередь FSRS',
      render: (_opts, _ctx) => Promise.resolve('repetition-content'),
    },
    dictionary: {
      title: 'Словарь',
      subtitle: 'Слова',
      render: (_opts, _ctx) => Promise.resolve('dictionary-content'),
    },
    particles: {
      title: 'Частицы',
      subtitle: 'Частицы',
      render: () => 'particles-sync',
    },
    'user-dictionaries': {
      title: 'Мои словари',
      subtitle: 'Личные',
      render: (_opts, _ctx) =>
        new Promise((resolve) => setTimeout(() => resolve('ud-content'), 50)),
    },
  });
}

describe('SRS tab controller — DOM state', () => {
  beforeEach(() => {
    createMinimalSrsDom();
    setupTestTabs();
  });

  afterEach(() => {
    abortActiveSrsTabRender();
    document.body.innerHTML = '';
  });

  it('activateSrsTab updates aria-selected correctly', async () => {
    await activateSrsTab('dictionary');

    const tabs = document.querySelectorAll('#srs-tabs-container .lib-tab');
    tabs.forEach((tab) => {
      if (tab.dataset.tab === 'dictionary') {
        expect(tab.getAttribute('aria-selected')).toBe('true');
        expect(tab.classList.contains('active')).toBe(true);
        expect(tab.getAttribute('tabindex')).toBe('0');
      } else {
        expect(tab.getAttribute('aria-selected')).toBe('false');
        expect(tab.classList.contains('active')).toBe(false);
        expect(tab.getAttribute('tabindex')).toBe('-1');
      }
    });
  });

  it('exactly one tab is active after any switch', async () => {
    const tabIds = ['dictionary', 'particles', 'user-dictionaries', 'repetition'];
    for (const id of tabIds) {
      await activateSrsTab(id);
      const activeTabs = document.querySelectorAll('#srs-tabs-container .lib-tab.active');
      expect(activeTabs.length).toBe(1);
      expect(activeTabs[0].dataset.tab).toBe(id);
    }
  });

  it('title updates before render completes', () => {
    activateSrsTab('particles');
    expect(document.getElementById('srs-screen-title').textContent).toBe('Частицы');
    expect(document.getElementById('srs-screen-subtitle').textContent).toBe('Частицы');
  });

  it('body is cleared synchronously before render', () => {
    const body = document.getElementById('srs-body');
    body.innerHTML = '<p>stale content</p>';

    activateSrsTab('dictionary');

    // Body should be cleared synchronously before async render resolves
    expect(body.innerHTML).toBe('');
  });

  it('unknown tabId is a no-op', async () => {
    const result = await activateSrsTab('nonexistent-tab');
    expect(result).toBeNull();
    expect(document.getElementById('srs-screen-title').textContent).toBe('Повторение');
  });
});

describe('SRS tab controller — AbortController race protection', () => {
  beforeEach(() => {
    createMinimalSrsDom();
    setupTestTabs();
  });

  afterEach(() => {
    abortActiveSrsTabRender();
    document.body.innerHTML = '';
  });

  it('rapid switching aborts previous controller', () => {
    activateSrsTab('user-dictionaries'); // slow (50ms)
    const firstController = getActiveSrsRenderController();

    activateSrsTab('particles'); // fast (sync)
    const secondController = getActiveSrsRenderController();

    // First controller should be aborted
    expect(firstController?.signal.aborted).toBe(true);
    // Second controller should NOT be aborted
    expect(secondController?.signal.aborted).toBe(false);
  });

  it('version counter increments on each tab switch', () => {
    const initialVersion = getSrsRenderVersion();

    activateSrsTab('dictionary');
    expect(getSrsRenderVersion()).toBe(initialVersion + 1);

    activateSrsTab('particles');
    expect(getSrsRenderVersion()).toBe(initialVersion + 2);

    activateSrsTab('repetition');
    expect(getSrsRenderVersion()).toBe(initialVersion + 3);
  });

  it('three rapid switches: first two aborted, last is not', async () => {
    const p1 = activateSrsTab('user-dictionaries');
    const c1 = getActiveSrsRenderController();
    const p2 = activateSrsTab('dictionary');
    const c2 = getActiveSrsRenderController();
    const p3 = activateSrsTab('particles');
    const c3 = getActiveSrsRenderController();

    expect(c1?.signal.aborted).toBe(true);
    expect(c2?.signal.aborted).toBe(true);
    expect(c3?.signal.aborted).toBe(false);

    const res1 = await p1;
    const res2 = await p2;
    const res3 = await p3;

    expect(res1).toBeNull();
    expect(res2).toBeNull();
    expect(res3).toBe('particles-sync');

    const activeTab = document.querySelector('#srs-tabs-container .lib-tab.active');
    expect(activeTab?.dataset.tab).toBe('particles');
  });

  it('linking router signal aborts tab render when outer route aborts', async () => {
    const routerController = new AbortController();
    const tabPromise = activateSrsTab('user-dictionaries', {
      routeContext: { signal: routerController.signal },
    });

    const activeCtrl = getActiveSrsRenderController();
    expect(activeCtrl?.signal.aborted).toBe(false);

    routerController.abort();
    expect(activeCtrl?.signal.aborted).toBe(true);

    const result = await tabPromise;
    expect(result).toBeNull();
  });
});

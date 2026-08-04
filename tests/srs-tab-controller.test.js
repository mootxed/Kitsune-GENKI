// tests/srs-tab-controller.test.js
// Unit tests for the SRS tab controller logic (activateSrsTab, AbortController race protection)
// Uses jsdom via vitest's happy-dom or jsdom environment

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We test the controller logic in isolation by recreating the minimal DOM
// and the key functions inline (since they are closures in app.js)

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

// Minimal reproduction of activateSrsTab logic for unit testing
function makeController() {
  let activeSrsRenderController = null;
  let srsRenderVersion = 0;

  const SRS_TABS = {
    repetition: {
      title: 'Повторение',
      subtitle: 'Очередь FSRS',
      render: (_ctx) => Promise.resolve('repetition-content'),
    },
    dictionary: {
      title: 'Словарь',
      subtitle: 'Слова',
      render: (_ctx) => Promise.resolve('dictionary-content'),
    },
    particles: { title: 'Частицы', subtitle: 'Частицы', render: () => 'particles-sync' },
    'user-dictionaries': {
      title: 'Мои словари',
      subtitle: 'Личные',
      render: (_ctx) => new Promise((resolve) => setTimeout(() => resolve('ud-content'), 50)),
    },
  };

  function activateSrsTab(tabId) {
    const tabDef = SRS_TABS[tabId];
    if (!tabDef) return null;

    activeSrsRenderController?.abort();
    activeSrsRenderController = new AbortController();
    const version = ++srsRenderVersion;
    const ctx = { signal: activeSrsRenderController.signal };

    document.querySelectorAll('#srs-tabs-container .lib-tab').forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    const titleEl = document.getElementById('srs-screen-title');
    const subtitleEl = document.getElementById('srs-screen-subtitle');
    if (titleEl) titleEl.textContent = tabDef.title;
    if (subtitleEl) subtitleEl.textContent = tabDef.subtitle;

    const body = document.getElementById('srs-body');
    if (body) body.innerHTML = '';

    let result;
    try {
      result = tabDef.render(ctx);
    } catch (err) {
      if (!ctx.signal.aborted) throw err;
    }
    return { result, ctx, version, abortController: activeSrsRenderController };
  }

  return { activateSrsTab, getVersion: () => srsRenderVersion };
}

describe('SRS tab controller — DOM state', () => {
  beforeEach(() => {
    createMinimalSrsDom();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('activateSrsTab updates aria-selected correctly', () => {
    const { activateSrsTab } = makeController();
    activateSrsTab('dictionary');

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

  it('exactly one tab is active after any switch', () => {
    const { activateSrsTab } = makeController();
    const tabIds = ['dictionary', 'particles', 'user-dictionaries', 'repetition'];
    for (const id of tabIds) {
      activateSrsTab(id);
      const activeTabs = document.querySelectorAll('#srs-tabs-container .lib-tab.active');
      expect(activeTabs.length).toBe(1);
      expect(activeTabs[0].dataset.tab).toBe(id);
    }
  });

  it('title updates before render completes', () => {
    const { activateSrsTab } = makeController();
    activateSrsTab('particles');
    expect(document.getElementById('srs-screen-title').textContent).toBe('Частицы');
    expect(document.getElementById('srs-screen-subtitle').textContent).toBe('Частицы');
  });

  it('body is cleared synchronously before render', () => {
    const body = document.getElementById('srs-body');
    body.innerHTML = '<p>stale content</p>';

    const { activateSrsTab } = makeController();
    activateSrsTab('dictionary');

    // Body should be cleared synchronously before async render resolves
    expect(body.innerHTML).toBe('');
  });

  it('unknown tabId is a no-op', () => {
    const { activateSrsTab } = makeController();
    const result = activateSrsTab('nonexistent-tab');
    expect(result).toBeNull();
    // Title unchanged
    expect(document.getElementById('srs-screen-title').textContent).toBe('Повторение');
  });
});

describe('SRS tab controller — AbortController race protection', () => {
  beforeEach(() => {
    createMinimalSrsDom();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('rapid switching aborts previous controller', () => {
    const { activateSrsTab } = makeController();

    const r1 = activateSrsTab('user-dictionaries'); // slow (50ms)
    const r2 = activateSrsTab('particles'); // fast (sync)

    // First controller should be aborted
    expect(r1.ctx.signal.aborted).toBe(true);
    // Second controller should NOT be aborted
    expect(r2.ctx.signal.aborted).toBe(false);
  });

  it('version counter increments on each tab switch', () => {
    const { activateSrsTab, getVersion } = makeController();
    const initialVersion = getVersion();

    activateSrsTab('dictionary');
    expect(getVersion()).toBe(initialVersion + 1);

    activateSrsTab('particles');
    expect(getVersion()).toBe(initialVersion + 2);

    activateSrsTab('repetition');
    expect(getVersion()).toBe(initialVersion + 3);
  });

  it('three rapid switches: first two aborted, last is not', async () => {
    const { activateSrsTab } = makeController();

    const r1 = activateSrsTab('user-dictionaries'); // slow (50ms)
    const r2 = activateSrsTab('dictionary'); // async
    const r3 = activateSrsTab('particles'); // sync

    expect(r1.ctx.signal.aborted).toBe(true);
    expect(r2.ctx.signal.aborted).toBe(true);
    expect(r3.ctx.signal.aborted).toBe(false);

    // Last tab is particles
    const activeTab = document.querySelector('#srs-tabs-container .lib-tab.active');
    expect(activeTab?.dataset.tab).toBe('particles');
  });
});

describe('SRS tab controller — keyboard navigation', () => {
  beforeEach(() => {
    createMinimalSrsDom();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('handleSrsTabKeydown wraps ArrowRight at end to first tab', () => {
    const tabs = [...document.querySelectorAll('#srs-tabs-container [role="tab"]')];

    // Simulate the logic inline
    function getNextIndex(currentIdx, key) {
      if (key === 'ArrowRight') return (currentIdx + 1) % tabs.length;
      if (key === 'ArrowLeft') return (currentIdx - 1 + tabs.length) % tabs.length;
      if (key === 'Home') return 0;
      if (key === 'End') return tabs.length - 1;
      return currentIdx;
    }

    // Last tab → ArrowRight → first tab
    expect(getNextIndex(tabs.length - 1, 'ArrowRight')).toBe(0);
    // First tab → ArrowLeft → last tab
    expect(getNextIndex(0, 'ArrowLeft')).toBe(tabs.length - 1);
    // Home always → 0
    expect(getNextIndex(2, 'Home')).toBe(0);
    // End always → last
    expect(getNextIndex(1, 'End')).toBe(tabs.length - 1);
  });
});

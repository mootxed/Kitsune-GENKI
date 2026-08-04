/* ui/srs-tab-controller.js — SRS inline tab navigation controller */

let activeSrsRenderController = null;
let srsRenderVersion = 0;
let srsTabsRegistry = {};

/**
 * Register available SRS tabs definitions
 * @param {Object} tabs - Dictionary of tab definitions { tabId: { title, subtitle, render } }
 */
export function registerSrsTabs(tabs) {
  srsTabsRegistry = { ...tabs };
}

export function getActiveSrsRenderController() {
  return activeSrsRenderController;
}

export function getSrsRenderVersion() {
  return srsRenderVersion;
}

/**
 * Abort active SRS tab rendering process if running
 */
export function abortActiveSrsTabRender() {
  if (activeSrsRenderController) {
    activeSrsRenderController.abort();
    activeSrsRenderController = null;
  }
}

/**
 * Activate an SRS inline tab and execute its renderer
 * @param {string} tabId - Identifier of tab to activate ('repetition', 'dictionary', 'particles', 'user-dictionaries')
 * @param {Object} [options]
 * @param {Object} [options.renderOptions] - Options passed to renderer
 * @param {Object} [options.routeContext] - Context from router (contains outer signal)
 * @returns {Promise<*>} Result promise of the tab renderer
 */
export async function activateSrsTab(tabId, options = {}) {
  const tabDef = srsTabsRegistry[tabId];
  if (!tabDef) return null;

  const { renderOptions = {}, routeContext = {} } = options;

  // Cancel any previous in-flight SRS tab render
  abortActiveSrsTabRender();

  activeSrsRenderController = new AbortController();
  const activeController = activeSrsRenderController;

  if (routeContext.signal) {
    routeContext.signal.addEventListener(
      'abort',
      () => {
        if (activeSrsRenderController === activeController) {
          abortActiveSrsTabRender();
        }
      },
      { once: true }
    );
  }

  const version = ++srsRenderVersion;
  const ctx = {
    ...routeContext,
    signal: activeController.signal,
  };

  // Update tab active/aria attributes atomically
  document.querySelectorAll('#srs-tabs-container .lib-tab').forEach((btn) => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  // Update title BEFORE render to avoid stale header text
  const titleEl = document.getElementById('srs-screen-title');
  const subtitleEl = document.getElementById('srs-screen-subtitle');
  if (titleEl) titleEl.textContent = tabDef.title;
  if (subtitleEl) subtitleEl.textContent = tabDef.subtitle;

  // Clear body synchronously before starting render
  const body = document.getElementById('srs-body');
  if (body) body.innerHTML = '';

  // Ensure screen visibility flags
  const tabsContainer = document.getElementById('srs-tabs-container');
  if (tabsContainer) {
    tabsContainer.classList.remove('hidden');
    tabsContainer.style.display = '';
  }
  const srsScreen = document.getElementById('screen-srs');
  if (srsScreen) srsScreen.classList.remove('srs-session-active');
  document.body.classList.remove('srs-session-active');
  const srsHeader = document.querySelector('#screen-srs .app-header');
  if (srsHeader) srsHeader.style.display = 'flex';
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = '';
  document.getElementById('completion-overlay')?.classList.add('hidden');

  try {
    const result = await Promise.resolve(tabDef.render(renderOptions, ctx));
    if (ctx.signal.aborted || version !== srsRenderVersion) {
      return null;
    }
    return result;
  } catch (err) {
    if (!ctx.signal.aborted && version === srsRenderVersion) {
      console.error(`[SRS] Tab render error (${tabId}):`, err);
    }
    return null;
  }
}

export function handleSrsTabKeydown(e) {
  const tabs = [...document.querySelectorAll('#srs-tabs-container [role="tab"]')];
  if (!tabs.length) return;
  const currentIdx = tabs.findIndex((t) => t === document.activeElement);
  let nextIdx;
  if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = tabs.length - 1;
  else return;

  e.preventDefault();
  tabs[nextIdx].focus();
  activateSrsTab(tabs[nextIdx].dataset.tab);
}

export function initSrsTabsDelegate() {
  const container = document.getElementById('srs-tabs-container');
  if (!container || container.dataset.delegateAttached) return;
  container.dataset.delegateAttached = 'true';
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn || !container.contains(btn)) return;
    const srsScreen = document.getElementById('screen-srs');
    if (srsScreen?.classList.contains('hidden')) return;
    if (
      btn.dataset.tab === document.querySelector('#srs-tabs-container .lib-tab.active')?.dataset.tab
    ) {
      return;
    }
    activateSrsTab(btn.dataset.tab);
  });
  container.addEventListener('keydown', handleSrsTabKeydown);
}

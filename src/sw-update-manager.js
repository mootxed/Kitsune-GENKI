/**
 * src/sw-update-manager.js
 *
 * Pure module (no direct DOM manipulation) that orchestrates the Service Worker
 * update lifecycle.  All DOM side-effects are injected via callbacks so this
 * module can be unit-tested in a Node/jsdom environment.
 *
 * Update lifecycle:
 *   1. SW install fires → registration.installing transitions through states
 *   2. When new SW is installed (state === 'installed') and a controller exists,
 *      the page is already running under an old SW → show update notification.
 *   3. User clicks "Обновить" → postMessage({type:'SKIP_WAITING'}) to waiting SW
 *   4. New SW calls skipWaiting() → becomes active → fires 'controllerchange'
 *   5. On 'controllerchange' the page reloads once (protected by reload-guard flag)
 *
 * Protection against reload loops:
 *   A sessionStorage flag `sw-reload-guard` is set before reload.  On init,
 *   if this flag is present the page was just reloaded by the update flow,
 *   so we clear the flag and do NOT register another controllerchange listener
 *   that might reload again.
 *
 * "Позже" flow:
 *   The waiting SW reference is saved.  The next time the user visits (new
 *   session) the update notification appears again naturally via 'updatefound'.
 */

// ===== Types for JSDoc =====
/**
 * @typedef {Object} UpdateManagerCallbacks
 * @property {function(waitingWorker: ServiceWorker): void} onUpdateAvailable
 *   Called when a new SW is waiting. Should show the update notification.
 * @property {function(): void} [onUpdateActivated]
 *   Called just before page reload.
 * @property {function(status: 'unsupported'|'failed'|'installing'|'ready'|'updated'): void} [onStatusChange]
 *   Called when SW registration status changes.
 */

const RELOAD_GUARD_KEY = 'kitsune-sw-reload-guard';

/**
 * Returns true if the current page load was triggered by the SW update flow.
 * Clears the flag so subsequent reloads are not blocked.
 * @returns {boolean}
 */
export function wasReloadedAfterUpdate() {
  if (typeof sessionStorage === 'undefined') return false;
  const flag = sessionStorage.getItem(RELOAD_GUARD_KEY);
  if (flag) {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    return true;
  }
  return false;
}

let activationRequested = false;

/**
 * Sets whether update activation was requested by user action.
 * @param {boolean} [requested=true]
 */
export function setActivationRequested(requested = true) {
  activationRequested = requested;
}

/**
 * Sends SKIP_WAITING to the waiting service worker.
 * @param {ServiceWorker} waitingWorker
 */
export function activateWaitingWorker(waitingWorker) {
  if (!waitingWorker) {
    console.warn('[SWUpdateManager] activateWaitingWorker called with no worker');
    return;
  }
  setActivationRequested(true);
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * Sets the reload guard and reloads the page.
 * Called after controllerchange fires.
 * @param {Function} [onBeforeReload]
 */
export async function performControlledReload(onBeforeReload) {
  if (typeof onBeforeReload === 'function') {
    try {
      await onBeforeReload();
    } catch (err) {
      console.warn('[SWUpdateManager] Ошибка сохранения состояния перед перезагрузкой:', err);
    }
  } else if (
    typeof window !== 'undefined' &&
    typeof window.saveActiveSessionBeforeReload === 'function'
  ) {
    try {
      await window.saveActiveSessionBeforeReload();
    } catch (err) {
      console.warn('[SWUpdateManager] Ошибка сохранения активной сессии:', err);
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  }
  if (typeof window !== 'undefined' && window.location) {
    window.location.reload();
  }
}

/**
 * Registers and manages the full SW update lifecycle.
 *
 * @param {string} swUrl - Path to the service worker script
 * @param {UpdateManagerCallbacks} callbacks
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerAndManageSW(swUrl, callbacks) {
  if (!('serviceWorker' in navigator)) {
    callbacks.onStatusChange?.('unsupported');
    return null;
  }

  // If this page load was triggered by our own update flow, don't add a new
  // controllerchange listener (prevents infinite reload loop).
  const justReloaded = wasReloadedAfterUpdate();
  if (justReloaded) {
    callbacks.onStatusChange?.('updated');
    // Still register to get future updates, but don't listen for controllerchange
    try {
      return await navigator.serviceWorker.register(swUrl);
    } catch (err) {
      console.error('[SWUpdateManager] Re-registration failed after reload:', err);
      return null;
    }
  }

  // Listen for controllerchange — fires when the new SW takes over
  // We attach this BEFORE registering so we don't miss the event
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    async () => {
      if (!activationRequested) {
        console.log('[SWUpdateManager] controllerchange ignored (not requested by user)');
        return;
      }
      callbacks.onStatusChange?.('updated');
      await performControlledReload(callbacks.onUpdateActivated);
    },
    { once: true }
  );

  let registration = null;
  try {
    registration = await navigator.serviceWorker.register(swUrl);
    callbacks.onStatusChange?.('installing');

    // Check for a waiting worker from a previous navigation
    if (registration.waiting && navigator.serviceWorker.controller) {
      callbacks.onUpdateAvailable(registration.waiting);
    }

    // Watch for future updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New SW is installed but waiting — show notification
          callbacks.onUpdateAvailable(newWorker);
        } else if (newWorker.state === 'activated' && !navigator.serviceWorker.controller) {
          // First install completed
          callbacks.onStatusChange?.('ready');
        }
      });
    });

    // If there's already an active controller, we are ready for offline
    if (navigator.serviceWorker.controller) {
      callbacks.onStatusChange?.('ready');
    }
  } catch (err) {
    console.error('[SWUpdateManager] Registration failed:', err);
    callbacks.onStatusChange?.('failed');
    return null;
  }

  return registration;
}

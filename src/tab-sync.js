/* src/tab-sync.js — Single-writer BroadcastChannel & Web Locks tab coordination */

import { safeStorage } from './safe-storage.js';
import { secureRandomId } from './utils.js';

let isPrimary = false;
let tabChannel = null;
let activeSessionLock = null;
let secondaryTabCallback = null;
let stateUpdateCallback = null;
let heartbeatIntervalId = null;
let lockAbortController = null;

const TAB_ID = secureRandomId();
const CHANNEL_NAME = 'kotokitsu_tab_channel';
const LOCK_NAME = 'kotokitsu_writer_lock';
const LEASE_KEY = 'kotokitsu_leader_lease';
const LEASE_TTL_MS = 4000;

export function isPrimaryTab() {
  return isPrimary;
}

export function getTabId() {
  return TAB_ID;
}

export function getActiveSessionLock() {
  return activeSessionLock;
}

export function onStateUpdate(cb) {
  stateUpdateCallback = cb;
}

function setPrimaryState(primary, sessionMeta = null) {
  const wasPrimary = isPrimary;
  isPrimary = primary;

  if (!primary && typeof secondaryTabCallback === 'function' && wasPrimary !== primary) {
    secondaryTabCallback({ isPrimary: false, sessionMeta: sessionMeta || activeSessionLock });
  }
}

function startHeartbeatFallback() {
  stopHeartbeatFallback();

  const tryClaimLease = () => {
    try {
      const raw = safeStorage.getItem(LEASE_KEY);
      const now = Date.now();
      let lease = null;
      if (raw) {
        try {
          lease = JSON.parse(raw);
        } catch {
          /* ignore */
        }
      }

      if (isPrimary) {
        // We already own the lease — just refresh it
        if (!lease || lease.tabId === TAB_ID) {
          safeStorage.setItem(
            LEASE_KEY,
            JSON.stringify({ tabId: TAB_ID, expiresAt: now + LEASE_TTL_MS })
          );
        } else {
          // Another tab stole the lease — demote ourselves
          setPrimaryState(false);
        }
      } else if (!lease || !lease.expiresAt || lease.expiresAt < now) {
        // Lease expired or missing — safe to claim leadership
        safeStorage.setItem(
          LEASE_KEY,
          JSON.stringify({ tabId: TAB_ID, expiresAt: now + LEASE_TTL_MS })
        );
        setPrimaryState(true);
        if (tabChannel) {
          try {
            tabChannel.postMessage({ type: 'PRIMARY_CLAIM', tabId: TAB_ID });
          } catch {
            /* ignore */
          }
        }
      }
      // else: another tab holds a valid lease — stay secondary, do nothing
    } catch {
      /* ignore */
    }
  };

  tryClaimLease();
  heartbeatIntervalId = setInterval(tryClaimLease, 1500);
}

function stopHeartbeatFallback() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

async function requestWebLock() {
  if (
    typeof navigator === 'undefined' ||
    !navigator.locks ||
    typeof navigator.locks.request !== 'function'
  ) {
    startHeartbeatFallback();
    return;
  }

  try {
    lockAbortController = new AbortController();
    await navigator.locks.request(LOCK_NAME, { signal: lockAbortController.signal }, async () => {
      setPrimaryState(true);
      if (tabChannel) {
        try {
          tabChannel.postMessage({ type: 'PRIMARY_CLAIM', tabId: TAB_ID });
        } catch {
          /* ignore */
        }
      }

      // Hold the lock until tab unloads or lock is explicitly aborted
      return new Promise((resolve) => {
        window.addEventListener(
          'beforeunload',
          () => {
            setPrimaryState(false);
            resolve();
          },
          { once: true }
        );
        if (lockAbortController) {
          lockAbortController.signal.addEventListener('abort', () => {
            setPrimaryState(false);
            resolve();
          });
        }
      });
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      // Intentionally aborted for takeover
      return;
    }
    console.warn('[TabSync] Web Locks error, falling back to heartbeat lease:', err);
    startHeartbeatFallback();
  }
}

export function initTabSync(onSecondaryTabDetected) {
  secondaryTabCallback = onSecondaryTabDetected;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      tabChannel = new BroadcastChannel(CHANNEL_NAME);

      tabChannel.onmessage = (event) => {
        const { type, tabId, revision, sessionMeta } = event.data || {};
        if (!type || tabId === TAB_ID) return;

        if (type === 'PING') {
          if (isPrimary) {
            tabChannel.postMessage({
              type: 'PRIMARY_ACK',
              tabId: TAB_ID,
              sessionMeta: activeSessionLock,
            });
          }
        } else if (type === 'PRIMARY_ACK' || type === 'PRIMARY_CLAIM') {
          if (isPrimary && tabId !== TAB_ID) {
            // Another tab is or became primary
            setPrimaryState(false, sessionMeta);
          } else if (!isPrimary) {
            if (sessionMeta) {
              activeSessionLock = sessionMeta;
            }
            if (typeof secondaryTabCallback === 'function') {
              secondaryTabCallback({ isPrimary: false, sessionMeta });
            }
          }
        } else if (type === 'STATE_UPDATED') {
          if (typeof stateUpdateCallback === 'function') {
            stateUpdateCallback(revision);
          }
        } else if (type === 'SESSION_STARTED') {
          activeSessionLock = sessionMeta || true;
          if (!isPrimary && typeof secondaryTabCallback === 'function') {
            secondaryTabCallback({ isPrimary: false, sessionMeta: activeSessionLock });
          }
        } else if (type === 'SESSION_ENDED') {
          activeSessionLock = null;
        } else if (type === 'TAKEOVER_REQ') {
          if (isPrimary) {
            yieldLeadership();
          }
        } else if (type === 'TAB_CLOSED') {
          // If primary closed, non-primary tabs try to request lock or claim lease
          if (!isPrimary) {
            if (typeof navigator !== 'undefined' && navigator.locks) {
              requestWebLock();
            } else {
              startHeartbeatFallback();
            }
          }
        }
      };

      window.addEventListener('beforeunload', () => {
        if (tabChannel) {
          tabChannel.postMessage({ type: 'TAB_CLOSED', tabId: TAB_ID });
          tabChannel.close();
        }
      });
    } catch (e) {
      console.warn('[TabSync] BroadcastChannel init error:', e);
    }
  }

  // Request Web Lock or start heartbeat lease
  requestWebLock();

  // Announce presence
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'PING', tabId: TAB_ID });
    } catch {
      /* ignore */
    }
  }
}

export function yieldLeadership() {
  if (lockAbortController) {
    lockAbortController.abort();
    lockAbortController = null;
  }
  stopHeartbeatFallback();
  setPrimaryState(false);
}

export function broadcastStateUpdated(revision) {
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'STATE_UPDATED', tabId: TAB_ID, revision });
    } catch {
      /* ignore */
    }
  }
}

export function broadcastSessionStarted(sessionMeta = {}) {
  activeSessionLock = sessionMeta;
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'SESSION_STARTED', tabId: TAB_ID, sessionMeta });
    } catch {
      /* ignore */
    }
  }
}

export function broadcastSessionEnded() {
  activeSessionLock = null;
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'SESSION_ENDED', tabId: TAB_ID });
    } catch {
      /* ignore */
    }
  }
}

export function claimPrimaryTab() {
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'TAKEOVER_REQ', tabId: TAB_ID });
    } catch {
      /* ignore */
    }
  }
  requestWebLock();
}

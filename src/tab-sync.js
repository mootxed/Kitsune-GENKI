/* src/tab-sync.js — Single-writer BroadcastChannel tab coordination & multi-tab protection */

let isPrimary = true;
let tabChannel = null;
let activeSessionLock = null;
let secondaryTabCallback = null;
let stateUpdateCallback = null;

const TAB_ID = Math.random().toString(36).substring(2, 9);
const CHANNEL_NAME = 'kotokitsu_tab_channel';

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

export function initTabSync(onSecondaryTabDetected) {
  secondaryTabCallback = onSecondaryTabDetected;
  if (typeof BroadcastChannel === 'undefined') return;

  try {
    tabChannel = new BroadcastChannel(CHANNEL_NAME);

    // Announce presence to existing tabs
    tabChannel.postMessage({ type: 'PING', tabId: TAB_ID });

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
      } else if (type === 'PRIMARY_ACK') {
        isPrimary = false;
        if (sessionMeta) {
          activeSessionLock = sessionMeta;
        }
        if (typeof secondaryTabCallback === 'function') {
          secondaryTabCallback({ isPrimary: false, sessionMeta });
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
        isPrimary = false;
        if (typeof secondaryTabCallback === 'function') {
          secondaryTabCallback({ isPrimary: false, takeoverRequested: true });
        }
      } else if (type === 'TAB_CLOSED') {
        if (!isPrimary) {
          tabChannel.postMessage({ type: 'PING', tabId: TAB_ID });
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

export function broadcastStateUpdated(revision) {
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'STATE_UPDATED', tabId: TAB_ID, revision });
    } catch (_) {
      /* ignore */
    }
  }
}

export function broadcastSessionStarted(sessionMeta = {}) {
  activeSessionLock = sessionMeta;
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'SESSION_STARTED', tabId: TAB_ID, sessionMeta });
    } catch (_) {
      /* ignore */
    }
  }
}

export function broadcastSessionEnded() {
  activeSessionLock = null;
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'SESSION_ENDED', tabId: TAB_ID });
    } catch (_) {
      /* ignore */
    }
  }
}

export function claimPrimaryTab() {
  isPrimary = true;
  if (tabChannel) {
    try {
      tabChannel.postMessage({ type: 'TAKEOVER_REQ', tabId: TAB_ID });
    } catch (_) {
      /* ignore */
    }
  }
}

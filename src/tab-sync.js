/* src/tab-sync.js — Single-writer BroadcastChannel tab coordination */

let isPrimary = true;
let tabChannel = null;
const TAB_ID = Math.random().toString(36).substring(2, 9);
const CHANNEL_NAME = 'kitsune_tab_channel';

export function isPrimaryTab() {
  return isPrimary;
}

export function initTabSync(onSecondaryTabDetected) {
  if (typeof BroadcastChannel === 'undefined') return;

  try {
    tabChannel = new BroadcastChannel(CHANNEL_NAME);

    // Announce existence to existing tabs
    tabChannel.postMessage({ type: 'PING', tabId: TAB_ID });

    tabChannel.onmessage = (event) => {
      const { type, tabId } = event.data || {};
      if (!type || tabId === TAB_ID) return;

      if (type === 'PING') {
        if (isPrimary) {
          // Respond that we are already primary
          tabChannel.postMessage({ type: 'PRIMARY_ACK', tabId: TAB_ID });
        }
      } else if (type === 'PRIMARY_ACK') {
        // Another tab responded as primary
        isPrimary = false;
        if (typeof onSecondaryTabDetected === 'function') {
          onSecondaryTabDetected();
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

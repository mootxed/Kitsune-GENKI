/* bootstrap/register-global-events.js — Global window and visibility event listeners */

import { saveActiveSessionState } from '../ui/flashcards/session.js';
import { scheduleNotify } from '../ui/app-shell.js';

export function registerGlobalEvents(dependencies) {
  if (typeof window === 'undefined') return;

  function handleAppUnload() {
    if (dependencies?.save) dependencies.save(true);
    saveActiveSessionState();
  }

  window.addEventListener('beforeunload', handleAppUnload);
  window.addEventListener('pagehide', handleAppUnload);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleAppUnload();
      } else if (!document.hidden && dependencies?.state?.settings?.notifyEnabled) {
        scheduleNotify();
      }
    });
  }
}

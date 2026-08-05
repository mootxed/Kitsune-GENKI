/* bootstrap/bootstrap-application.js — Master application bootstrapper */

import { initializeState } from './initialize-state.js';
import { initializeCourses } from './initialize-courses.js';
import { initializeServiceWorker } from './initialize-service-worker.js';
import { registerGlobalEvents } from './register-global-events.js';
import { initDevTools } from '../src/dev-tools.js';
import { initPomodoro } from '../ui/pomodoro.js';
import { shouldShowOnboarding } from '../src/onboarding-state.js';
import {
  loadSessionFromDB,
  clearSessionFromDB,
  validateSessionRecord,
} from '../session-manager.js';
import { restoreActiveSessionRecord } from '../ui/flashcards/session.js';
import { showSessionRecoveryModal } from '../ui/session-recovery-modal.js';
import {
  setupAppShell,
  applyTheme,
  checkStorageDegradedBanner,
  toast,
  scheduleOneHourReminder,
  scheduleNotify,
  calculateNextNotificationDate,
  showNotification,
} from '../ui/app-shell.js';
import {
  syncAvatars,
  refreshStreakDisplay,
  applyStreakSkin,
  applyCustomTheme,
} from '../ui/shared.js';
import { installLegacyWindowApi } from '../adapters/legacy-window-api.js';
import { dueCards } from '../src/srs-helpers.js';
import { renderFlash } from '../ui/flashcards.js';

export async function bootstrapApplication(dependencies) {
  // 1. Intercept logs & initialize developer tools
  initDevTools();

  // 2. Storage & state initialization
  await initializeState(dependencies);

  const state = dependencies.state;

  // 3. Quests & Achievements initialization
  if (dependencies.QuestsManager) {
    dependencies.QuestsManager.initializeQuests(state);
    dependencies.QuestsManager.checkQuestReset(state);
  }

  // 4. Course manifest and lesson loading
  await initializeCourses(state, dependencies.save);

  // 5. Apply theme settings
  applyTheme();

  // 6. Setup application UI shell & router
  const shell = setupAppShell(dependencies);

  // 7. Initialize Pomodoro sub-system
  initPomodoro(dependencies);

  // 8. Initial navigation check (onboarding vs home)
  if (shouldShowOnboarding(state)) {
    history.replaceState({ screen: 'onboarding' }, '', '');
    dependencies.nav('onboarding', null, true);
  } else {
    history.replaceState({ screen: 'home' }, '', '');
    dependencies.nav('home', null, true);
  }

  state.initialized = true;
  checkStorageDegradedBanner();

  // 9. Unrecovered active session check & recovery modal
  try {
    const activeSession = await loadSessionFromDB();
    if (activeSession && !validateSessionRecord(activeSession)) {
      await clearSessionFromDB();
      console.warn('[Init] Повреждённая запись active session очищена при старте');
    } else if (activeSession && !shouldShowOnboarding(state)) {
      showSessionRecoveryModal(activeSession, {
        onResume: async () => {
          const restored = await restoreActiveSessionRecord(activeSession, state, dependencies);
          if (restored) {
            dependencies.nav('srs', { mode: 'session' });
            renderFlash(state, dependencies);
          } else {
            await clearSessionFromDB();
          }
        },
        onRestart: async () => {
          const sessionType = activeSession?.sessionType;
          const chapterId = activeSession?.chapterId;
          await clearSessionFromDB();
          if (sessionType === 'chapter' && chapterId && shell.startChapterFlashcardsFn) {
            const due = dueCards(state.srs, chapterId);
            if (!due || due.length === 0) {
              toast('Нет карточек для повторения в этой главе');
              dependencies.nav('chapter', chapterId);
              return;
            }
            shell.startChapterFlashcardsFn(chapterId, due);
          } else if (shell.startSrsSessionFn) {
            shell.startSrsSessionFn();
          }
        },
        onCancel: async () => {
          await clearSessionFromDB();
          dependencies.nav('srs');
        },
      });
    }
  } catch (err) {
    console.warn('[Init] Ошибка при проверке невозобновленной сессии:', err);
  }

  // 10. UI Avatars, streak display, custom theme sync
  syncAvatars();
  refreshStreakDisplay();
  applyStreakSkin();
  applyCustomTheme();

  // 11. Dismiss startup app loader screen
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.classList.add('hidden');
    loader.style.pointerEvents = 'none';
    loader.style.transition = 'opacity 0.3s ease';
    loader.style.opacity = '0';
    setTimeout(() => {
      if (loader.parentNode) loader.remove();
    }, 300);
  }

  // 12. Register global window & visibility event listeners
  registerGlobalEvents(dependencies);

  // 13. Service Worker registration
  await initializeServiceWorker();

  // 14. Install intentional legacy window API adapter
  const cleanupLegacyApi = installLegacyWindowApi({
    srs: dependencies.SRS,
    questsManager: dependencies.QuestsManager,
    achievementSystem: dependencies.AchievementSystem,
    speakJapanese: dependencies.speakJapanese,
    stopSpeaking: dependencies.stopSpeaking,
    formatTimeUntilReset: dependencies.formatTimeUntilReset,
    toast,
    applyTheme,
    showNotification,
    scheduleNotify,
    scheduleOneHourReminder,
    calculateNextNotificationDate,
    nav: dependencies.nav,
    updateTabIndicator: dependencies.updateTabIndicator,
  });

  return {
    cleanup: () => {
      cleanupLegacyApi();
    },
  };
}

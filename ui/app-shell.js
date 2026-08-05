/* ui/app-shell.js — Top-level UI shell and lifecycle coordinator */

import { $, $$ } from '../src/utils.js';
import { safeStorage } from '../src/safe-storage.js';
import { getDailyStudyDigest } from '../src/daily-study-digest.js';
import { localDateKey } from '../src/local-date.js';
import { state, isStorageDegraded, save as saveToStore } from '../state/store.js';
import { initRouter, nav } from './router.js';
import { SRS } from '../srs.js';
import { QuestsManager } from '../quests.js';
import { SessionManager } from '../session-manager.js';
import { limitNewCardsForSession } from '../src/srs-limits.js';
import {
  saveActiveSessionState,
  setSessionOrigin,
  abandonActiveSession,
} from './flashcards/session.js';
import { getSessionManager } from './flashcards/state.js';
import {
  renderFlash,
  renderDictionary,
  startExtraReview,
  setFlashQueue,
  setFlashIdx,
  setFlashRevealed,
  setFlashCtx,
  setSessionManager,
  initSessionBatching,
} from './flashcards.js';
import { LESSONS, ensureLesson, ensureLessonsForSrs, renderHome, renderCourse } from './home.js';
import { renderChapter } from './chapter.js';
import { canonicalLessonId } from '../src/courses/course-context.js';
import { renderProfile, renderQuests } from './profile.js';
import { renderOnboarding } from './onboarding.js';
import { renderParticlesList } from './particles.js';
import { refreshUserDictionaryLesson } from '../src/user-dictionaries/runtime.js';
import { dueCards } from '../src/srs-helpers.js';
import { exportFullProgress, downloadJSON } from '../src/backup-manager.js';

const LS_THEME = 'kitsune_theme';

// ===== TOAST UTILITY =====
let toastTimeout = null;
export function toast(msg, options = {}) {
  const t = $('#toast');
  if (!t) return;

  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  if (options.html) {
    t.innerHTML = msg;
  } else {
    t.textContent = msg;
  }

  t.classList.add('show');

  const duration = options.duration !== undefined ? options.duration : 3000;
  if (duration > 0) {
    toastTimeout = setTimeout(() => {
      t.classList.remove('show');
      toastTimeout = null;
    }, duration);
  }
}

// ===== THEME MANAGMENT =====
export function applyTheme() {
  const mode = state?.settings?.darkMode || 'auto';

  if (mode === 'custom' && state?.currentTheme && state.currentTheme !== 'default') {
    // Custom theme styling handled in ui/shared
    import('./shared.js').then((shared) => shared.applyCustomTheme());
    return;
  }

  if (mode === 'auto') {
    const prefersDark = Boolean(
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
    );
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }

  safeStorage.setItem(LS_THEME, mode);
}

// ===== NOTIFICATIONS =====
let activeNotifyTimer = null;
let oneHourRemindTimer = null;

export function showNotification(title, body, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('Браузер не поддерживает уведомления');
    if (options.isTest) {
      toast('⚠️ Уведомления не поддерживаются браузером');
    }
    return false;
  }

  const iconUrl = `${import.meta.env.BASE_URL}icon.svg`;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: iconUrl });
    return true;
  } else if (Notification.permission !== 'denied' && options.requestPermission !== false) {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: iconUrl });
      }
    });
  }
  return false;
}

export function calculateNextNotificationDate(notifyTimeStr, notifyDays, now = new Date()) {
  if (!notifyTimeStr || !Array.isArray(notifyDays) || notifyDays.length === 0) {
    return null;
  }

  const [hoursStr, minutesStr] = notifyTimeStr.split(':');
  const parsedHours = Number.parseInt(hoursStr, 10);
  const targetHours = Number.isInteger(parsedHours) ? parsedHours : 12;
  const parsedMinutes = Number.parseInt(minutesStr, 10);
  const targetMinutes = Number.isInteger(parsedMinutes) ? parsedMinutes : 0;

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const candidate = new Date(now.getTime());
    candidate.setDate(candidate.getDate() + dayOffset);
    candidate.setHours(targetHours, targetMinutes, 0, 0);

    const dayOfWeek = candidate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    if (notifyDays.includes(dayOfWeek)) {
      if (candidate.getTime() > now.getTime()) {
        return candidate;
      }
    }
  }

  return null;
}

export function scheduleNotify() {
  if (activeNotifyTimer) {
    clearTimeout(activeNotifyTimer);
    activeNotifyTimer = null;
  }

  const s = state?.settings;
  if (!s || !s.notifyEnabled) return;
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'granted'
  ) {
    return;
  }

  const targetDate = calculateNextNotificationDate(s.notifyTime, s.notifyDays, new Date());
  if (!targetDate) return;

  const msUntilTrigger = targetDate.getTime() - Date.now();
  if (msUntilTrigger <= 0) return;

  activeNotifyTimer = setTimeout(() => {
    activeNotifyTimer = null;
    triggerScheduledNotification();
  }, msUntilTrigger);
}

export function triggerScheduledNotification() {
  const s = state?.settings;
  if (!s || !s.notifyEnabled) return;
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'granted'
  ) {
    return;
  }

  const digest = getDailyStudyDigest(state);
  if (digest.isComplete) {
    scheduleNotify();
    return;
  }

  const todayKey = localDateKey();
  const notifState = s.notificationState || {};

  if (
    notifState.lastDailyDigestDate === todayKey &&
    notifState.lastDailyDigestSlot === s.notifyTime
  ) {
    scheduleNotify();
    return;
  }

  let notifBody = '';
  if (digest.dueReviewCards > 0 && digest.availableNewItems > 0) {
    notifBody = `${digest.dueReviewCards} повторения и ${digest.availableNewItems} новых слов — примерно ${digest.estimatedMinutes} минут.`;
  } else if (digest.dueReviewCards > 0) {
    notifBody = `На сегодня ${digest.dueReviewCards} повторений — ${digest.durationText}.`;
  } else if (digest.availableNewItems > 0) {
    notifBody = `На сегодня доступно ${digest.availableNewItems} новых слов — ${digest.durationText}.`;
  }

  if (digest.cardsToDailyGoal > 0) {
    notifBody += ` До цели осталось ${digest.cardsToDailyGoal} карточки.`;
  }

  const sent = showNotification('KotoKitsu 🦊', notifBody, { requestPermission: false });
  if (sent) {
    s.notificationState = {
      lastDailyDigestDate: todayKey,
      lastDailyDigestSlot: s.notifyTime,
    };
    saveToStore();
  }

  scheduleNotify();
}

export function scheduleOneHourReminder() {
  if (oneHourRemindTimer) {
    clearTimeout(oneHourRemindTimer);
    oneHourRemindTimer = null;
  }

  const ONE_HOUR_MS = 60 * 60 * 1000;
  oneHourRemindTimer = setTimeout(() => {
    oneHourRemindTimer = null;
    const digest = getDailyStudyDigest(state);
    const body = digest.isComplete
      ? 'На сегодня всё выполнено 🎉'
      : `${digest.summaryText} — ${digest.durationText}.`;
    showNotification('KotoKitsu 🦊', `Напоминание: ${body}`);
  }, ONE_HOUR_MS);

  toast('⏰ Напоминание установлено через 1 час');
}

// ===== STORAGE BANNER =====
export function checkStorageDegradedBanner() {
  if (!isStorageDegraded()) return;
  let banner = document.getElementById('storage-warning-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'storage-warning-banner';
    banner.className = 'storage-warning-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <span>⚠️ Хранилище недоступно. Прогресс не будет сохранён при очистке браузера.</span>
      <button id="storage-warning-export-btn" class="btn-sm">Скачать экспорт</button>
    `;
    const appElem = document.getElementById('app');
    if (appElem) appElem.insertBefore(banner, appElem.firstChild);
  }
  const btn = document.getElementById('storage-warning-export-btn');
  if (btn) {
    btn.onclick = async () => {
      try {
        const data = await exportFullProgress();
        downloadJSON(data, `kotokitsu-backup-${new Date().toISOString().slice(0, 10)}.json`);
      } catch (err) {
        toast('Ошибка экспорта: ' + err.message);
      }
    };
  }
}

// ===== ROUTER SETUP & APP SHELL =====
export function setupAppShell(dependencies) {
  let router = null;
  let startSrsSessionFn = null;
  let startChapterFlashcardsFn = null;

  const activateSessionBatch = (batchInfo, chapterId = null) => {
    if (!batchInfo?.organizedCards?.length) return false;

    setFlashQueue(batchInfo.organizedCards);
    setFlashCtx(chapterId);
    setSessionManager(
      new SessionManager(batchInfo.organizedCards, {
        srs: SRS,
        questsManager: QuestsManager,
        state,
        onSave: () => dependencies.save(),
      })
    );
    return true;
  };

  const startChapterFlashcards = async (chapterId, chapterDue) => {
    await ensureLesson(chapterId);

    if (!chapterDue || chapterDue.length === 0) {
      toast('Нет карточек для повторения в этой главе');
      return;
    }

    const sessionCards = limitNewCardsForSession(chapterDue, state.srs);
    if (sessionCards.length === 0) {
      toast('Лимит новых карточек на сегодня исчерпан');
      return;
    }

    dependencies.save();

    setSessionManager(null);
    setFlashCtx(chapterId);
    setFlashRevealed(false);
    setFlashIdx(0);

    const batchInfo = initSessionBatching(sessionCards, LESSONS, 20);

    if (!activateSessionBatch(batchInfo, chapterId)) {
      toast('Ошибка инициализации батча карточек');
      return;
    }

    setSessionOrigin({
      type: 'chapter',
      chapterId,
      initialCardIds: sessionCards.map((card) => card.id),
    });
    saveActiveSessionState();

    if (router) {
      await router.navigate('srs', { mode: 'session' }, true);
      if (window.history && window.history.replaceState) {
        window.history.replaceState({ screen: 'srs', opt: { mode: 'session' } }, '', '');
      }
    } else {
      nav('srs');
    }

    renderFlash(state, dependencies);
  };

  startChapterFlashcardsFn = startChapterFlashcards;
  dependencies.startChapterFlashcards = startChapterFlashcards;

  const startSrsSession = async () => {
    try {
      await ensureLessonsForSrs();
      const due = dueCards(state.srs);

      if (!due || due.length === 0) {
        toast('Нет карточек для повторения');
        return;
      }

      const sessionCards = limitNewCardsForSession(due, state.srs);
      if (sessionCards.length === 0) {
        toast('Лимит новых карточек на сегодня исчерпан');
        return;
      }

      dependencies.save();

      setSessionManager(null);
      setFlashCtx(null);
      setFlashRevealed(false);
      setFlashIdx(0);

      const batchInfo = initSessionBatching(sessionCards, LESSONS, 20);

      if (!activateSessionBatch(batchInfo, null)) {
        console.error('[SRS] Failed to generate organized cards batch!');
        toast('Ошибка инициализации батча карточек');
        return;
      }

      setSessionOrigin({
        type: 'srs',
        chapterId: null,
        initialCardIds: sessionCards.map((card) => card.id),
      });
      saveActiveSessionState();

      if (router) {
        await router.navigate('srs', { mode: 'session' }, true);
        if (window.history && window.history.replaceState) {
          window.history.replaceState({ screen: 'srs', opt: { mode: 'session' } }, '', '');
        }
      } else {
        nav('srs');
      }

      const tabbar = document.querySelector('.tabbar');
      if (tabbar) {
        tabbar.style.display = 'none';
      }

      const srsBody = document.getElementById('srs-body');
      if (srsBody) {
        srsBody.innerHTML = '';
      }

      renderFlash(state, dependencies);
    } catch (err) {
      console.error('[SRS] Error in startSrsSession:', err);
      toast('Ошибка при запуске сессии: ' + err.message);
    }
  };

  startSrsSessionFn = async () => startSrsSession();

  const renderParticlesDictionary = async () => {
    renderParticlesList(dependencies);
  };

  const renderSrsDashboard = async (options = {}, context = {}) => {
    if (options?.mode === 'session') {
      return;
    }

    const body = $('#srs-body');
    if (!body) return;

    const srsScreen = document.getElementById('screen-srs');
    if (srsScreen) srsScreen.classList.remove('srs-session-active');
    document.body.classList.remove('srs-session-active');

    const srsHeader = document.querySelector('#screen-srs .app-header');
    if (srsHeader) {
      srsHeader.style.display = 'flex';
    }

    const tabbar = document.querySelector('.tabbar');
    if (tabbar) tabbar.style.display = '';

    document.getElementById('completion-overlay')?.classList.add('hidden');

    const tabsContainerDashboard = document.getElementById('srs-tabs-container');
    if (tabsContainerDashboard) {
      tabsContainerDashboard.classList.remove('hidden');
      tabsContainerDashboard.style.display = '';
    }

    $$('#srs-tabs-container .lib-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === 'repetition');
      tab.onclick = () => {
        if (tab.dataset.tab === 'dictionary') {
          $$('#srs-tabs-container .lib-tab').forEach((t) =>
            t.classList.toggle('active', t === tab)
          );
          renderDictionary(state, dependencies, {}, context);
        } else if (tab.dataset.tab === 'particles') {
          $$('#srs-tabs-container .lib-tab').forEach((t) =>
            t.classList.toggle('active', t === tab)
          );
          renderParticlesDictionary();
        } else if (tab.dataset.tab === 'user-dictionaries') {
          router.navigate('user-dictionaries');
        } else {
          renderSrsDashboard({}, context);
        }
      };
    });

    await ensureLessonsForSrs();
    if (context?.signal?.aborted) return;

    const digest = getDailyStudyDigest(state);
    const activeManager = getSessionManager();
    const isSessionActive = activeManager && !activeManager.isSessionComplete();

    let sessionBannerHtml = '';
    if (isSessionActive) {
      const stats = activeManager.getStats();
      sessionBannerHtml = `
        <div class="card active-session-banner" style="background: rgba(255,138,43,0.08); border: 1.5px solid var(--orange, #ff8a2b); padding: 16px; border-radius: 12px; margin-bottom: 16px; text-align: left;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
            <strong style="font-size: 15px; color: var(--ink);">⏳ Незавершённая сессия</strong>
            <span class="badge" style="background: var(--orange, #ff8a2b); color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${stats.reviewed} / ${stats.total}</span>
          </div>
          <p style="font-size: 13px; color: var(--muted, #666); margin-bottom: 12px;">У вас есть активная сессия в процессе.</p>
          <div style="display: flex; gap: 8px;">
            <button class="btn-primary" id="srs-resume-active-session" style="flex: 2;">▶️ Продолжить сессию</button>
            <button class="btn-ghost" id="srs-abandon-active-session" style="flex: 1; color: var(--danger, #f44336);">❌ Завершить</button>
          </div>
        </div>
      `;
    }

    const startBtnHtml = isSessionActive
      ? ''
      : `<button class="btn-primary" id="srs-start-session" data-testid="srs-start-btn" ${digest.availableCardCount === 0 ? 'disabled' : ''}>
          ${digest.availableCardCount === 0 ? 'Всё повторено на сегодня!' : `▶️ Начать SRS (${digest.availableCardCount})`}
        </button>`;

    const dashboardHtml = `
      ${sessionBannerHtml}
      <div class="stat-row" data-testid="srs-stat-row">
        <div class="stat-box" data-testid="stat-reviews"><div class="stat-num accent">${digest.dueReviewCards}</div><div class="stat-cap">Повторения</div></div>
        <div class="stat-box" data-testid="stat-new"><div class="stat-num" style="color:var(--primary, #ff8a2b)">${digest.availableNewItems}</div><div class="stat-cap">Новые слова</div></div>
        <div class="stat-box" data-testid="stat-total"><div class="stat-num">${digest.durationText}</div><div class="stat-cap">Примерное время</div></div>
      </div>
      ${startBtnHtml}
      ${isSessionActive ? '' : '<button class="btn-extra-review" id="srs-extra-review">➕ Практика без изменения расписания</button>'}
    `;

    if (context?.signal?.aborted) return;

    body.innerHTML = dashboardHtml;

    const resumeBtn = $('#srs-resume-active-session');
    if (resumeBtn) {
      resumeBtn.onclick = async () => {
        if (router) {
          await router.navigate('srs', { mode: 'session' }, true);
          if (window.history && window.history.replaceState) {
            window.history.replaceState({ screen: 'srs', opt: { mode: 'session' } }, '', '');
          }
        }
        renderFlash(state, dependencies);
      };
    }

    const abandonBtn = $('#srs-abandon-active-session');
    if (abandonBtn) {
      abandonBtn.onclick = async () => {
        await abandonActiveSession();
        renderSrsDashboard({}, context);
      };
    }

    const startBtn = $('#srs-start-session');
    if (startBtn && digest.availableCardCount > 0) {
      startBtn.onclick = () => startSrsSession();
    }

    const extraBtn = $('#srs-extra-review');
    if (extraBtn) {
      extraBtn.onclick = () => startExtraReview(state, dependencies, renderFlash);
    }
  };

  router = initRouter({
    home: (options, context) => renderHome(state, dependencies, options, context),
    course: (options, context) => renderCourse(state, dependencies, options, context),
    chapter: (options, context) => {
      const rawId =
        typeof options === 'object' && options !== null
          ? options.chapterId || options.lessonId || options.id
          : options;
      const chapterId = canonicalLessonId(rawId) || rawId || 1;
      return renderChapter(
        chapterId,
        state,
        dependencies,
        context,
        typeof options === 'object' ? options : {}
      );
    },
    srs: (options, context) => renderSrsDashboard(options, context),
    profile: (options, context) => renderProfile(state, dependencies, options, context),
    shop: async (options, context) => {
      const { renderShop } = await import('./shop.js');
      return renderShop(state, dependencies, options, context);
    },
    library: async (options, context) => {
      const { renderStories } = await import('./stories.js');
      return renderStories(state, dependencies, options, context);
    },
    story: async (options, context) => {
      const { renderStoryRoute } = await import('./stories.js');
      return renderStoryRoute(state, dependencies, options, context);
    },
    sensei: async (options, context) => {
      const { renderSensei } = await import('./chat.js');
      return renderSensei(state, dependencies, options, context);
    },
    settings: async (options, context) => {
      const { renderSettings } = await import('./settings.js');
      return renderSettings(state, dependencies, options, context);
    },
    'dev-tools': async (options, context) => {
      const { renderDevTools } = await import('./dev-tools.js');
      return renderDevTools(state, dependencies, options, context);
    },
    plan: async (options, context) => {
      const { renderPlan } = await import('./plan.js');
      return renderPlan(state, dependencies, options, context);
    },
    quests: (options, context) => renderQuests(state, dependencies, options, context),
    'ai-story': async (options, context) => {
      const { renderAIStory } = await import('./ai-story.js');
      return renderAIStory(state, dependencies, options, context);
    },
    crossword: async (options, context) => {
      const { renderCrossword } = await import('./crossword.js');
      return renderCrossword(state, dependencies, options, context);
    },
    'word-search': async (options, context) => {
      const { renderWordSearch } = await import('./word-search.js');
      return renderWordSearch(state, dependencies, options, context);
    },
    onboarding: (options, context) => renderOnboarding(state, dependencies, options, context),
    statistics: async (options, context) => {
      const { renderStatistics } = await import('./statistics.js');
      return renderStatistics(state, options, context);
    },
    'user-dictionaries': async (options, context) => {
      const { renderUserDictionaries } = await import('./user-dictionaries.js');
      return renderUserDictionaries(
        state,
        {
          ...dependencies,
          refreshRuntime: () => refreshUserDictionaryLesson(LESSONS, undefined, state),
        },
        options,
        context
      );
    },
    'word-details': async (options, context) => {
      const { renderWordDetails } = await import('./word-details.js');
      return renderWordDetails(state, dependencies, options, context);
    },
  });

  return {
    router,
    startSrsSessionFn: () => startSrsSessionFn(),
    startChapterFlashcardsFn: (chapterId, due) => startChapterFlashcardsFn(chapterId, due),
  };
}

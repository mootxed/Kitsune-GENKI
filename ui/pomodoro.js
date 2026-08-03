/* ui/pomodoro.js — Global UI widget and controller for Pomodoro timer */

import {
  POMODORO_PHASES,
  POMODORO_STATUS,
  calculateRemainingMs,
  startTimer,
  pauseTimer,
  resumeTimer,
  resetTimer,
  updateTimerState,
  normalizePomodoroSettings,
  normalizePomodoroState,
  getPhaseDurationMs,
  applySettingsChange,
} from '../src/pomodoro/pomodoro-state.js';
import { playPomodoroChime, unlockAudio } from '../src/pomodoro/pomodoro-audio.js';
import { isPrimaryTab } from '../src/tab-sync.js';

let appDependencies = null;
let tickIntervalId = null;
let panelIsOpen = false;
let settingsSectionIsOpen = false;

/**
 * Formats milliseconds into MM:SS string
 */
export function formatPomodoroTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Returns human-readable label for phase
 */
export function getPhaseLabel(phase) {
  switch (phase) {
    case POMODORO_PHASES.SHORT_BREAK:
      return 'Короткий перерыв';
    case POMODORO_PHASES.LONG_BREAK:
      return 'Длинный перерыв';
    case POMODORO_PHASES.FOCUS:
    default:
      return 'Фокус';
  }
}

/**
 * Dispatches system or SW notification upon phase completion
 */
async function dispatchPomodoroNotification(transition, settings) {
  if (!isPrimaryTab()) return;
  if (!settings.notificationsEnabled) return;

  const { completedPhase, nextPhase } = transition;
  let title = '';
  let body = '';

  if (completedPhase === POMODORO_PHASES.FOCUS) {
    title = '🍅 Фокус завершён';
    body =
      nextPhase === POMODORO_PHASES.LONG_BREAK
        ? 'Пора сделать длинный перерыв.'
        : 'Пора сделать короткий перерыв.';
  } else {
    title = '☕ Перерыв завершён';
    body = 'Можно вернуться к изучению японского.';
  }

  const iconUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? `${import.meta.env.BASE_URL}icon.svg`
      : '/icon.svg';

  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const registration = await navigator.serviceWorker.ready;
          if (registration && registration.showNotification) {
            await registration.showNotification(title, {
              body,
              icon: iconUrl,
              tag: 'pomodoro-notification',
              renotify: true,
            });
            return;
          }
        }
        new Notification(title, { body, icon: iconUrl });
        return;
      }
    }
  } catch (err) {
    console.warn('[Pomodoro] Could not send system notification:', err);
  }

  // Fallback to internal toast
  if (appDependencies?.toast) {
    appDependencies.toast(`${title} — ${body}`);
  }
}

/**
 * Process transitions occurring from state tick or catchup
 */
function handleTransitions(transitions, state, settings) {
  if (!Array.isArray(transitions) || transitions.length === 0) return;

  const lastNotified = state.pomodoro?.lastNotifiedTransitionSerial || 0;
  const unhandledTransitions = transitions.filter((t) => t.serial > lastNotified);

  if (unhandledTransitions.length === 0) return;

  // Use the latest transition for side effects
  const latestTransition = unhandledTransitions[unhandledTransitions.length - 1];

  state.pomodoro.lastNotifiedTransitionSerial = latestTransition.serial;

  if (isPrimaryTab()) {
    if (settings.soundEnabled) {
      const chimeType =
        latestTransition.completedPhase === POMODORO_PHASES.FOCUS ? 'focus' : 'break';
      playPomodoroChime(chimeType);
    }
    dispatchPomodoroNotification(latestTransition, settings);
  }

  if (appDependencies?.announce) {
    const nextLabel = getPhaseLabel(latestTransition.nextPhase);
    appDependencies.announce(`Этап завершён. Следующий этап: ${nextLabel}`);
  }
}

/**
 * Primary clock tick handler
 */
function tickPomodoro() {
  if (!appDependencies?.state) return;

  const state = appDependencies.state;
  const settings = normalizePomodoroSettings(state.settings?.pomodoro);
  let pState = normalizePomodoroState(state.pomodoro, settings);

  if (pState.status === POMODORO_STATUS.RUNNING) {
    const nowMs = Date.now();
    const result = updateTimerState(pState, settings, nowMs);
    pState = result.state;
    state.pomodoro = pState;

    if (result.transitionOccurred) {
      handleTransitions(result.transitions, state, settings);
      if (isPrimaryTab() && appDependencies.save) {
        appDependencies.save(true);
      }
    }

    renderPomodoroWidget();
  }
}

/**
 * Starts in-memory rendering/tick interval
 */
function startTickLoop() {
  stopTickLoop();
  tickIntervalId = setInterval(() => {
    tickPomodoro();
  }, 500);
}

function stopTickLoop() {
  if (tickIntervalId) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
}

/**
 * Initializes the Pomodoro widget subsystem
 */
let pomodoroLifecycleController = null;

export function initPomodoro(dependencies) {
  appDependencies = dependencies;

  if (pomodoroLifecycleController) {
    pomodoroLifecycleController.abort();
  }
  pomodoroLifecycleController = new AbortController();
  const { signal } = pomodoroLifecycleController;

  // Normalize initial pomodoro state
  const state = dependencies.state;
  if (state) {
    state.settings = state.settings || {};
    state.settings.pomodoro = normalizePomodoroSettings(state.settings.pomodoro);
    state.pomodoro = normalizePomodoroState(state.pomodoro, state.settings.pomodoro);

    // Initial lifecycle check on app start
    if (state.pomodoro.status === POMODORO_STATUS.RUNNING) {
      const result = updateTimerState(state.pomodoro, state.settings.pomodoro, Date.now());
      state.pomodoro = result.state;
      handleTransitions(result.transitions, state, state.settings.pomodoro);
    }
  }

  setupDOM();
  bindEvents(signal);
  renderPomodoroWidget();
  startTickLoop();

  // Listen to global store changes
  if (typeof window !== 'undefined') {
    window.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'visible') {
          reconcilePomodoroOnResume();
        }
      },
      { signal }
    );
    window.addEventListener(
      'pageshow',
      () => {
        reconcilePomodoroOnResume();
      },
      { signal }
    );
  }
}

/**
 * Reconciles elapsed time when app resumes from background or tab focus
 */

export function reconcilePomodoroOnResume() {
  if (!appDependencies?.state) return;
  const state = appDependencies.state;
  const settings = normalizePomodoroSettings(state.settings?.pomodoro);
  let pState = normalizePomodoroState(state.pomodoro, settings);

  if (pState.status === POMODORO_STATUS.RUNNING) {
    const result = updateTimerState(pState, settings, Date.now());
    state.pomodoro = result.state;

    if (result.transitionOccurred) {
      handleTransitions(result.transitions, state, settings);
      if (isPrimaryTab() && appDependencies.save) {
        appDependencies.save(true);
      }
    }
  }

  renderPomodoroWidget();
}

/**
 * DOM Structure Setup
 */
function setupDOM() {
  const appContainer = document.getElementById('app');
  if (!appContainer) return;

  // Floating Button
  let btn = document.getElementById('pomodoro-floating-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'pomodoro-floating-btn';
    btn.className = 'pomodoro-floating-btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', 'Таймер Pomodoro');
    btn.setAttribute('data-testid', 'pomodoro-floating-btn');
    appContainer.appendChild(btn);
  }

  // Timer Panel Modal / Drawer
  let panel = document.getElementById('pomodoro-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'pomodoro-panel';
    panel.className = 'pomodoro-panel modal-overlay hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Панель Pomodoro');
    panel.setAttribute('data-testid', 'pomodoro-panel');
    panel.innerHTML = `
      <div class="pomodoro-panel-backdrop" id="pomodoro-panel-backdrop"></div>
      <div class="pomodoro-panel-content">
        <div class="pomodoro-panel-header">
          <h2 class="pomodoro-panel-title" id="pomodoro-panel-title">🍅 Pomodoro</h2>
          <button type="button" class="pomodoro-close-btn" id="pomodoro-panel-close-btn" aria-label="Закрыть панель Pomodoro">✕</button>
        </div>

        <div class="pomodoro-timer-card">
          <div class="pomodoro-phase-badge" id="pomodoro-phase-badge" data-testid="pomodoro-phase-badge">Фокус</div>
          <div class="pomodoro-time-display" id="pomodoro-time-display" data-testid="pomodoro-time-display">25:00</div>
          <div class="pomodoro-cycle-progress" id="pomodoro-cycle-progress" data-testid="pomodoro-cycle-progress">Интервал 1 из 4</div>
        </div>

        <div class="pomodoro-actions-row">
          <button type="button" class="btn-primary pomodoro-main-btn" id="pomodoro-main-btn" data-testid="pomodoro-main-btn">Старт</button>
          <button type="button" class="btn-ghost pomodoro-reset-btn" id="pomodoro-reset-btn" data-testid="pomodoro-reset-btn" title="Сбросить таймер">Сброс</button>
        </div>

        <div class="pomodoro-settings-wrapper">
          <button type="button" class="pomodoro-settings-toggle-btn" id="pomodoro-settings-toggle-btn" aria-expanded="false" data-testid="pomodoro-settings-toggle">
            <span>⚙️ Настройки таймера</span>
            <span class="pomodoro-toggle-arrow" id="pomodoro-toggle-arrow">▼</span>
          </button>

          <div class="pomodoro-settings-form hidden" id="pomodoro-settings-form" data-testid="pomodoro-settings-form">
            <div class="pomodoro-form-group">
              <label for="pomo-setting-focus">Фокус (мин, 1-180)</label>
              <input type="number" id="pomo-setting-focus" min="1" max="180" value="25" class="form-input" data-testid="pomo-setting-focus" />
            </div>
            <div class="pomodoro-form-group">
              <label for="pomo-setting-short">Короткий перерыв (мин, 1-60)</label>
              <input type="number" id="pomo-setting-short" min="1" max="60" value="5" class="form-input" data-testid="pomo-setting-short" />
            </div>
            <div class="pomodoro-form-group">
              <label for="pomo-setting-long">Длинный перерыв (мин, 1-120)</label>
              <input type="number" id="pomo-setting-long" min="1" max="120" value="15" class="form-input" data-testid="pomo-setting-long" />
            </div>
            <div class="pomodoro-form-group">
              <label for="pomo-setting-intervals">Фокусов до длинного перерыва (1-12)</label>
              <input type="number" id="pomo-setting-intervals" min="1" max="12" value="4" class="form-input" data-testid="pomo-setting-intervals" />
            </div>
            <div class="pomodoro-form-group checkbox-group">
              <label class="pomodoro-checkbox-label">
                <input type="checkbox" id="pomo-setting-autostart" data-testid="pomo-setting-autostart" />
                <span>Автозапуск следующего этапа</span>
              </label>
            </div>
            <div class="pomodoro-form-group checkbox-group">
              <label class="pomodoro-checkbox-label">
                <input type="checkbox" id="pomo-setting-sound" checked data-testid="pomo-setting-sound" />
                <span>Звуковой сигнал</span>
              </label>
            </div>
            <div class="pomodoro-form-group checkbox-group">
              <label class="pomodoro-checkbox-label">
                <input type="checkbox" id="pomo-setting-notifications" data-testid="pomo-setting-notifications" />
                <span>Системные уведомления</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
    appContainer.appendChild(panel);
  }
}

/**
 * Event Bindings
 */
function bindEvents(signal = null) {
  const floatingBtn = document.getElementById('pomodoro-floating-btn');
  const panelBackdrop = document.getElementById('pomodoro-panel-backdrop');
  const closeBtn = document.getElementById('pomodoro-panel-close-btn');
  const mainBtn = document.getElementById('pomodoro-main-btn');
  const resetBtn = document.getElementById('pomodoro-reset-btn');
  const settingsToggleBtn = document.getElementById('pomodoro-settings-toggle-btn');

  if (floatingBtn) {
    floatingBtn.onclick = () => {
      togglePanel();
    };
  }

  if (panelBackdrop) {
    panelBackdrop.onclick = () => {
      closePanel();
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      closePanel();
    };
  }

  if (mainBtn) {
    mainBtn.onclick = () => {
      unlockAudio();
      handleMainButtonClick();
    };
  }

  if (resetBtn) {
    resetBtn.onclick = () => {
      handleResetButtonClick();
    };
  }

  if (settingsToggleBtn) {
    settingsToggleBtn.onclick = () => {
      toggleSettingsSection();
    };
  }

  // Keyboard Escape listener
  if (typeof window !== 'undefined') {
    const listenerOptions = signal ? { signal } : {};
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && panelIsOpen) {
          closePanel();
        }
      },
      listenerOptions
    );
  }

  // Form input listeners for settings
  const formInputs = [
    'pomo-setting-focus',
    'pomo-setting-short',
    'pomo-setting-long',
    'pomo-setting-intervals',
    'pomo-setting-autostart',
    'pomo-setting-sound',
    'pomo-setting-notifications',
  ];

  formInputs.forEach((id) => {
    const elem = document.getElementById(id);
    if (elem) {
      elem.onchange = () => {
        handleSettingsInputChange();
      };
    }
  });
}

/**
 * Main action button click logic
 */
function handleMainButtonClick() {
  if (!appDependencies?.state) return;
  const state = appDependencies.state;
  const settings = normalizePomodoroSettings(state.settings?.pomodoro);
  let pState = normalizePomodoroState(state.pomodoro, settings);

  if (pState.status === POMODORO_STATUS.IDLE || pState.status === POMODORO_STATUS.AWAITING_NEXT) {
    pState = startTimer(pState, settings, Date.now());
    if (appDependencies.announce) {
      appDependencies.announce(`Запущен этап: ${getPhaseLabel(pState.phase)}`);
    }
  } else if (pState.status === POMODORO_STATUS.RUNNING) {
    pState = pauseTimer(pState, Date.now());
    if (appDependencies.announce) {
      appDependencies.announce('Таймер на паузе');
    }
  } else if (pState.status === POMODORO_STATUS.PAUSED) {
    pState = resumeTimer(pState, Date.now());
    if (appDependencies.announce) {
      appDependencies.announce('Таймер продолжен');
    }
  }

  state.pomodoro = pState;

  if (isPrimaryTab() && appDependencies.save) {
    appDependencies.save(true);
  }

  renderPomodoroWidget();
}

/**
 * Reset button click logic
 */
function handleResetButtonClick() {
  if (!appDependencies?.state) return;
  const state = appDependencies.state;
  const settings = normalizePomodoroSettings(state.settings?.pomodoro);

  state.pomodoro = resetTimer(state.pomodoro, settings);

  if (appDependencies.announce) {
    appDependencies.announce('Таймер Pomodoro сброшен');
  }

  if (isPrimaryTab() && appDependencies.save) {
    appDependencies.save(true);
  }

  renderPomodoroWidget();
}

/**
 * Settings inputs change logic
 */

async function handleSettingsInputChange() {
  if (!appDependencies?.state) return;
  const state = appDependencies.state;

  const focusInput = document.getElementById('pomo-setting-focus');
  const shortInput = document.getElementById('pomo-setting-short');
  const longInput = document.getElementById('pomo-setting-long');
  const intervalsInput = document.getElementById('pomo-setting-intervals');
  const autoStartInput = document.getElementById('pomo-setting-autostart');
  const soundInput = document.getElementById('pomo-setting-sound');
  const notifInput = document.getElementById('pomo-setting-notifications');

  const newNotificationsValue = Boolean(notifInput?.checked);

  // System notifications permission request on explicit user check
  if (
    newNotificationsValue &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission !== 'granted' &&
    Notification.permission !== 'denied'
  ) {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        if (notifInput) notifInput.checked = false;
        if (appDependencies.toast) {
          appDependencies.toast('⚠️ Разрешение на системные уведомления отклонено');
        }
      }
    } catch {
      if (notifInput) notifInput.checked = false;
    }
  }

  const rawSettings = {
    focusMinutes: focusInput?.value,
    shortBreakMinutes: shortInput?.value,
    longBreakMinutes: longInput?.value,
    focusIntervalsBeforeLongBreak: intervalsInput?.value,
    autoStartNextPhase: autoStartInput?.checked,
    soundEnabled: soundInput?.checked,
    notificationsEnabled: notifInput?.checked,
  };

  const { settings, state: nextPState } = applySettingsChange(
    state.pomodoro,
    state.settings?.pomodoro,
    rawSettings
  );

  state.settings = state.settings || {};
  state.settings.pomodoro = settings;
  state.pomodoro = nextPState;

  if (isPrimaryTab() && appDependencies.save) {
    appDependencies.save(true);
  }

  renderPomodoroWidget();
}

/**
 * Toggles panel visibility
 */
export function togglePanel() {
  if (panelIsOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

export function openPanel() {
  panelIsOpen = true;
  const panel = document.getElementById('pomodoro-panel');
  if (panel) {
    panel.classList.remove('hidden');
  }
  syncSettingsFormValues();
}

export function closePanel() {
  panelIsOpen = false;
  const panel = document.getElementById('pomodoro-panel');
  if (panel) {
    panel.classList.add('hidden');
  }
}

function toggleSettingsSection() {
  settingsSectionIsOpen = !settingsSectionIsOpen;
  const form = document.getElementById('pomodoro-settings-form');
  const toggleBtn = document.getElementById('pomodoro-settings-toggle-btn');
  const arrow = document.getElementById('pomodoro-toggle-arrow');

  if (form) {
    form.classList.toggle('hidden', !settingsSectionIsOpen);
  }
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(settingsSectionIsOpen));
  }
  if (arrow) {
    arrow.textContent = settingsSectionIsOpen ? '▲' : '▼';
  }
}

/**
 * Populates settings inputs with state values
 */
function syncSettingsFormValues() {
  if (!appDependencies?.state) return;
  const settings = normalizePomodoroSettings(appDependencies.state.settings?.pomodoro);

  const focusInput = document.getElementById('pomo-setting-focus');
  const shortInput = document.getElementById('pomo-setting-short');
  const longInput = document.getElementById('pomo-setting-long');
  const intervalsInput = document.getElementById('pomo-setting-intervals');
  const autoStartInput = document.getElementById('pomo-setting-autostart');
  const soundInput = document.getElementById('pomo-setting-sound');
  const notifInput = document.getElementById('pomo-setting-notifications');

  if (focusInput) focusInput.value = settings.focusMinutes;
  if (shortInput) shortInput.value = settings.shortBreakMinutes;
  if (longInput) longInput.value = settings.longBreakMinutes;
  if (intervalsInput) intervalsInput.value = settings.focusIntervalsBeforeLongBreak;
  if (autoStartInput) autoStartInput.checked = settings.autoStartNextPhase;
  if (soundInput) soundInput.checked = settings.soundEnabled;
  if (notifInput) notifInput.checked = settings.notificationsEnabled;
}

/**
 * Main Render function for floating button and timer panel
 */
export function renderPomodoroWidget() {
  if (!appDependencies?.state) return;

  const state = appDependencies.state;
  const settings = normalizePomodoroSettings(state.settings?.pomodoro);
  const pState = normalizePomodoroState(state.pomodoro, settings);

  const remainingMs = calculateRemainingMs(pState, Date.now());
  const formattedTime = formatPomodoroTime(remainingMs);
  const phaseLabel = getPhaseLabel(pState.phase);

  // Floating Button Render
  const floatingBtn = document.getElementById('pomodoro-floating-btn');
  if (floatingBtn) {
    const isRunning = pState.status === POMODORO_STATUS.RUNNING;
    const isPaused = pState.status === POMODORO_STATUS.PAUSED;
    const isAwaiting = pState.status === POMODORO_STATUS.AWAITING_NEXT;

    const showTimeOnBtn = isRunning || isPaused || isAwaiting;

    floatingBtn.innerHTML = `
      <span class="pomodoro-btn-icon" aria-hidden="true">🍅</span>
      ${showTimeOnBtn ? `<span class="pomodoro-btn-time">${formattedTime}</span>` : ''}
    `;

    floatingBtn.setAttribute(
      'aria-label',
      `Таймер Pomodoro: ${formattedTime}, ${phaseLabel}${isRunning ? ' (работает)' : isPaused ? ' (пауза)' : ''}`
    );

    floatingBtn.classList.toggle('running', isRunning);
    floatingBtn.classList.toggle('paused', isPaused);
  }

  // Panel Render
  const timeDisplay = document.getElementById('pomodoro-time-display');
  const phaseBadge = document.getElementById('pomodoro-phase-badge');
  const cycleProgress = document.getElementById('pomodoro-cycle-progress');
  const mainBtn = document.getElementById('pomodoro-main-btn');

  if (timeDisplay) {
    timeDisplay.textContent = formattedTime;
  }

  if (phaseBadge) {
    phaseBadge.textContent = phaseLabel;
    phaseBadge.className = `pomodoro-phase-badge phase-${pState.phase}`;
  }

  if (cycleProgress) {
    const currentNum =
      (pState.completedFocusIntervalsInCycle % settings.focusIntervalsBeforeLongBreak) + 1;
    cycleProgress.textContent = `Интервал ${currentNum} из ${settings.focusIntervalsBeforeLongBreak}`;
  }

  if (mainBtn) {
    if (pState.status === POMODORO_STATUS.IDLE) {
      mainBtn.textContent = 'Старт';
      mainBtn.className = 'btn-primary pomodoro-main-btn';
    } else if (pState.status === POMODORO_STATUS.RUNNING) {
      mainBtn.textContent = 'Пауза';
      mainBtn.className = 'btn-secondary pomodoro-main-btn';
    } else if (pState.status === POMODORO_STATUS.PAUSED) {
      mainBtn.textContent = 'Продолжить';
      mainBtn.className = 'btn-primary pomodoro-main-btn';
    } else if (pState.status === POMODORO_STATUS.AWAITING_NEXT) {
      mainBtn.textContent =
        pState.phase === POMODORO_PHASES.FOCUS ? 'Начать фокус' : 'Начать перерыв';
      mainBtn.className = 'btn-primary pomodoro-main-btn';
    }
  }
}

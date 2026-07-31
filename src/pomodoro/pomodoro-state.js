/* src/pomodoro/pomodoro-state.js — Pure domain logic for Pomodoro timer */

export const POMODORO_PHASES = {
  FOCUS: 'focus',
  SHORT_BREAK: 'shortBreak',
  LONG_BREAK: 'longBreak',
};

export const POMODORO_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  AWAITING_NEXT: 'awaitingNext',
};

export const POMODORO_DEFAULTS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  focusIntervalsBeforeLongBreak: 4,
  autoStartNextPhase: false,
  soundEnabled: true,
  notificationsEnabled: false,
};

export const POMODORO_BOUNDS = {
  focusMinutes: { min: 1, max: 180 },
  shortBreakMinutes: { min: 1, max: 60 },
  longBreakMinutes: { min: 1, max: 120 },
  focusIntervalsBeforeLongBreak: { min: 1, max: 12 },
};

/**
 * Creates default settings object
 */
export function createDefaultPomodoroSettings() {
  return { ...POMODORO_DEFAULTS };
}

/**
 * Creates default state object
 */
export function createDefaultPomodoroState(settings = POMODORO_DEFAULTS) {
  const normSettings = normalizePomodoroSettings(settings);
  return {
    schemaVersion: 1,
    phase: POMODORO_PHASES.FOCUS,
    status: POMODORO_STATUS.IDLE,
    endsAt: null,
    remainingMs: normSettings.focusMinutes * 60 * 1000,
    completedFocusIntervalsInCycle: 0,
    transitionSerial: 0,
    lastNotifiedTransitionSerial: null,
  };
}

/**
 * Validates and normalizes settings object
 */
export function normalizePomodoroSettings(settings) {
  const raw = settings && typeof settings === 'object' ? settings : {};

  const clamp = (val, min, max, defaultVal) => {
    const num = Number.parseInt(val, 10);
    if (Number.isNaN(num)) return defaultVal;
    return Math.min(max, Math.max(min, num));
  };

  return {
    focusMinutes: clamp(
      raw.focusMinutes,
      POMODORO_BOUNDS.focusMinutes.min,
      POMODORO_BOUNDS.focusMinutes.max,
      POMODORO_DEFAULTS.focusMinutes
    ),
    shortBreakMinutes: clamp(
      raw.shortBreakMinutes,
      POMODORO_BOUNDS.shortBreakMinutes.min,
      POMODORO_BOUNDS.shortBreakMinutes.max,
      POMODORO_DEFAULTS.shortBreakMinutes
    ),
    longBreakMinutes: clamp(
      raw.longBreakMinutes,
      POMODORO_BOUNDS.longBreakMinutes.min,
      POMODORO_BOUNDS.longBreakMinutes.max,
      POMODORO_DEFAULTS.longBreakMinutes
    ),
    focusIntervalsBeforeLongBreak: clamp(
      raw.focusIntervalsBeforeLongBreak,
      POMODORO_BOUNDS.focusIntervalsBeforeLongBreak.min,
      POMODORO_BOUNDS.focusIntervalsBeforeLongBreak.max,
      POMODORO_DEFAULTS.focusIntervalsBeforeLongBreak
    ),
    autoStartNextPhase: Boolean(raw.autoStartNextPhase),
    soundEnabled: raw.soundEnabled !== false,
    notificationsEnabled: Boolean(raw.notificationsEnabled),
  };
}

/**
 * Returns phase duration in milliseconds
 */
export function getPhaseDurationMs(phase, settings) {
  const normSettings = normalizePomodoroSettings(settings);
  switch (phase) {
    case POMODORO_PHASES.SHORT_BREAK:
      return normSettings.shortBreakMinutes * 60 * 1000;
    case POMODORO_PHASES.LONG_BREAK:
      return normSettings.longBreakMinutes * 60 * 1000;
    case POMODORO_PHASES.FOCUS:
    default:
      return normSettings.focusMinutes * 60 * 1000;
  }
}

/**
 * Normalizes pomodoro state from store/storage
 */
export function normalizePomodoroState(state, settings = POMODORO_DEFAULTS) {
  const normSettings = normalizePomodoroSettings(settings);
  if (!state || typeof state !== 'object') {
    return createDefaultPomodoroState(normSettings);
  }

  const validPhases = Object.values(POMODORO_PHASES);
  const phase = validPhases.includes(state.phase) ? state.phase : POMODORO_PHASES.FOCUS;

  const validStatuses = Object.values(POMODORO_STATUS);
  let status = validStatuses.includes(state.status) ? state.status : POMODORO_STATUS.IDLE;

  let endsAt = Number.isInteger(state.endsAt) && state.endsAt > 0 ? state.endsAt : null;
  if (status !== POMODORO_STATUS.RUNNING) {
    endsAt = null;
  }

  const defaultDuration = getPhaseDurationMs(phase, normSettings);
  let remainingMs = Number.isInteger(state.remainingMs) ? state.remainingMs : defaultDuration;
  if (remainingMs < 0) remainingMs = defaultDuration;

  const completedFocusIntervalsInCycle = Math.max(
    0,
    Number.parseInt(state.completedFocusIntervalsInCycle, 10) || 0
  );

  const transitionSerial = Math.max(0, Number.parseInt(state.transitionSerial, 10) || 0);
  const lastNotifiedTransitionSerial =
    state.lastNotifiedTransitionSerial !== null && state.lastNotifiedTransitionSerial !== undefined
      ? Math.max(0, Number.parseInt(state.lastNotifiedTransitionSerial, 10) || 0)
      : null;

  // If status is idle, remainingMs should match standard phase duration unless custom remainingMs set
  if (status === POMODORO_STATUS.IDLE && (!state.remainingMs || state.remainingMs <= 0)) {
    remainingMs = defaultDuration;
  }

  return {
    schemaVersion: 1,
    phase,
    status,
    endsAt,
    remainingMs,
    completedFocusIntervalsInCycle,
    transitionSerial,
    lastNotifiedTransitionSerial,
  };
}

/**
 * Calculates current remaining milliseconds
 */
export function calculateRemainingMs(state, nowMs = Date.now()) {
  if (state.status === POMODORO_STATUS.RUNNING && state.endsAt) {
    return Math.max(0, state.endsAt - nowMs);
  }
  return Math.max(0, state.remainingMs || 0);
}

/**
 * Starts the timer for current phase
 */
export function startTimer(state, settings, nowMs = Date.now()) {
  const normSettings = normalizePomodoroSettings(settings);
  const normState = normalizePomodoroState(state, normSettings);

  const initialRemaining =
    normState.remainingMs > 0
      ? normState.remainingMs
      : getPhaseDurationMs(normState.phase, normSettings);

  return {
    ...normState,
    status: POMODORO_STATUS.RUNNING,
    remainingMs: initialRemaining,
    endsAt: nowMs + initialRemaining,
  };
}

/**
 * Pauses the running timer
 */
export function pauseTimer(state, nowMs = Date.now()) {
  if (state.status !== POMODORO_STATUS.RUNNING) return { ...state };

  const remainingMs = calculateRemainingMs(state, nowMs);

  return {
    ...state,
    status: POMODORO_STATUS.PAUSED,
    endsAt: null,
    remainingMs,
  };
}

/**
 * Resumes a paused timer
 */
export function resumeTimer(state, nowMs = Date.now()) {
  if (state.status !== POMODORO_STATUS.PAUSED) return { ...state };

  const remainingMs = state.remainingMs > 0 ? state.remainingMs : 1000;

  return {
    ...state,
    status: POMODORO_STATUS.RUNNING,
    endsAt: nowMs + remainingMs,
  };
}

/**
 * Resets timer to initial focus idle state
 */
export function resetTimer(state, settings) {
  const normSettings = normalizePomodoroSettings(settings);
  const normState = normalizePomodoroState(state, normSettings);

  return {
    ...normState,
    phase: POMODORO_PHASES.FOCUS,
    status: POMODORO_STATUS.IDLE,
    endsAt: null,
    remainingMs: getPhaseDurationMs(POMODORO_PHASES.FOCUS, normSettings),
    completedFocusIntervalsInCycle: 0,
  };
}

/**
 * Updates timer settings and adjusts remaining time if idle
 */
export function applySettingsChange(state, oldSettings, newSettings) {
  const normOldSettings = normalizePomodoroSettings(oldSettings);
  const normNewSettings = normalizePomodoroSettings(newSettings);
  let nextState = normalizePomodoroState(state, normNewSettings);

  // If timer is idle, update remainingMs to match new duration for current phase
  if (nextState.status === POMODORO_STATUS.IDLE) {
    nextState.remainingMs = getPhaseDurationMs(nextState.phase, normNewSettings);
  }

  return { settings: normNewSettings, state: nextState };
}

/**
 * Determines next phase and updated completed intervals count
 */

export function getNextPhaseInfo(currentPhase, completedIntervals, settings) {
  const normSettings = normalizePomodoroSettings(settings);
  if (currentPhase === POMODORO_PHASES.FOCUS) {
    const nextCompletedCount = completedIntervals + 1;
    if (nextCompletedCount >= normSettings.focusIntervalsBeforeLongBreak) {
      return {
        nextPhase: POMODORO_PHASES.LONG_BREAK,
        nextCompletedCount,
      };
    }
    return {
      nextPhase: POMODORO_PHASES.SHORT_BREAK,
      nextCompletedCount,
    };
  }
  if (currentPhase === POMODORO_PHASES.LONG_BREAK) {
    return {
      nextPhase: POMODORO_PHASES.FOCUS,
      nextCompletedCount: 0,
    };
  }
  // shortBreak
  return {
    nextPhase: POMODORO_PHASES.FOCUS,
    nextCompletedCount: completedIntervals,
  };
}

/**
 * Updates timer state on clock tick / visibility restore / lifecycle check.
 * Performs phase completion transitions and auto-start catch-up sequence.
 *
 * @returns {{ state: object, transitionOccurred: boolean, transitions: Array }}
 */
export function updateTimerState(state, settings, nowMs = Date.now()) {
  const normSettings = normalizePomodoroSettings(settings);
  let currentState = normalizePomodoroState(state, normSettings);

  if (currentState.status !== POMODORO_STATUS.RUNNING) {
    return { state: currentState, transitionOccurred: false, transitions: [] };
  }

  if (currentState.endsAt && currentState.endsAt > nowMs) {
    return {
      state: {
        ...currentState,
        remainingMs: currentState.endsAt - nowMs,
      },
      transitionOccurred: false,
      transitions: [],
    };
  }

  // Phase ended! (endsAt <= nowMs)
  const transitions = [];
  let currentEndsAt = currentState.endsAt || nowMs;
  let currentPhase = currentState.phase;
  let completedIntervals = currentState.completedFocusIntervalsInCycle;
  let serial = currentState.transitionSerial;

  const MAX_ITERATIONS = 20;
  let iterations = 0;

  while (currentEndsAt <= nowMs && iterations < MAX_ITERATIONS) {
    iterations++;
    serial++;

    const { nextPhase, nextCompletedCount } = getNextPhaseInfo(
      currentPhase,
      completedIntervals,
      normSettings
    );

    transitions.push({
      completedPhase: currentPhase,
      nextPhase,
      serial,
      timestamp: currentEndsAt,
    });

    completedIntervals = nextCompletedCount;

    if (!normSettings.autoStartNextPhase) {
      // Auto-start disabled: stop at awaitingNext
      const nextDuration = getPhaseDurationMs(nextPhase, normSettings);
      currentState = {
        ...currentState,
        phase: nextPhase,
        status: POMODORO_STATUS.AWAITING_NEXT,
        endsAt: null,
        remainingMs: nextDuration,
        completedFocusIntervalsInCycle: completedIntervals,
        transitionSerial: serial,
      };
      return { state: currentState, transitionOccurred: true, transitions };
    }

    // Auto-start enabled: check if next phase also completed during catchup
    const nextDuration = getPhaseDurationMs(nextPhase, normSettings);
    const nextEndsAt = currentEndsAt + nextDuration;

    if (nextEndsAt > nowMs) {
      // Next phase is currently running
      currentState = {
        ...currentState,
        phase: nextPhase,
        status: POMODORO_STATUS.RUNNING,
        endsAt: nextEndsAt,
        remainingMs: nextEndsAt - nowMs,
        completedFocusIntervalsInCycle: completedIntervals,
        transitionSerial: serial,
      };
      return { state: currentState, transitionOccurred: true, transitions };
    }

    // Next phase also expired in past; continue loop
    currentPhase = nextPhase;
    currentEndsAt = nextEndsAt;
  }

  // Safety fallback if loop limit reached
  const finalDuration = getPhaseDurationMs(currentPhase, normSettings);
  currentState = {
    ...currentState,
    phase: currentPhase,
    status: POMODORO_STATUS.AWAITING_NEXT,
    endsAt: null,
    remainingMs: finalDuration,
    completedFocusIntervalsInCycle: completedIntervals,
    transitionSerial: serial,
  };

  return { state: currentState, transitionOccurred: true, transitions };
}

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  POMODORO_PHASES,
  POMODORO_STATUS,
  createDefaultPomodoroSettings,
  createDefaultPomodoroState,
  normalizePomodoroSettings,
  normalizePomodoroState,
  getPhaseDurationMs,
  startTimer,
  pauseTimer,
  resumeTimer,
  resetTimer,
  calculateRemainingMs,
  updateTimerState,
  applySettingsChange,
} from '../src/pomodoro/pomodoro-state.js';
import { runMigrations, defaultState } from '../state/store.js';

describe('Pomodoro Domain Logic (pomodoro-state.js)', () => {
  let settings;
  let state;

  beforeEach(() => {
    settings = createDefaultPomodoroSettings();
    state = createDefaultPomodoroState(settings);
  });

  it('1. Initializes default state and settings correctly', () => {
    expect(settings.focusMinutes).toBe(25);
    expect(settings.shortBreakMinutes).toBe(5);
    expect(settings.longBreakMinutes).toBe(15);
    expect(settings.focusIntervalsBeforeLongBreak).toBe(4);
    expect(settings.autoStartNextPhase).toBe(false);

    expect(state.phase).toBe(POMODORO_PHASES.FOCUS);
    expect(state.status).toBe(POMODORO_STATUS.IDLE);
    expect(state.endsAt).toBeNull();
    expect(state.remainingMs).toBe(25 * 60 * 1000);
    expect(state.completedFocusIntervalsInCycle).toBe(0);
    expect(state.transitionSerial).toBe(0);
  });

  it('2. Starts focus interval', () => {
    const now = 1000000;
    const nextState = startTimer(state, settings, now);

    expect(nextState.status).toBe(POMODORO_STATUS.RUNNING);
    expect(nextState.phase).toBe(POMODORO_PHASES.FOCUS);
    expect(nextState.endsAt).toBe(now + 25 * 60 * 1000);
    expect(nextState.remainingMs).toBe(25 * 60 * 1000);
  });

  it('3. Pauses running timer', () => {
    const now = 1000000;
    const runningState = startTimer(state, settings, now);
    const pauseTime = now + 5 * 60 * 1000; // 5 minutes elapsed

    const pausedState = pauseTimer(runningState, pauseTime);

    expect(pausedState.status).toBe(POMODORO_STATUS.PAUSED);
    expect(pausedState.endsAt).toBeNull();
    expect(pausedState.remainingMs).toBe(20 * 60 * 1000);
  });

  it('4. Resumes paused timer', () => {
    const now = 1000000;
    const runningState = startTimer(state, settings, now);
    const pausedState = pauseTimer(runningState, now + 5 * 60 * 1000); // 20 mins remaining

    const resumeTime = now + 10 * 60 * 1000;
    const resumedState = resumeTimer(pausedState, resumeTime);

    expect(resumedState.status).toBe(POMODORO_STATUS.RUNNING);
    expect(resumedState.endsAt).toBe(resumeTime + 20 * 60 * 1000);
  });

  it('5. Resets timer', () => {
    const now = 1000000;
    let runningState = startTimer(state, settings, now);
    runningState.completedFocusIntervalsInCycle = 3;

    const reset = resetTimer(runningState, settings);

    expect(reset.phase).toBe(POMODORO_PHASES.FOCUS);
    expect(reset.status).toBe(POMODORO_STATUS.IDLE);
    expect(reset.endsAt).toBeNull();
    expect(reset.remainingMs).toBe(25 * 60 * 1000);
    expect(reset.completedFocusIntervalsInCycle).toBe(0);
  });

  it('6. Transition focus -> shortBreak when autoStart is false', () => {
    const now = 1000000;
    const running = startTimer(state, settings, now);

    // Time passes past end
    const result = updateTimerState(running, settings, now + 25 * 60 * 1000 + 100);

    expect(result.transitionOccurred).toBe(true);
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].completedPhase).toBe(POMODORO_PHASES.FOCUS);
    expect(result.transitions[0].nextPhase).toBe(POMODORO_PHASES.SHORT_BREAK);

    expect(result.state.phase).toBe(POMODORO_PHASES.SHORT_BREAK);
    expect(result.state.status).toBe(POMODORO_STATUS.AWAITING_NEXT);
    expect(result.state.completedFocusIntervalsInCycle).toBe(1);
    expect(result.state.remainingMs).toBe(5 * 60 * 1000);
    expect(result.state.transitionSerial).toBe(1);
  });

  it('7. Transition focus -> longBreak after N intervals', () => {
    const now = 1000000;
    const running = startTimer(state, settings, now);
    running.completedFocusIntervalsInCycle = 3; // 4th focus interval completing

    const result = updateTimerState(running, settings, now + 25 * 60 * 1000);

    expect(result.transitionOccurred).toBe(true);
    expect(result.transitions[0].nextPhase).toBe(POMODORO_PHASES.LONG_BREAK);
    expect(result.state.phase).toBe(POMODORO_PHASES.LONG_BREAK);
    expect(result.state.completedFocusIntervalsInCycle).toBe(4);
    expect(result.state.remainingMs).toBe(15 * 60 * 1000);
  });

  it('8. Transition shortBreak -> focus', () => {
    const now = 1000000;
    let breakState = {
      ...state,
      phase: POMODORO_PHASES.SHORT_BREAK,
      status: POMODORO_STATUS.RUNNING,
      endsAt: now + 5 * 60 * 1000,
      completedFocusIntervalsInCycle: 1,
    };

    const result = updateTimerState(breakState, settings, now + 5 * 60 * 1000);

    expect(result.transitions[0].nextPhase).toBe(POMODORO_PHASES.FOCUS);
    expect(result.state.phase).toBe(POMODORO_PHASES.FOCUS);
    expect(result.state.completedFocusIntervalsInCycle).toBe(1);
  });

  it('9 & 10. Transition longBreak -> focus resets cycle count', () => {
    const now = 1000000;
    let longBreakState = {
      ...state,
      phase: POMODORO_PHASES.LONG_BREAK,
      status: POMODORO_STATUS.RUNNING,
      endsAt: now + 15 * 60 * 1000,
      completedFocusIntervalsInCycle: 4,
    };

    const result = updateTimerState(longBreakState, settings, now + 15 * 60 * 1000);

    expect(result.transitions[0].nextPhase).toBe(POMODORO_PHASES.FOCUS);
    expect(result.state.phase).toBe(POMODORO_PHASES.FOCUS);
    expect(result.state.completedFocusIntervalsInCycle).toBe(0);
  });

  it('11. Auto-start next phase when enabled', () => {
    const autoSettings = { ...settings, autoStartNextPhase: true };
    const now = 1000000;
    const running = startTimer(state, autoSettings, now);

    const focusEndTime = now + 25 * 60 * 1000;
    const checkTime = focusEndTime + 2 * 60 * 1000; // 2 minutes into shortBreak

    const result = updateTimerState(running, autoSettings, checkTime);

    expect(result.transitionOccurred).toBe(true);
    expect(result.state.phase).toBe(POMODORO_PHASES.SHORT_BREAK);
    expect(result.state.status).toBe(POMODORO_STATUS.RUNNING);
    expect(result.state.endsAt).toBe(focusEndTime + 5 * 60 * 1000);
    expect(result.state.remainingMs).toBe(3 * 60 * 1000);
  });

  it('12. No auto-start stays in awaitingNext', () => {
    const now = 1000000;
    const running = startTimer(state, settings, now);

    const result = updateTimerState(running, settings, now + 30 * 60 * 1000);

    expect(result.state.status).toBe(POMODORO_STATUS.AWAITING_NEXT);
    expect(result.state.phase).toBe(POMODORO_PHASES.SHORT_BREAK);
    expect(result.state.endsAt).toBeNull();
  });

  it('13 & 14. Restoration of running timer with active / overdue endsAt', () => {
    const now = 1000000;
    const running = startTimer(state, settings, now);

    // Mid-way check
    const midResult = updateTimerState(running, settings, now + 10 * 60 * 1000);
    expect(midResult.state.status).toBe(POMODORO_STATUS.RUNNING);
    expect(midResult.state.remainingMs).toBe(15 * 60 * 1000);

    // Overdue check
    const overdueResult = updateTimerState(running, settings, now + 30 * 60 * 1000);
    expect(overdueResult.state.status).toBe(POMODORO_STATUS.AWAITING_NEXT);
    expect(overdueResult.state.phase).toBe(POMODORO_PHASES.SHORT_BREAK);
  });

  it('15. Multi-phase catch-up after long background pause with auto-start', () => {
    const autoSettings = { ...settings, autoStartNextPhase: true };
    const now = 1000000;
    const running = startTimer(state, autoSettings, now);

    // Time passed: Focus (25m) + ShortBreak (5m) + Focus (25m) + 1m into next ShortBreak = 56 minutes
    const longDelay = now + 56 * 60 * 1000;

    const result = updateTimerState(running, autoSettings, longDelay);

    expect(result.transitionOccurred).toBe(true);
    expect(result.transitions.length).toBe(3);
    expect(result.transitions[0].completedPhase).toBe(POMODORO_PHASES.FOCUS);
    expect(result.transitions[1].completedPhase).toBe(POMODORO_PHASES.SHORT_BREAK);
    expect(result.transitions[2].completedPhase).toBe(POMODORO_PHASES.FOCUS);

    expect(result.state.phase).toBe(POMODORO_PHASES.SHORT_BREAK);
    expect(result.state.status).toBe(POMODORO_STATUS.RUNNING);
    expect(result.state.completedFocusIntervalsInCycle).toBe(2);
    expect(result.state.remainingMs).toBe(4 * 60 * 1000);
  });

  it('16. Serial idempotency prevents double processing', () => {
    const now = 1000000;
    const running = startTimer(state, settings, now);

    const result1 = updateTimerState(running, settings, now + 25 * 60 * 1000);
    const result2 = updateTimerState(result1.state, settings, now + 25 * 60 * 1000);

    expect(result1.transitionOccurred).toBe(true);
    expect(result2.transitionOccurred).toBe(false);
    expect(result1.state.transitionSerial).toBe(1);
    expect(result2.state.transitionSerial).toBe(1);
  });

  it('17 & 18. Normalizes corrupted data and validates bounds', () => {
    const invalidSettings = {
      focusMinutes: -50,
      shortBreakMinutes: 999,
      longBreakMinutes: 'abc',
      focusIntervalsBeforeLongBreak: 0,
      autoStartNextPhase: 'yes',
      soundEnabled: false,
    };

    const normS = normalizePomodoroSettings(invalidSettings);
    expect(normS.focusMinutes).toBe(1); // Min bound 1
    expect(normS.shortBreakMinutes).toBe(60); // Max bound 60
    expect(normS.longBreakMinutes).toBe(15); // Default 15
    expect(normS.focusIntervalsBeforeLongBreak).toBe(1); // Min bound 1
    expect(normS.autoStartNextPhase).toBe(true);
    expect(normS.soundEnabled).toBe(false);

    const invalidState = {
      phase: 'unknown_phase',
      status: 'invalid_status',
      remainingMs: -100,
      completedFocusIntervalsInCycle: -5,
    };

    const normState = normalizePomodoroState(invalidState, normS);
    expect(normState.phase).toBe(POMODORO_PHASES.FOCUS);
    expect(normState.status).toBe(POMODORO_STATUS.IDLE);
    expect(normState.remainingMs).toBe(1 * 60 * 1000);
    expect(normState.completedFocusIntervalsInCycle).toBe(0);
  });

  it('19. Migrates v16 state -> v17 state properly', () => {
    const v16State = {
      version: 16,
      xp: 150,
      settings: { darkMode: 'auto' },
    };

    const migrated = runMigrations(v16State);

    expect(migrated.version).toBe(17);
    expect(migrated.settings.pomodoro).toBeDefined();
    expect(migrated.settings.pomodoro.focusMinutes).toBe(25);
    expect(migrated.pomodoro).toBeDefined();
    expect(migrated.pomodoro.phase).toBe(POMODORO_PHASES.FOCUS);
    expect(migrated.pomodoro.status).toBe(POMODORO_STATUS.IDLE);
  });
});

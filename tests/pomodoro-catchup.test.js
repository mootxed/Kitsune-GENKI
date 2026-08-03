import { describe, it, expect } from 'vitest';
import {
  createDefaultPomodoroSettings,
  createDefaultPomodoroState,
  startTimer,
  updateTimerState,
  POMODORO_STATUS,
} from '../src/pomodoro/pomodoro-state.js';

describe('Pomodoro catch-up after large gap', () => {
  it('correctly fast-forwards through large gaps > 20 transitions without locking at awaitingNext', () => {
    const settings = {
      ...createDefaultPomodoroSettings(),
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      focusIntervalsBeforeLongBreak: 4,
      autoStartNextPhase: true,
    };

    let pState = createDefaultPomodoroState(settings);
    const startMs = 1000000;
    pState = startTimer(pState, settings, startMs);

    // Simulate returning after 10 hours (36,000,000 ms)
    const tenHoursLater = startMs + 36000000;
    const result = updateTimerState(pState, settings, tenHoursLater);

    expect(result.transitionOccurred).toBe(true);
    // Should be RUNNING in a valid phase, not AWAITING_NEXT with overdue endsAt
    expect(result.state.status).toBe(POMODORO_STATUS.RUNNING);
    expect(result.state.endsAt).toBeGreaterThan(tenHoursLater);
    expect(result.state.transitionSerial).toBeGreaterThan(20);
  });
});

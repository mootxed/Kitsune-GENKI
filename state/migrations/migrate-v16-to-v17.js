/* state/migrations/migrate-v16-to-v17.js — Migration v16 -> v17 */

import {
  normalizePomodoroSettings,
  normalizePomodoroState,
} from '../../src/pomodoro/pomodoro-state.js';

export const migrationV16ToV17 = {
  from: 16,
  to: 17,
  migrate(oldState) {
    const baseState = { ...oldState };
    const settings = baseState.settings || {};
    return {
      ...baseState,
      settings: {
        ...settings,
        pomodoro: normalizePomodoroSettings(settings.pomodoro),
      },
      pomodoro: normalizePomodoroState(baseState.pomodoro, settings.pomodoro),
      version: 17,
    };
  },
};

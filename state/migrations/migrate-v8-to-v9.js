/* state/migrations/migrate-v8-to-v9.js — Migration v8 -> v9 */

export const migrationV8ToV9 = {
  from: 8,
  to: 9,
  migrate(oldState) {
    const baseState = { ...oldState };
    const settings = baseState.settings || {};
    return {
      ...baseState,
      settings: {
        ...settings,
        notifyDays: Array.isArray(settings.notifyDays)
          ? settings.notifyDays
          : [1, 2, 3, 4, 5, 6, 0],
        notificationState:
          settings.notificationState && typeof settings.notificationState === 'object'
            ? settings.notificationState
            : { lastDailyDigestDate: null, lastDailyDigestSlot: null },
      },
      version: 9,
    };
  },
};

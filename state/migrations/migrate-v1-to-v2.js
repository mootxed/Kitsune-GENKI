/* state/migrations/migrate-v1-to-v2.js — Migration v1 -> v2 */

export const migrationV1ToV2 = {
  from: 1,
  to: 2,
  migrate(oldState, context = {}) {
    const baseState = context.defaultState ? context.defaultState() : {};
    const migratedState = { ...baseState };

    Object.keys(oldState).forEach((key) => {
      if (key !== 'version') {
        migratedState[key] = oldState[key];
      }
    });

    if (!migratedState.unlockedAchievements) migratedState.unlockedAchievements = [];
    if (!migratedState.claimedAchievements) migratedState.claimedAchievements = [];
    if (!migratedState.quests) migratedState.quests = null;
    if (!migratedState.chatHistory) migratedState.chatHistory = [];
    if (!migratedState.settings) migratedState.settings = baseState.settings;

    migratedState.settings = { ...baseState.settings, ...migratedState.settings };
    migratedState.version = 2;

    return migratedState;
  },
};

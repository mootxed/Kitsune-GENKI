/* adapters/legacy-window-api.js — Legacy Compatibility Adapter */

/**
 * Installs intentional legacy window exports for backward compatibility.
 * All global functions delegate directly to modern feature facades or UI shell components.
 *
 * @param {Object} options
 * @param {Object} [options.target=window] Target object to expose globals on
 * @param {Object} [options.srs] SRS engine
 * @param {Object} [options.questsManager] QuestsManager instance
 * @param {Object} [options.achievementSystem] AchievementSystem instance
 * @param {Function} [options.speakJapanese] Audio helper
 * @param {Function} [options.stopSpeaking] Audio helper
 * @param {Function} [options.formatTimeUntilReset] Time formatting helper
 * @param {Function} [options.toast] UI toast helper
 * @param {Function} [options.applyTheme] UI theme helper
 * @param {Function} [options.showNotification] Notification helper
 * @param {Function} [options.scheduleNotify] Notification scheduler
 * @param {Function} [options.scheduleOneHourReminder] Notification reminder
 * @param {Function} [options.calculateNextNotificationDate] Notification date calculator
 * @param {Function} [options.nav] Navigation function
 * @param {Function} [options.updateTabIndicator] Navigation tab indicator function
 * @returns {Function} Cleanup function to uninstall legacy window exports
 */
export function installLegacyWindowApi(options = {}) {
  const target = options.target || (typeof window !== 'undefined' ? window : null);
  if (!target) {
    return () => {};
  }

  const installedKeys = [];

  function setLegacyProp(key, value) {
    if (Object.hasOwn(target, key) && target[key] !== null && target[key] !== value) {
      console.warn(`[LegacyWindowApi] Property '${key}' already exists on target window.`);
    }
    target[key] = value;
    installedKeys.push(key);
  }

  if (options.srs !== undefined) setLegacyProp('SRS', options.srs);
  if (options.questsManager !== undefined) {
    setLegacyProp('QuestSystem', options.questsManager);
    setLegacyProp('QuestsManager', options.questsManager);
  } else {
    setLegacyProp('QuestSystem', null);
    setLegacyProp('QuestsManager', null);
  }

  if (options.achievementSystem !== undefined) {
    setLegacyProp('AchievementSystem', options.achievementSystem);
    setLegacyProp('Achievements', options.achievementSystem);
  } else {
    setLegacyProp('AchievementSystem', null);
    setLegacyProp('Achievements', null);
  }

  if (options.speakJapanese) setLegacyProp('speakJapanese', options.speakJapanese);
  if (options.stopSpeaking) setLegacyProp('stopSpeaking', options.stopSpeaking);
  if (options.formatTimeUntilReset)
    setLegacyProp('formatTimeUntilReset', options.formatTimeUntilReset);
  if (options.toast) setLegacyProp('toast', options.toast);
  if (options.applyTheme) setLegacyProp('applyTheme', options.applyTheme);
  if (options.showNotification) setLegacyProp('showNotification', options.showNotification);
  if (options.scheduleNotify) setLegacyProp('scheduleNotify', options.scheduleNotify);
  if (options.scheduleOneHourReminder)
    setLegacyProp('scheduleOneHourReminder', options.scheduleOneHourReminder);
  if (options.calculateNextNotificationDate)
    setLegacyProp('calculateNextNotificationDate', options.calculateNextNotificationDate);
  if (options.nav) setLegacyProp('nav', options.nav);
  if (options.updateTabIndicator) setLegacyProp('updateTabIndicator', options.updateTabIndicator);
  if (options.router) setLegacyProp('router', options.router);
  if (options.cleanupWordSearch) setLegacyProp('cleanupWordSearch', options.cleanupWordSearch);
  if (options.cleanupCrossword) setLegacyProp('cleanupCrossword', options.cleanupCrossword);

  return function uninstallLegacyWindowApi() {
    for (const key of installedKeys) {
      try {
        delete target[key];
      } catch (_err) {
        target[key] = undefined;
      }
    }
  };
}

/* src/domain-commands.js — Pure Domain Commands returning Events & Changed Flags */

/**
 * Command: Pause or Resume Study Plan
 */
export function pauseStudyPlanCommand(currentState, forceState) {
  if (!currentState?.studyPlan) {
    return { changed: false, events: [], paused: false };
  }
  const currentPaused = Boolean(currentState.studyPlan.paused);
  const targetPaused = typeof forceState === 'boolean' ? forceState : !currentPaused;

  if (currentPaused === targetPaused) {
    return { changed: false, events: [], paused: targetPaused };
  }

  return {
    changed: true,
    paused: targetPaused,
    events: [
      {
        type: 'STUDY_PLAN_TOGGLE_PAUSE',
        payload: { paused: targetPaused },
      },
    ],
  };
}

/**
 * Command: Delete Study Plan
 */
export function deleteStudyPlanCommand(currentState) {
  if (!currentState?.studyPlan) {
    return { changed: false, events: [] };
  }

  return {
    changed: true,
    events: [
      {
        type: 'STUDY_PLAN_UPDATE',
        payload: { plan: null },
      },
    ],
  };
}

/**
 * Command: Update Study Plan
 */
export function updateStudyPlanCommand(currentState, newPlan) {
  return {
    changed: true,
    events: [
      {
        type: 'STUDY_PLAN_UPDATE',
        payload: { plan: newPlan },
      },
    ],
  };
}

/**
 * Command: Claim Quest Reward (Idempotent: prevents double rewards)
 */
export function claimQuestRewardCommand(currentState, questId, rewardDetails = {}) {
  const { xp = 0, coins = 0 } = rewardDetails;
  const claimedList = currentState?.quests?.claimed || [];

  if (claimedList.includes(questId)) {
    return { changed: false, events: [], alreadyClaimed: true };
  }

  return {
    changed: true,
    alreadyClaimed: false,
    events: [
      {
        type: 'QUEST_REWARD_CLAIMED',
        payload: { questId, xp, coins },
      },
    ],
  };
}

/**
 * Command: Claim Achievement Reward (Idempotent: prevents double rewards)
 */
export function claimAchievementRewardCommand(currentState, achievementId, rewardAmount = 0) {
  const claimedList = currentState?.claimedAchievements || [];

  if (claimedList.includes(achievementId)) {
    return { changed: false, events: [], alreadyClaimed: true };
  }

  return {
    changed: true,
    alreadyClaimed: false,
    events: [
      {
        type: 'ACHIEVEMENT_REWARD_CLAIMED',
        payload: { achievementId, reward: rewardAmount },
      },
    ],
  };
}

/**
 * Command: Update Settings
 */
export function updateSettingsCommand(currentState, patch = {}) {
  return {
    changed: true,
    events: [
      {
        type: 'SETTINGS_UPDATE',
        payload: { settings: patch },
      },
    ],
  };
}

/**
 * Command: Update Theme / Dark Mode
 */
export function updateThemeCommand(currentState, theme, darkMode) {
  return {
    changed: true,
    events: [
      {
        type: 'THEME_UPDATE',
        payload: { theme, darkMode },
      },
    ],
  };
}

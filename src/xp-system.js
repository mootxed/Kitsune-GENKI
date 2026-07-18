/* src/xp-system.js — XP, level, rank rules */

export const XP_PER_LEVEL = 100;
export const XP_CARD = 1;
export const XP_CHECK = 20;
export const XP_CHAPTER_FULL = 100;
export const COINS_PER_LEVEL = 50;

/**
 * Add XP to the player, level up as needed, and award coins.
 * @param {number} amount
 * @param {object} state — mutable state with xp, level, coins
 * @param {object} callbacks — { onLevelUp(level), onSave() }
 */
export function addXP(amount, state, callbacks = {}) {
  state.xp += amount;
  let leveledUp = false;
  while (state.xp >= XP_PER_LEVEL) {
    state.xp -= XP_PER_LEVEL;
    state.level += 1;
    state.coins += COINS_PER_LEVEL;
    leveledUp = true;
    if (callbacks.onLevelUp) callbacks.onLevelUp(state.level);
  }
  if (callbacks.onSave) callbacks.onSave();
  return leveledUp;
}

export function xpToNextLevel(currentXP) {
  return XP_PER_LEVEL - currentXP;
}

export function getUserRankData(level) {
  const effectiveLevel = Math.max(1, Math.min(96, level));

  let league = "alpha";
  let leagueName = "Альфа";
  let baseLevel = effectiveLevel;

  if (effectiveLevel > 72) {
    league = "delta";
    leagueName = "Дельта Мастер";
    baseLevel = effectiveLevel - 72;
  } else if (effectiveLevel > 48) {
    league = "gamma";
    leagueName = "Гамма";
    baseLevel = effectiveLevel - 48;
  } else if (effectiveLevel > 24) {
    league = "beta";
    leagueName = "Бета";
    baseLevel = effectiveLevel - 24;
  }

  const iconNumber = Math.ceil(baseLevel / 2);
  const paddedNumber = String(iconNumber).padStart(2, '0');

  return {
    name: `${leagueName} — Ранг ${iconNumber}`,
    leagueName,
    levelSuffix: `Ранг ${iconNumber}`,
    icon: `${league}_${paddedNumber}.png`,
  };
}

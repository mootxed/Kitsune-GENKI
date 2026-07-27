/* tests/domain-commands.test.js — Tests for Domain Commands, Reducer, and commitState */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  reduceState,
  commitState,
  state,
  defaultState,
  resetApplicationData,
} from '../state/store.js';
import {
  pauseStudyPlanCommand,
  deleteStudyPlanCommand,
  updateStudyPlanCommand,
  claimQuestRewardCommand,
  claimAchievementRewardCommand,
  updateSettingsCommand,
  updateThemeCommand,
} from '../src/domain-commands.js';

describe('Domain Commands & Event Reducer Architecture', () => {
  beforeEach(async () => {
    await resetApplicationData({ skipReload: true });
  });

  describe('reduceState & commitState', () => {
    test('reduces STUDY_PLAN_TOGGLE_PAUSE event correctly', () => {
      const base = { ...defaultState(), studyPlan: { paused: false } };
      const event = { type: 'STUDY_PLAN_TOGGLE_PAUSE', payload: { paused: true } };

      const next = reduceState(base, event);
      expect(next.studyPlan.paused).toBe(true);
    });

    test('reduces QUEST_REWARD_CLAIMED event and prevents duplicate claims in reducer', () => {
      const base = {
        ...defaultState(),
        xp: 10,
        coins: 50,
        quests: { claimed: ['quest_1'] },
      };

      const event = {
        type: 'QUEST_REWARD_CLAIMED',
        payload: { questId: 'quest_1', xp: 20, coins: 10 },
      };

      const next = reduceState(base, event);
      expect(next.xp).toBe(10); // unchanged because quest_1 was already in claimed
      expect(next.coins).toBe(50);
    });

    test('commits events to global state via commitState', async () => {
      const cmd = updateSettingsCommand(state, { hideRomaji: true });
      await commitState(cmd.events);

      expect(state.settings.hideRomaji).toBe(true);
    });
  });

  describe('pauseStudyPlanCommand', () => {
    test('returns changed=false if study plan does not exist', () => {
      const base = { ...defaultState(), studyPlan: null };
      const res = pauseStudyPlanCommand(base);

      expect(res.changed).toBe(false);
      expect(res.events).toEqual([]);
    });

    test('toggles pause state when plan exists', () => {
      const base = { ...defaultState(), studyPlan: { paused: false } };
      const res = pauseStudyPlanCommand(base);

      expect(res.changed).toBe(true);
      expect(res.paused).toBe(true);
      expect(res.events).toHaveLength(1);
      expect(res.events[0].type).toBe('STUDY_PLAN_TOGGLE_PAUSE');
    });

    test('returns changed=false when target state equals current state', () => {
      const base = { ...defaultState(), studyPlan: { paused: true } };
      const res = pauseStudyPlanCommand(base, true);

      expect(res.changed).toBe(false);
    });
  });

  describe('deleteStudyPlanCommand', () => {
    test('returns changed=false when study plan is null', () => {
      const base = { ...defaultState(), studyPlan: null };
      const res = deleteStudyPlanCommand(base);

      expect(res.changed).toBe(false);
    });

    test('generates STUDY_PLAN_UPDATE event with null plan when plan exists', () => {
      const base = { ...defaultState(), studyPlan: { id: 'plan1' } };
      const res = deleteStudyPlanCommand(base);

      expect(res.changed).toBe(true);
      expect(res.events[0]).toEqual({
        type: 'STUDY_PLAN_UPDATE',
        payload: { plan: null },
      });
    });
  });

  describe('claimQuestRewardCommand & claimAchievementRewardCommand', () => {
    test('prevents double reward claims for quests', () => {
      const base = { ...defaultState(), quests: { claimed: ['daily_vocab_1'] } };
      const res = claimQuestRewardCommand(base, 'daily_vocab_1', { xp: 15, coins: 5 });

      expect(res.changed).toBe(false);
      expect(res.alreadyClaimed).toBe(true);
      expect(res.events).toEqual([]);
    });

    test('generates QUEST_REWARD_CLAIMED event for new quest claim', () => {
      const base = { ...defaultState(), quests: { claimed: [] } };
      const res = claimQuestRewardCommand(base, 'daily_vocab_1', { xp: 15, coins: 5 });

      expect(res.changed).toBe(true);
      expect(res.alreadyClaimed).toBe(false);
      expect(res.events[0]).toEqual({
        type: 'QUEST_REWARD_CLAIMED',
        payload: { questId: 'daily_vocab_1', xp: 15, coins: 5 },
      });
    });

    test('prevents double reward claims for achievements', () => {
      const base = { ...defaultState(), claimedAchievements: ['ach_first_lesson'] };
      const res = claimAchievementRewardCommand(base, 'ach_first_lesson', 50);

      expect(res.changed).toBe(false);
      expect(res.alreadyClaimed).toBe(true);
    });

    test('generates ACHIEVEMENT_REWARD_CLAIMED event for new achievement claim', () => {
      const base = { ...defaultState(), claimedAchievements: [] };
      const res = claimAchievementRewardCommand(base, 'ach_first_lesson', 50);

      expect(res.changed).toBe(true);
      expect(res.alreadyClaimed).toBe(false);
      expect(res.events[0]).toEqual({
        type: 'ACHIEVEMENT_REWARD_CLAIMED',
        payload: { achievementId: 'ach_first_lesson', reward: 50 },
      });
    });
  });

  describe('updateSettingsCommand & updateThemeCommand', () => {
    test('updates theme via event and commitState', async () => {
      const cmd = updateThemeCommand(state, 'custom', 'dark');
      await commitState(cmd.events);

      expect(state.settings.darkMode).toBe('dark');
    });
  });
});

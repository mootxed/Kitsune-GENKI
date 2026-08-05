import { describe, it, expect } from 'vitest';
import { buildHomeViewModel, getPrimaryHomeAction } from '../ui/home.js';

describe('Daily Flow & Home View Model State Machine', () => {
  it('detects FIRST_RUN when onboarding is not completed', () => {
    const state = { onboarding: { completed: false } };
    const vm = buildHomeViewModel({ state, plan: null });
    expect(vm.isFirstRun).toBe(true);
    expect(vm.stateName).toBe('FIRST_RUN');

    const primaryAction = getPrimaryHomeAction(vm);
    expect(primaryAction.type).toBe('start-onboarding');
  });

  it('detects PLAN_REQUIRED when onboarding is completed but no study plan exists', () => {
    const state = { onboarding: { completed: true }, studyPlan: null };
    const vm = buildHomeViewModel({ state, plan: null });
    expect(vm.isPlanRequired).toBe(true);
    expect(vm.stateName).toBe('PLAN_REQUIRED');

    const primaryAction = getPrimaryHomeAction(vm);
    expect(primaryAction.type).toBe('create-plan');
  });

  it('prioritizes SESSION_INTERRUPTED when an active session exists', () => {
    const state = {
      onboarding: { completed: true },
      studyPlan: { studyDaysOfWeek: [1, 2, 3, 4, 5, 6, 0] },
    };
    const activeSession = {
      managerState: {
        queue: [{ cardId: 'card-1', completed: false }],
      },
    };
    const vm = buildHomeViewModel({ state, plan: state.studyPlan, activeSession });
    expect(vm.hasActiveSession).toBe(true);
    expect(vm.stateName).toBe('SESSION_INTERRUPTED');

    const primaryAction = getPrimaryHomeAction(vm);
    expect(primaryAction.type).toBe('resume-session');
  });

  it('prioritizes STORAGE_RECOVERY_REQUIRED when storage is degraded', () => {
    const state = { onboarding: { completed: true }, studyPlan: {} };
    const vm = buildHomeViewModel({
      state,
      plan: state.studyPlan,
      storageStatus: { degraded: true },
    });
    expect(vm.isStorageRecovery).toBe(true);
    expect(vm.stateName).toBe('STORAGE_RECOVERY_REQUIRED');

    const primaryAction = getPrimaryHomeAction(vm);
    expect(primaryAction.type).toBe('storage-recovery');
  });
});

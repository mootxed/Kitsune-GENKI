/* src/onboarding-state.js — Onboarding state manager */

export function hasMeaningfulUserProgress(state) {
  if (!state || typeof state !== 'object') return false;

  // 1. Созданный учебный план
  if (
    state.studyPlan?.createdAt ||
    state.studyPlan?.createdDate ||
    state.studyPlan?.segments?.length
  ) {
    return true;
  }

  // 2. Начатые или завершённые главы
  if (state.chapters && typeof state.chapters === 'object') {
    const chapterEntries = Object.values(state.chapters);
    for (const ch of chapterEntries) {
      if (
        ch?.started === true ||
        ch?.completedAt ||
        (ch?.checklist && Object.keys(ch.checklist).length > 0)
      ) {
        return true;
      }
    }
  }

  // 3. Известные ранее главы (prior knowledge)
  if (Array.isArray(state.priorKnowledgeChapterIds) && state.priorKnowledgeChapterIds.length > 0) {
    return true;
  }

  // 4. События повторений или SRS-карточки с реальной историей
  if (Array.isArray(state.reviewEvents) && state.reviewEvents.length > 0) {
    return true;
  }

  if (state.srs && typeof state.srs === 'object') {
    for (const card of Object.values(state.srs)) {
      if (card && (card.reps > 0 || Number(card.stability) > 0 || card.state > 0)) {
        return true;
      }
    }
  }

  // 5. XP или ненулевой стрик
  if (Number(state.xp) > 0) return true;
  if (state.streak && Number(state.streak.count) > 0) return true;

  // 6. Завершённые learning events
  if (Array.isArray(state.learningEvents) && state.learningEvents.length > 0) {
    return true;
  }

  return false;
}

export function shouldShowOnboarding(state) {
  if (!state) return true;
  if (state.onboarding?.completed === true) return false;
  return !hasMeaningfulUserProgress(state);
}

export function getOnboardingDraft(state) {
  return state?.onboarding?.draft || {};
}

export function updateOnboardingDraft(state, updates, currentStep = null) {
  if (!state) return;
  state.onboarding ||= {
    schemaVersion: 1,
    completed: false,
    currentStep: 0,
    draft: null,
    completedAt: null,
  };

  state.onboarding.draft = {
    ...(state.onboarding.draft || {}),
    ...updates,
  };

  if (typeof currentStep === 'number') {
    state.onboarding.currentStep = currentStep;
  }
}

export function completeOnboarding(state) {
  if (!state) return;
  state.onboarding ||= {
    schemaVersion: 1,
    completed: false,
    currentStep: 0,
    draft: null,
    completedAt: null,
  };

  state.onboarding.completed = true;
  state.onboarding.completedAt = Date.now();
  state.onboarding.draft = null;
}

export function resetOnboarding(state) {
  if (!state) return;
  state.onboarding = {
    schemaVersion: 1,
    completed: false,
    currentStep: 0,
    draft: null,
    completedAt: null,
  };
}

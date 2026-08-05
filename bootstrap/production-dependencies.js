/* bootstrap/production-dependencies.js — Factory for production dependencies */

import { AchievementSystem } from '../achievements.js';
import { QuestsManager } from '../quests.js';
import { StudyPlan } from '../studyplan.js';
import { API } from '../services.js';
import { SRS } from '../srs.js';
import { SessionManager } from '../session-manager.js';

import { todayStr } from '../src/utils.js';
import {
  XP_PER_LEVEL,
  XP_CARD,
  XP_CHECK,
  XP_CHAPTER_FULL,
  COINS_PER_LEVEL,
  addXP,
  getUserRankData,
} from '../src/xp-system.js';
import { cardChapter, wordById, isWordUnlocked, dueCards, allCards } from '../src/srs-helpers.js';
import { sameLessonId } from '../src/courses/course-context.js';
import { evaluateAndCompleteChapter } from '../src/chapter-progress.js';
import {
  exportFullProgress,
  validateImportData,
  importFullProgress,
  downloadJSON,
  shareJSON,
} from '../src/backup-manager.js';
import { speakJapanese, stopSpeaking } from '../src/audio-helper.js';

import {
  state,
  loadState as loadStateFromStore,
  save as saveToStore,
  chState,
} from '../state/store.js';

import {
  showCompletionScreen,
  syncAvatars,
  refreshStreakDisplay,
  applyStreakSkin,
  applyCustomTheme,
  updateSrsBadge,
} from '../ui/shared.js';
import { nav, updateTabIndicator } from '../ui/router.js';
import {
  CH_NAMES,
  CHECK_ITEMS,
  LESSONS,
  CONTENT_INDEX,
  getLesson,
  ensureLesson,
  ensureLessonsForSrs,
  markActivity,
  startChapter,
  updateMainQuestsTimer,
  renderHome,
} from '../ui/home.js';
import { renderProfile, renderQuests, claimQuest, claimAchievementReward } from '../ui/profile.js';
import { renderFlash, renderDictionary, startExtraReview } from '../ui/flashcards.js';
import { SHOP_ITEMS } from '../ui/shop-catalog.js';
import { openWordBottomSheet, closeWordBottomSheet } from '../ui/word-bottom-sheet.js';
import { toast, applyTheme, showNotification, scheduleNotify } from '../ui/app-shell.js';

async function loadState() {
  await loadStateFromStore();
  if (state?.chatHistory) {
    const { setChatHistory } = await import('../ui/chat.js');
    setChatHistory(state.chatHistory);
  }
}

function save(immediate = false) {
  return saveToStore(immediate);
}

export function createProductionDependencies() {
  return {
    // State functions & getters
    get state() {
      return state;
    },
    getAISettings: () => state.settings,
    acceptAIPrivacy: () => {
      if (state?.settings) state.settings.aiPrivacyAccepted = true;
      return save();
    },
    importReviewExplanationToChat: (...args) =>
      import('../ui/chat.js').then((m) => m.importReviewExplanationToChat(...args)),
    save,
    loadState,
    chState,
    todayStr,

    // Navigation
    nav,
    updateTabIndicator,

    // UI utilities
    toast,
    applyTheme,
    showNotification,
    scheduleNotify,
    showCompletionScreen,
    refreshStreakDisplay,
    applyStreakSkin,
    applyCustomTheme,
    syncAvatars,
    updateSrsBadge,
    updateMainQuestsTimer,

    // Home module
    markActivity,
    startChapter,
    getLesson,
    ensureLesson,
    ensureLessonsForSrs,
    renderHome,

    // Constants
    LESSONS,
    CONTENT_INDEX,
    CH_NAMES,
    CHECK_ITEMS,
    XP_PER_LEVEL,
    XP_CARD,
    XP_CHECK,
    XP_CHAPTER_FULL,
    COINS_PER_LEVEL,
    SHOP_ITEMS,

    // XP system
    addXP: (amount) =>
      addXP(amount, state, {
        onLevelUp: (level) => toast(`🎉 Уровень ${level}! +${COINS_PER_LEVEL} 🪙`),
        onSave: save,
      }),
    appAddXP: (amount) =>
      addXP(amount, state, {
        onLevelUp: (level) => toast(`🎉 Уровень ${level}! +${COINS_PER_LEVEL} 🪙`),
        onSave: save,
      }),
    getUserRankData,

    // SRS helpers
    dueCards,
    allCards,
    cardChapter,
    wordById,
    isWordUnlocked,

    // Global objects
    SRS,
    SessionManager,
    API,
    QuestsManager,
    AchievementSystem,
    StudyPlan,

    // Backup
    exportFullProgress,
    validateImportData,
    importFullProgress,
    downloadJSON,
    shareJSON,

    // Stories
    openWordBottomSheet,
    closeWordBottomSheet,

    // Flashcards
    renderFlash,
    renderDictionary,
    startExtraReview,
    startChapterFlashcards: null,
    onReviewCommitted: (card) => {
      state.dailyPlan = null;
      const chapterId = cardChapter(card?.id);
      const chapter = getLesson(chapterId);
      if (!chapter) return;
      const chapters = CONTENT_INDEX.map((entry) =>
        sameLessonId(entry.id, chapterId) ? chapter : entry
      );
      const completion = evaluateAndCompleteChapter(state, chapterId, {
        chapters,
        recalculatePlan: StudyPlan.recalculateFuturePlan,
      });
      if (completion.rewardGranted) {
        addXP(XP_CHAPTER_FULL, state);
        toast(`🎉 Глава пройдена! +${XP_CHAPTER_FULL} XP!`);
      }
    },
    onReviewUndone: () => {
      state.dailyPlan = null;
    },

    // Profile
    renderProfile,
    renderQuests,
    claimQuest,
    claimAchievementReward,

    // Settings
    renderSettings: (...args) => import('../ui/settings.js').then((m) => m.renderSettings(...args)),

    // Audio
    speakJapanese,
    stopSpeaking,
  };
}

/* achievements.js — Achievement System for Kitsune Genki */
(function() {
  "use strict";

  const ACHIEVEMENTS = [
    // Стартовые достижения
    { id: "first_step", emoji: "👣", title: "Первый шаг", desc: "Начни свою первую главу", check: (s) => Object.values(s.chapters).some(c => c.started) },
    { id: "first_card", emoji: "🎴", title: "Первая карточка", desc: "Повтори свою первую SRS карточку", check: (s) => s.dailyCards > 0 },
    { id: "first_streak", emoji: "🔥", title: "День первый", desc: "Начни свой первый стрик", check: (s) => s.streak.count >= 1 },
    
    // Стрик достижения
    { id: "streak_3", emoji: "🔥", title: "Три дня подряд", desc: "Достигни 3-дневного стрика", check: (s) => s.streak.count >= 3 },
    { id: "streak_7", emoji: "⭐", title: "Неделя силы", desc: "Достигни 7-дневного стрика", check: (s) => s.streak.count >= 7 },
    { id: "streak_30", emoji: "💎", title: "Месяц упорства", desc: "Достигни 30-дневного стрика", check: (s) => s.streak.count >= 30 },
    { id: "streak_100", emoji: "🏆", title: "Столетие", desc: "Достигни 100-дневного стрика", check: (s) => s.streak.count >= 100 },
    
    // XP и уровни
    { id: "level_5", emoji: "⬆️", title: "Новичок", desc: "Достигни 5 уровня", check: (s) => s.level >= 5 },
    { id: "level_10", emoji: "🎖️", title: "Ученик", desc: "Достигни 10 уровня", check: (s) => s.level >= 10 },
    { id: "level_20", emoji: "🥇", title: "Мастер", desc: "Достигни 20 уровня", check: (s) => s.level >= 20 },
    
    // SRS достижения
    { id: "cards_10", emoji: "📚", title: "Дециматор", desc: "Повтори 10 карточек за день", check: (s) => s.dailyCards >= 10 },
    { id: "cards_50", emoji: "🎯", title: "Полсотни", desc: "Повтори 50 карточек за день", check: (s) => s.dailyCards >= 50 },
    { id: "cards_100", emoji: "💯", title: "Сотня", desc: "Повтори 100 карточек за день", check: (s) => s.dailyCards >= 100 },
    { id: "total_500", emoji: "🌟", title: "500 повторений", desc: "Повтори 500 карточек всего", check: (s) => Object.values(s.history).reduce((a,b) => a+b, 0) >= 500 },
    
    // Прогресс глав
    { id: "ch_1", emoji: "1️⃣", title: "Первая глава", desc: "Заверши главу 1", check: (s) => isChapterComplete(s, 1) },
    { id: "ch_5", emoji: "5️⃣", title: "Половина пути", desc: "Заверши 5 глав", check: (s) => completedChapters(s) >= 5 },
    { id: "ch_12", emoji: "🎓", title: "Genki I Мастер", desc: "Заверши все 12 глав", check: (s) => completedChapters(s) >= 12 },
    
    // Монеты
    { id: "coins_100", emoji: "🪙", title: "Первая сотня", desc: "Накопи 100 монет", check: (s) => s.coins >= 100 },
    { id: "coins_500", emoji: "💰", title: "Богач", desc: "Накопи 500 монет", check: (s) => s.coins >= 500 },
    
    // Специальные
    { id: "night_owl", emoji: "🦉", title: "Полуночник", desc: "Повтори карточки после 23:00", check: (s) => checkNightOwl(s) },
    { id: "early_bird", emoji: "🌅", title: "Ранняя пташка", desc: "Повтори карточки до 6:00", check: (s) => checkEarlyBird(s) },
    { id: "collector", emoji: "🎨", title: "Коллекционер", desc: "Открой 5 скинов", check: (s) => s.unlockedStreakSkins.length >= 5 },
  ];

  function isChapterComplete(state, chId) {
    const cs = state.chapters[chId];
    if (!cs) return false;
    const items = ["words", "grammar", "dialog", "listening", "reading"];
    return items.every(k => cs.checklist[k]);
  }

  function completedChapters(state) {
    let count = 0;
    for (let i = 1; i <= 12; i++) {
      if (isChapterComplete(state, i)) count++;
    }
    return count;
  }

  function checkNightOwl(state) {
    // Проверяем историю — хотя бы раз был активен между 23:00-23:59
    return state._nightOwlUnlocked || false;
  }

  function checkEarlyBird(state) {
    // Проверяем историю — хотя бы раз был активен между 00:00-05:59
    return state._earlyBirdUnlocked || false;
  }

  window.Achievements = {
    getAll: () => ACHIEVEMENTS,
    
    checkAll: (state) => {
      if (!state.unlockedAchievements) state.unlockedAchievements = [];
      const newUnlocks = [];
      
      ACHIEVEMENTS.forEach(ach => {
        if (state.unlockedAchievements.includes(ach.id)) return;
        if (ach.check(state)) {
          state.unlockedAchievements.push(ach.id);
          newUnlocks.push(ach);
        }
      });
      
      return newUnlocks;
    },
    
    getProgress: (state) => {
      if (!state.unlockedAchievements) state.unlockedAchievements = [];
      return {
        unlocked: state.unlockedAchievements.length,
        total: ACHIEVEMENTS.length,
        percent: Math.round((state.unlockedAchievements.length / ACHIEVEMENTS.length) * 100)
      };
    }
  };
})();
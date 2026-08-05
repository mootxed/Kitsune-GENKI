/* achievements.js — Achievement System for KotoKitsu */

export const ACHIEVEMENTS = [
  // Стартовые достижения
  {
    id: 'first_step',
    emoji: '👣',
    title: 'Первый шаг',
    desc: 'Начни свою первую главу',
    check: (s) => s.chapters && Object.keys(s.chapters).length > 0,
    rewards: { xp: 50, coins: 30 },
  },
  {
    id: 'first_card',
    emoji: '🎴',
    title: 'Первая карточка',
    desc: 'Повтори свою первую SRS карточку',
    check: (s) => s.dailyCards > 0,
    rewards: { xp: 50, coins: 30 },
  },
  {
    id: 'first_streak',
    emoji: '🔥',
    title: 'День первый',
    desc: 'Начни свой первый стрик',
    check: (s) => s.streak.count >= 1,
    rewards: { xp: 50, coins: 30 },
  },

  // Стрик достижения
  {
    id: 'streak_3',
    emoji: '🔥',
    title: 'Три дня подряд',
    desc: 'Достигни 3-дневного стрика',
    check: (s) => s.streak.count >= 3,
    rewards: { xp: 75, coins: 50 },
  },
  {
    id: 'streak_7',
    emoji: '⭐',
    title: 'Неделя силы',
    desc: 'Достигни 7-дневного стрика',
    check: (s) => s.streak.count >= 7,
    rewards: { xp: 100, coins: 75 },
  },
  {
    id: 'streak_30',
    emoji: '💎',
    title: 'Месяц упорства',
    desc: 'Достигни 30-дневного стрика',
    check: (s) => s.streak.count >= 30,
    rewards: { xp: 200, coins: 150 },
  },
  {
    id: 'streak_100',
    emoji: '🏆',
    title: 'Столетие',
    desc: 'Достигни 100-дневного стрика',
    check: (s) => s.streak.count >= 100,
    rewards: { xp: 500, coins: 300 },
  },

  // XP и уровни
  {
    id: 'level_5',
    emoji: '⬆️',
    title: 'Новичок',
    desc: 'Достигни 5 уровня',
    check: (s) => s.level >= 5,
    rewards: { xp: 75, coins: 50 },
  },
  {
    id: 'level_10',
    emoji: '🎖️',
    title: 'Ученик',
    desc: 'Достигни 10 уровня',
    check: (s) => s.level >= 10,
    rewards: { xp: 150, coins: 100 },
  },
  {
    id: 'level_20',
    emoji: '🥇',
    title: 'Мастер',
    desc: 'Достигни 20 уровня',
    check: (s) => s.level >= 20,
    rewards: { xp: 300, coins: 200 },
  },

  // SRS достижения
  {
    id: 'cards_10',
    emoji: '📚',
    title: 'Дециматор',
    desc: 'Повтори 10 карточек за день',
    check: (s) => s.dailyCards >= 10,
    rewards: { xp: 25, coins: 15 },
  },
  {
    id: 'cards_50',
    emoji: '🎯',
    title: 'Полсотни',
    desc: 'Повтори 50 карточек за день',
    check: (s) => s.dailyCards >= 50,
    rewards: { xp: 75, coins: 50 },
  },
  {
    id: 'cards_100',
    emoji: '💯',
    title: 'Сотня',
    desc: 'Повтори 100 карточек за день',
    check: (s) => s.dailyCards >= 100,
    rewards: { xp: 150, coins: 100 },
  },
  {
    id: 'total_500',
    emoji: '🌟',
    title: '500 повторений',
    desc: 'Повтори 500 карточек всего',
    check: (s) => Object.values(s.history).reduce((a, b) => a + b, 0) >= 500,
    rewards: { xp: 200, coins: 100 },
  },

  // Прогресс глав
  {
    id: 'ch_1',
    emoji: '1️⃣',
    title: 'Первый урок',
    desc: 'Заверши первый урок курса',
    check: (s) => {
      const firstLessonId = courseLessonIds(s)[0];
      return firstLessonId != null && isChapterComplete(s, firstLessonId);
    },
    rewards: { xp: 100, coins: 50 },
  },
  {
    id: 'ch_5',
    emoji: '5️⃣',
    title: 'Половина пути',
    desc: 'Заверши половину курса',
    check: (s) => {
      const total = courseLessonIds(s).length;
      return total > 0 && completedChapters(s) >= Math.ceil(total / 2);
    },
    rewards: { xp: 300, coins: 150 },
  },
  {
    id: 'ch_12',
    emoji: '🎓',
    title: 'Курс завершён',
    desc: 'Заверши все уроки курса',
    check: (s) => {
      const total = courseLessonIds(s).length;
      return total > 0 && completedChapters(s) >= total;
    },
    rewards: { xp: 500, coins: 300 },
  },

  // Монеты
  {
    id: 'coins_100',
    emoji: '🪙',
    title: 'Копилка',
    desc: 'Накопи 100 монет',
    check: (s) => s.coins >= 100,
    rewards: { xp: 50, coins: 25 },
  },
  {
    id: 'coins_500',
    emoji: '💰',
    title: 'Богатство',
    desc: 'Накопи 500 монет',
    check: (s) => s.coins >= 500,
    rewards: { xp: 100, coins: 50 },
  },
  {
    id: 'coins_1000',
    emoji: '💎',
    title: 'Миллионер',
    desc: 'Накопи 1000 монет',
    check: (s) => s.coins >= 1000,
    rewards: { xp: 200, coins: 100 },
  },

  // Квесты
  {
    id: 'quest_1',
    emoji: '⚡',
    title: 'Первый квест',
    desc: 'Заверши свой первый квест',
    check: (s) => s.quests && s.quests.daily.some((q) => q.completed),
    rewards: { xp: 50, coins: 30 },
  },
  {
    id: 'quest_daily_10',
    emoji: '🎯',
    title: 'Целеустремлённый',
    desc: 'Заверши 10 ежедневных квестов',
    check: (s) => s.quests && s.quests.completedDaily >= 10,
    rewards: { xp: 150, coins: 75 },
  },

  // Специальные
  {
    id: 'early_bird',
    emoji: '🌅',
    title: 'Ранняя пташка',
    desc: 'Учись до 8 утра',
    check: isEarlyBird,
    rewards: { xp: 100, coins: 50 },
  },
  {
    id: 'night_owl',
    emoji: '🦉',
    title: 'Полуночник',
    desc: 'Учись после полуночи',
    check: (s) => new Date().getHours() >= 0 && new Date().getHours() < 5,
    rewards: { xp: 100, coins: 50 },
  },
];

function isChapterComplete(state, chId) {
  const ch = state.chapters[chId];
  if (!ch || !ch.checklist) return false;
  if (ch.completedAt) return true;
  const checklist = Object.values(ch.checklist);
  return checklist.length > 0 && checklist.every((v) => v === true);
}

function completedChapters(state) {
  return courseLessonIds(state).filter((id) => isChapterComplete(state, id)).length;
}

function courseLessonIds(state) {
  const declared = state?.courses?.[state?.activeCourseId]?.lessonIds;
  return Array.isArray(declared) && declared.length > 0
    ? declared
    : Object.keys(state?.chapters || {});
}

function isEarlyBird(state) {
  return state._earlyBirdUnlocked || false;
}

export const AchievementSystem = {
  getAll: () => ACHIEVEMENTS,

  checkAll: (state) => {
    if (!state.unlockedAchievements) state.unlockedAchievements = [];
    const newUnlocks = [];

    ACHIEVEMENTS.forEach((ach) => {
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
      percent: Math.round((state.unlockedAchievements.length / ACHIEVEMENTS.length) * 100),
    };
  },
};

/* quests.js — Daily Quests & Weekly Challenges System */

// ========== HELPERS ==========

/**
 * Получить дату понедельника текущей недели в формате YYYY-MM-DD
 */
function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0 = Воскресенье
  const diff = day === 0 ? -6 : 1 - day; // Сдвиг к понедельнику
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Получить текущую дату в формате YYYY-MM-DD
 */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Генерировать уникальный ID для квеста
 */
function generateQuestId(type, date) {
  return `${type}_${date}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========== QUEST GENERATORS ==========

/**
 * Генерация ежедневных квестов (2 шт)
 */
function generateDailyQuests() {
  const today = todayStr();
  const quests = [];

  // Квест 1: "Выполнить N карточек" (N = 20, 30 или 50)
  const options = [20, 30, 50];
  const target = options[Math.floor(Math.random() * options.length)];
  const reward = Math.floor(target / 2);

  quests.push({
    id: generateQuestId('daily_cards', today),
    type: 'daily_cards',
    title: `Повтори ${target} карточек`,
    desc: `Повтори ${target} карточек сегодня`,
    target,
    progress: 0,
    completed: false,
    claimed: false,
    reward: { xp: reward, coins: Math.floor(reward / 2) },
    expires: today,
  });

  // Квест 2: "Достичь N правильных ответов подряд" (N = 5, 10 или 15)
  const streakOptions = [5, 10, 15];
  const streakTarget = streakOptions[Math.floor(Math.random() * streakOptions.length)];
  const streakReward = streakTarget * 5;

  quests.push({
    id: generateQuestId('streak_correct', today),
    type: 'streak_correct',
    title: `${streakTarget} правильных подряд`,
    desc: `Ответь правильно на ${streakTarget} карточек подряд`,
    target: streakTarget,
    progress: 0,
    completed: false,
    claimed: false,
    reward: { xp: streakReward, coins: Math.floor(streakReward / 2) },
    expires: today,
  });

  return quests;
}

/**
 * Генерация недельных челленджей (1 шт)
 */
function generateWeeklyChallenges() {
  const weekStart = getWeekStart();
  const challenges = [];

  // Челлендж: "Поддерживать стрик всю неделю" (7 дней)
  challenges.push({
    id: generateQuestId('weekly_streak', weekStart),
    type: 'weekly_streak',
    title: 'Стрик на всю неделю',
    desc: 'Поддерживай ежедневный стрик 7 дней подряд',
    target: 7,
    progress: 0,
    completed: false,
    claimed: false,
    reward: { xp: 500, coins: 250 },
    expires: weekStart,
  });

  return challenges;
}

// ========== STATE MANAGEMENT ==========

/**
 * Инициализация квестов (если их нет)
 */
function initializeQuests(state) {
  if (!state.quests) {
    state.quests = {
      daily: generateDailyQuests(),
      weekly: generateWeeklyChallenges(),
      lastReset: todayStr(),
      weekStart: getWeekStart(),
      completedDaily: 0,
      completedWeekly: 0,
      streakCorrect: 0, // Текущий стрик правильных ответов
    };
  }
}

/**
 * Проверка и сброс квестов (вызывается при загрузке приложения)
 */
function checkQuestReset(state) {
  if (!state.quests) {
    initializeQuests(state);
    return;
  }

  const today = todayStr();
  const currentWeekStart = getWeekStart();

  // Сброс ежедневных квестов
  if (state.quests.lastReset !== today) {
    // Подсчитываем завершённые квесты за вчера
    const completedYesterday = state.quests.daily.filter((q) => q.completed).length;
    state.quests.completedDaily = (state.quests.completedDaily || 0) + completedYesterday;

    // Генерируем новые ежедневные квесты
    state.quests.daily = generateDailyQuests();
    state.quests.lastReset = today;
    state.quests.streakCorrect = 0; // Сбрасываем стрик правильных ответов
  }

  // Сброс недельных челленджей
  if (state.quests.weekStart !== currentWeekStart) {
    // Подсчитываем завершённые челленджи за прошлую неделю
    const completedLastWeek = state.quests.weekly.filter((q) => q.completed).length;
    state.quests.completedWeekly = (state.quests.completedWeekly || 0) + completedLastWeek;

    // Генерируем новые недельные челленджи
    state.quests.weekly = generateWeeklyChallenges();
    state.quests.weekStart = currentWeekStart;
  }
}

/**
 * Обновление прогресса квеста
 */
function updateQuestProgress(state, questType, incrementValue = 1) {
  if (!state.quests) return;

  // Обновляем ежедневные квесты
  state.quests.daily.forEach((quest) => {
    if (quest.type === questType && !quest.completed) {
      quest.progress += incrementValue;
      if (quest.progress >= quest.target) {
        quest.progress = quest.target;
        quest.completed = true;
      }
    }
  });

  // Обновляем недельные челленджи
  state.quests.weekly.forEach((quest) => {
    if (quest.type === questType && !quest.completed) {
      quest.progress += incrementValue;
      if (quest.progress >= quest.target) {
        quest.progress = quest.target;
        quest.completed = true;
      }
    }
  });
}

/**
 * Увеличить стрик правильных ответов
 */
function incrementStreakCorrect(state) {
  if (!state.quests) return;

  state.quests.streakCorrect = (state.quests.streakCorrect || 0) + 1;

  // Обновляем прогресс квеста "streak_correct"
  state.quests.daily.forEach((quest) => {
    if (quest.type === 'streak_correct' && !quest.completed) {
      quest.progress = state.quests.streakCorrect;
      if (quest.progress >= quest.target) {
        quest.progress = quest.target;
        quest.completed = true;
      }
    }
  });
}

/**
 * Сбросить стрик правильных ответов
 */
function resetStreakCorrect(state) {
  if (!state.quests) return;
  state.quests.streakCorrect = 0;
}

/**
 * Забрать награду за квест
 */
function claimQuestReward(state, questId) {
  if (!state.quests) return null;

  // Ищем квест в ежедневных
  let quest = state.quests.daily.find((q) => q.id === questId);

  // Если не нашли, ищем в недельных
  if (!quest) {
    quest = state.quests.weekly.find((q) => q.id === questId);
  }

  if (!quest || !quest.completed || quest.claimed) {
    return null;
  }

  // Помечаем квест как забранный
  quest.claimed = true;

  // Возвращаем награду
  return quest.reward;
}

/**
 * Получить время до сброса (для UI)
 */
function getTimeUntilReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const diff = tomorrow - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));

  return `${hours}h left`;
}

// ========== EXPORT ==========

export const QuestsManager = {
  initializeQuests,
  checkQuestReset,
  updateQuestProgress,
  incrementStreakCorrect,
  resetStreakCorrect,
  claimQuestReward,
  getTimeUntilReset,
  getWeekStart,
  todayStr,
};

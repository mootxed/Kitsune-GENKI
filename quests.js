/* quests.js — Daily Quests & Weekly Challenges System */
(function (global) {
  "use strict";

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
      id: generateQuestId("daily_cards", today),
      type: "daily_cards",
      title: `Выполнить ${target} карточек`,
      desc: "Повторите карточки в режиме SRS",
      target: target,
      current: 0,
      reward: { xp: reward, coins: reward },
      completed: false,
      claimed: false,
      generatedDate: today,
      icon: "🎯"
    });

    // Квест 2: "Выполнить правильно 5 карточек подряд"
    quests.push({
      id: generateQuestId("daily_streak", today),
      type: "daily_streak",
      title: "Выполнить правильно 5 карточек подряд",
      desc: "Ответьте Good или Easy с первой попытки",
      target: 5,
      current: 0,
      reward: { xp: 15, coins: 12 },
      completed: false,
      claimed: false,
      generatedDate: today,
      icon: "🔥"
    });

    return quests;
  }

  /**
   * Генерация еженедельных челленджей (2 шт)
   */
  function generateWeeklyChallenges() {
    const weekStart = getWeekStart();
    const challenges = [];

    // Челлендж 1: "Выполнить 10 ежедневных заданий"
    challenges.push({
      id: generateQuestId("weekly_dailies", weekStart),
      type: "weekly_dailies",
      title: "Выполнить 10 ежедневных заданий",
      desc: "Завершите 10 daily квестов за неделю",
      target: 10,
      current: 0,
      reward: { xp: 100, coins: 50 },
      completed: false,
      claimed: false,
      generatedDate: weekStart,
      icon: "🗡️"
    });

    // Челлендж 2: "Выполнить 250 карточек за неделю"
    challenges.push({
      id: generateQuestId("weekly_cards", weekStart),
      type: "weekly_cards",
      title: "Выполнить 250 карточек за неделю",
      desc: "Повторите 250 карточек в течение недели",
      target: 250,
      current: 0,
      reward: { xp: 150, coins: 75 },
      completed: false,
      claimed: false,
      generatedDate: weekStart,
      icon: "⚔️"
    });

    return challenges;
  }

  // ========== QUEST MANAGEMENT ==========

  /**
   * Инициализация квестов в state
   */
  function initializeQuests(state) {
    if (!state.quests) {
      state.quests = {
        daily: generateDailyQuests(),
        weekly: generateWeeklyChallenges(),
        streakCorrect: 0,
        weeklyCards: 0,
        dailyCompleted: 0,
        lastDailyReset: todayStr(),
        lastWeeklyReset: getWeekStart()
      };
    }
    
    // Проверка: если daily квестов меньше 2, перегенерируем
    if (!state.quests.daily || state.quests.daily.length < 2) {
      state.quests.daily = generateDailyQuests();
      state.quests.streakCorrect = 0;
      state.quests.lastDailyReset = todayStr();
    }
  }

  /**
   * Проверка и сброс квестов при смене дня/недели
   */
  function checkQuestReset(state) {
    const today = todayStr();
    const weekStart = getWeekStart();

    // Сброс ежедневных квестов
    if (state.quests.lastDailyReset !== today) {
      // Подсчитываем завершённые квесты для weekly challenge
      const completedToday = state.quests.daily.filter(q => q.completed).length;
      state.quests.dailyCompleted += completedToday;

      // Генерируем новые ежедневные квесты
      state.quests.daily = generateDailyQuests();
      state.quests.streakCorrect = 0;
      state.quests.lastDailyReset = today;
    }

    // Сброс еженедельных челленджей
    if (state.quests.lastWeeklyReset !== weekStart) {
      state.quests.weekly = generateWeeklyChallenges();
      state.quests.weeklyCards = 0;
      state.quests.dailyCompleted = 0;
      state.quests.lastWeeklyReset = weekStart;
    }

    // Обновляем weekly challenge с текущими значениями
    updateWeeklyChallenges(state);
  }

  /**
   * Обновление прогресса квеста
   */
  function updateQuestProgress(state, questType, amount = 1) {
    if (!state.quests) return;

    // Обновляем ежедневные квесты
    state.quests.daily.forEach(quest => {
      if (quest.type === questType && !quest.completed) {
        quest.current = Math.min(quest.current + amount, quest.target);
        if (quest.current >= quest.target) {
          quest.completed = true;
        }
      }
    });

    // Обновляем еженедельные челленджи
    if (questType === "daily_cards" || questType === "daily_streak") {
      state.quests.weeklyCards += amount;
    }

    updateWeeklyChallenges(state);
  }

  /**
   * Обновление weekly challenges на основе текущих счётчиков
   */
  function updateWeeklyChallenges(state) {
    if (!state.quests || !state.quests.weekly) return;

    state.quests.weekly.forEach(challenge => {
      if (challenge.completed) return;

      if (challenge.type === "weekly_dailies") {
        // Подсчитываем завершённые ежедневные квесты
        const completedDaily = state.quests.daily.filter(q => q.completed).length;
        challenge.current = state.quests.dailyCompleted + completedDaily;
      } else if (challenge.type === "weekly_cards") {
        challenge.current = state.quests.weeklyCards;
      }

      if (challenge.current >= challenge.target) {
        challenge.completed = true;
      }
    });
  }

  /**
   * Инкремент счётчика правильных ответов подряд
   */
  function incrementStreakCorrect(state) {
    if (!state.quests) return;
    state.quests.streakCorrect += 1;
    updateQuestProgress(state, "daily_streak", 1);
  }

  /**
   * Сброс счётчика правильных ответов подряд
   */
  function resetStreakCorrect(state) {
    if (!state.quests) return;
    state.quests.streakCorrect = 0;
    
    // Сбрасываем прогресс квеста "5 подряд"
    state.quests.daily.forEach(quest => {
      if (quest.type === "daily_streak" && !quest.completed) {
        quest.current = 0;
      }
    });
  }

  /**
   * Получить награду за квест
   */
  function claimQuestReward(state, questId) {
    if (!state.quests) return null;

    // Ищем квест в daily
    let quest = state.quests.daily.find(q => q.id === questId);
    let isDaily = true;

    // Если не нашли, ищем в weekly
    if (!quest) {
      quest = state.quests.weekly.find(q => q.id === questId);
      isDaily = false;
    }

    if (!quest) return null;
    if (!quest.completed || quest.claimed) return null;

    // Начисляем награду
    const reward = quest.reward;
    quest.claimed = true;

    return {
      xp: reward.xp,
      coins: reward.coins,
      questTitle: quest.title
    };
  }

  /**
   * Получить оставшееся время до сброса (в часах)
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
  
  global.QuestsManager = {
    initializeQuests,
    checkQuestReset,
    updateQuestProgress,
    incrementStreakCorrect,
    resetStreakCorrect,
    claimQuestReward,
    getTimeUntilReset,
    getWeekStart,
    todayStr
  };

})(window);
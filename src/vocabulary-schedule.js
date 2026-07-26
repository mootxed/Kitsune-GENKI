export function distributeVocabularyAcrossDates(totalWords, dateKeys, options = {}) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return {};
  const words = Math.max(0, Number(totalWords) || 0);
  const dates = [...new Set(dateKeys)].sort();
  const reserveDays = Math.min(
    Math.max(0, Number(options.reserveDays) || 0),
    Math.max(0, dates.length - 1)
  );
  const activeCount = dates.length - reserveDays;
  const result = {};
  const base = activeCount > 0 ? Math.floor(words / activeCount) : 0;
  const remainder = activeCount > 0 ? words % activeCount : 0;

  dates.forEach((dateKey, index) => {
    result[dateKey] = index < activeCount ? base + (index < remainder ? 1 : 0) : 0;
  });
  return result;
}

export function createVocabularySchedule(totalWords, dateKeys, options = {}) {
  const words = Math.max(0, Number(totalWords) || 0);
  const dates = [...new Set(dateKeys || [])].sort();
  const reserveDays = Math.min(
    Math.max(0, Number(options.reserveDays) || 0),
    Math.max(0, dates.length - 1)
  );
  const raw = distributeVocabularyAcrossDates(words, dates, { reserveDays });
  const maxPerDay = Number(options.maxPerDay) || 25;
  const requiredDailyTarget = Math.max(0, ...Object.values(raw));
  const infeasible = requiredDailyTarget > maxPerDay;
  const schedule = Object.fromEntries(
    Object.entries(raw).map(([dateKey, count]) => [
      dateKey,
      infeasible ? Math.min(count, maxPerDay) : count,
    ])
  );
  const scheduledWords = Object.values(schedule).reduce((sum, count) => sum + count, 0);
  return {
    schedule,
    reserveDays,
    infeasible,
    requiredDailyTarget,
    unscheduledWords: Math.max(0, words - scheduledWords),
  };
}

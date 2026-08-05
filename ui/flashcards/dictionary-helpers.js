/* ui/flashcards/dictionary-helpers.js — Label and UI formatting helpers for dictionary views */

export function getPartOfSpeechLabel(pos) {
  const mapping = {
    verb: 'Глагол',
    noun: 'Существительное',
    adjective: 'Прилагательное',
    adverb: 'Наречие',
    particle: 'Частица',
    expression: 'Выражение',
  };
  return mapping[pos] || pos || 'Неизвестно';
}

export function getVerbClassLabel(vc) {
  const mapping = {
    godan: '1-й класс (godan)',
    ichidan: '2-й класс (ichidan)',
    irregular: 'Неправильный',
  };
  return mapping[vc] || vc || 'Неизвестно';
}

export function getTopicLabel(topic) {
  const mapping = {
    food: 'Еда и напитки',
    people: 'Люди',
    places: 'Места',
    time: 'Время',
    study: 'Учёба',
    directions: 'Направления',
    objects: 'Предметы',
    family: 'Семья',
    nature: 'Природа',
    weather: 'Погода',
    colors: 'Цвета',
    body: 'Части тела',
    clothes: 'Одежда',
    actions: 'Действия',
    animals: 'Животные',
    transport: 'Транспорт',
    buildings: 'Здания',
    jobs: 'Профессии',
    health: 'Здоровье',
    hobby: 'Хобби',
    sports: 'Спорт',
    music: 'Музыка',
    technology: 'Технологии',
    money: 'Деньги',
    shopping: 'Покупки',
    travel: 'Путешествия',
    culture: 'Культура',
    home: 'Дом',
    school: 'Школа',
    work: 'Работа',
    entertainment: 'Развлечения',
    feelings: 'Чувства',
    society: 'Общество',
    politics: 'Политика',
    science: 'Наука',
    religion: 'Религия',
    history: 'История',
    geography: 'География',
    math: 'Математика',
    literature: 'Литература',
    art: 'Искусство',
    daily: 'Повседневность',
  };

  if (!topic) return '';
  const lowerTopic = topic.toLowerCase().trim();
  if (mapping[lowerTopic]) return mapping[lowerTopic];
  return lowerTopic.charAt(0).toUpperCase() + lowerTopic.slice(1);
}

export function getLessonsLabel(lessonIds) {
  if (!lessonIds || lessonIds.length === 0) return 'Вне уроков';
  return lessonIds.length > 1 ? `Уроки ${lessonIds.join(', ')}` : `Урок ${lessonIds[0]}`;
}

export function renderSkillRow(skillKey, skillLabel, mastery, appSkills) {
  const isApplicable = appSkills.includes(skillKey);
  if (!isApplicable) {
    const isProduction = skillKey === 'context-production';
    const notRequiredLabel = isProduction
      ? 'Не проверен (Освоено ограничено до «Уверенно»)'
      : 'Не требуется';
    return `
      <div class="dict-skill-row skill-disabled">
        <div class="dict-skill-header">
          <span class="dict-skill-name">${skillLabel}</span>
          <span class="dict-skill-status-badge badge-not-required" title="${isProduction ? 'Для данного слова нет контекстных production-заданий' : ''}">${notRequiredLabel}</span>
        </div>
      </div>
    `;
  }

  const metric = mastery.skillMetrics?.[skillKey];
  const hasStarted = metric && metric.card && metric.card.reps > 0;

  if (!hasStarted) {
    return `
      <div class="dict-skill-row skill-inactive">
        <div class="dict-skill-header">
          <span class="dict-skill-name">${skillLabel}</span>
          <span class="dict-skill-status-badge badge-queued">В очереди</span>
        </div>
      </div>
    `;
  }

  const accuracyPercent = Math.round((metric.accuracy || 0) * 100);
  const stabilityDays = Math.round(metric.stability || 0);
  const retrievabilityPercent = Math.round((metric.retrievability || 0) * 100);

  return `
    <div class="dict-skill-row skill-active">
      <div class="dict-skill-header">
        <span class="dict-skill-name">${skillLabel}</span>
        <span class="dict-skill-status-badge badge-active">Активно</span>
      </div>
      <div class="dict-skill-metrics-grid">
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Точность:</span>
          <span class="dict-metric-value">${accuracyPercent}%</span>
        </div>
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Стабильность:</span>
          <span class="dict-metric-value">${stabilityDays} дн.</span>
        </div>
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Память:</span>
          <span class="dict-metric-value">${retrievabilityPercent}%</span>
        </div>
      </div>
    </div>
  `;
}

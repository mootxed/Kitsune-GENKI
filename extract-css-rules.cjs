#!/usr/bin/env node
/**
 * Извлекает CSS правила для указанных классов из старого styles.css
 */

const fs = require('fs');

// Читаем старый styles.css
const oldCSS = fs.readFileSync('/tmp/old-styles.css', 'utf-8');

// Читаем список отсутствующих классов
const missing = JSON.parse(fs.readFileSync('missing-classes.json', 'utf-8'));

// Фильтруем реальные классы (убираем артефакты парсинга)
const realClasses = new Set();
const groups = {
  home: new Set(),
  plan: new Set(),
  shop: new Set(),
  overlay: new Set(),
  tabs: new Set(),
  other: new Set()
};

// Добавляем классы из каждой группы
missing.groups.home.forEach(c => {
  if (c.match(/^[a-zA-Z][\w-]*$/)) {
    realClasses.add(c);
    groups.home.add(c);
  }
});

missing.groups.plan.forEach(c => {
  if (c.match(/^[a-zA-Z][\w-]*$/)) {
    realClasses.add(c);
    groups.plan.add(c);
  }
});

missing.groups.shop.forEach(c => {
  if (c.match(/^[a-zA-Z][\w-]*$/)) {
    realClasses.add(c);
    groups.shop.add(c);
  }
});

missing.groups.overlay.forEach(c => {
  if (c.match(/^[a-zA-Z][\w-]*$/)) {
    realClasses.add(c);
    groups.overlay.add(c);
  }
});

missing.groups.tabs.forEach(c => {
  if (c.match(/^[a-zA-Z][\w-]*$/)) {
    realClasses.add(c);
    groups.tabs.add(c);
  }
});

// Добавляем важные классы из "other" (исключаем test coverage и прочий шум)
const importantOther = [
  'accent', 'btn', 'loader-content', 'loader-fox',
  'tab', 'tab-ic', 'tab-badge',
  'achievement-badge', 'achievement-card', 'achievement-desc', 'achievement-emoji', 'achievement-title',
  'achievements-grid', 'achievements-section',
  'chat-input', 'chat-send', 'msg', 'msg-wrap', 'bot', 'user', 'typing',
  'check-item', 'check-label', 'checkbox',
  'ch-badge', 'ch-main', 'ch-name', 'ch-sub', 'ch-prog', 'ch-arrow',
  'card-h', 'tag-row', 'segment', 'row-between', 'prog-dash',
  'quest-card', 'quest-header', 'quest-title', 'quest-desc', 'quest-icon-wrap',
  'quest-main', 'quest-progress-bar', 'quest-progress-fill', 'quest-reward-pill',
  'quest-action', 'quest-counter', 'quest-progress-row',
  'daily', 'daily-header', 'daily-label', 'daily-timer', 'weekly',
  'story-card', 'story-cover-wrap', 'story-cover', 'story-info', 'story-title',
  'story-lesson', 'story-lesson-badge', 'story-meta', 'story-lock-icon', 'story-lock-overlay',
  'story-content', 'story-sentence', 'story-text', 'story-actions', 'sentence-jp',
  'sentence-translation', 'toggle-translation-btn',
  'profile-heatmap-wrap', 'heatmap-calendar-card', 'heatmap-weekday', 'heatmap-weekdays',
  'heatmap-month-label', 'heatmap-nav', 'heatmap-nav-btn', 'heatmap-empty', 'heatmap-legend-dot',
  'profile-level-bar-wrap', 'profile-level-bar-track', 'profile-level-bar-content',
  'profile-level-bar-text',
  'dict-search-wrap', 'dict-search-input', 'dict-lesson', 'dict-lesson-header',
  'dict-lesson-title', 'dict-lesson-count', 'dict-words-list', 'dict-word-card',
  'dict-word-main', 'dict-word-info', 'dict-word-lock-icon', 'dict-word-progress',
  'dict-progress-bar', 'dict-progress-fill', 'dict-progress-text',
  'dict-modal', 'dict-modal-header', 'dict-modal-title', 'dict-modal-content',
  'dict-modal-info', 'dict-modal-reading', 'dict-modal-translation', 'dict-modal-romaji',
  'dict-kanji-writer-container', 'dict-kanji-tabs', 'dict-kanji-tab', 'dict-kanji-controls',
  'dict-no-kanji',
  'drawing-mode-container', 'drawing-hint', 'drawing-translation', 'drawing-category',
  'drawing-controls', 'kanji-progress-cells', 'kanji-writer-wrap',
  'typing', 'save-note-btn', 'tool-card', 'tool-icon', 'tool-info', 'tool-arrow',
  'quiz-container', 'quiz-header', 'quiz-progress', 'quiz-question', 'quiz-options',
  'quiz-option-btn', 'table-wrap', 'muted', 'show'
];

importantOther.forEach(c => {
  realClasses.add(c);
  groups.other.add(c);
});

console.log(`\n📋 Всего реальных классов для извлечения: ${realClasses.size}\n`);

// Функция извлечения правил для класса
function extractRulesForClass(className) {
  const rules = [];
  
  // Ищем все селекторы с этим классом
  const regex = new RegExp(`\\.${className.replace(/[-]/g, '\\-')}(?![\\w-])[^{]*\\{[^}]*\\}`, 'g');
  const matches = oldCSS.match(regex);
  
  if (matches) {
    rules.push(...matches);
  }
  
  return rules;
}

// Группируем правила по модулям
const extractedRules = {
  home: [],
  plan: [],
  shop: [],
  overlay: [],
  tabs: [],
  other: []
};

for (const [groupName, classSet] of Object.entries(groups)) {
  for (const className of classSet) {
    const rules = extractRulesForClass(className);
    if (rules.length > 0) {
      extractedRules[groupName].push(...rules);
    }
  }
}

// Сохраняем результаты
for (const [groupName, rules] of Object.entries(extractedRules)) {
  if (rules.length > 0) {
    const uniqueRules = [...new Set(rules)].join('\n\n');
    fs.writeFileSync(`extracted-${groupName}.css`, uniqueRules);
    console.log(`✅ ${groupName}: извлечено ${rules.length} правил → extracted-${groupName}.css`);
  }
}

console.log('\n✨ Извлечение завершено!');
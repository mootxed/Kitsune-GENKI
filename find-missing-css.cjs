#!/usr/bin/env node
/**
 * Скрипт для поиска CSS классов, используемых в HTML/JS, но отсутствующих в CSS
 */

const fs = require('fs');
const path = require('path');

// Собираем все используемые классы из HTML
function extractClassesFromHTML(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const classes = new Set();
  
  // class="..." атрибуты
  const classMatches = content.matchAll(/class="([^"]*)"/g);
  for (const match of classMatches) {
    match[1].split(/\s+/).forEach(cls => cls && classes.add(cls));
  }
  
  return classes;
}

// Собираем классы из JS файлов
function extractClassesFromJS(dirPath) {
  const classes = new Set();
  
  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !file.startsWith('.')) {
        walkDir(fullPath);
      } else if (file.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // class="..." или className="..." в шаблонах
        const classMatches = content.matchAll(/class(?:Name)?="([^"]*)"/g);
        for (const match of classMatches) {
          match[1].split(/\s+/).forEach(cls => cls && classes.add(cls));
        }
        
        // classList.add/remove/toggle
        const classListMatches = content.matchAll(/classList\.(add|remove|toggle)\(['"]([^'"]+)['"]\)/g);
        for (const match of classListMatches) {
          classes.add(match[2]);
        }
        
        // className = '...'
        const classNameMatches = content.matchAll(/className\s*=\s*['"]([^'"]+)['"]/g);
        for (const match of classNameMatches) {
          match[1].split(/\s+/).forEach(cls => cls && classes.add(cls));
        }
      }
    }
  }
  
  walkDir(dirPath);
  return classes;
}

// Собираем все определенные классы из CSS
function extractDefinedClasses(cssDir) {
  const classes = new Set();
  
  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else if (file.endsWith('.css')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        // Находим все селекторы классов
        const classMatches = content.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g);
        for (const match of classMatches) {
          classes.add(match[1]);
        }
      }
    }
  }
  
  walkDir(cssDir);
  return classes;
}

// Основная логика
const htmlClasses = extractClassesFromHTML('index.html');
const jsClasses = extractClassesFromJS('.');
const usedClasses = new Set([...htmlClasses, ...jsClasses]);

const definedClasses = extractDefinedClasses('src/styles');

// Находим пропущенные классы
const missing = [...usedClasses].filter(cls => !definedClasses.has(cls)).sort();

console.log('=== ОТСУТСТВУЮЩИЕ CSS КЛАССЫ ===\n');
console.log(`Всего используется: ${usedClasses.size}`);
console.log(`Определено в CSS: ${definedClasses.size}`);
console.log(`Отсутствует: ${missing.length}\n`);

if (missing.length > 0) {
  // Группируем по логическим блокам
  const groups = {
    home: [],
    plan: [],
    shop: [],
    overlay: [],
    tabs: [],
    other: []
  };
  
  missing.forEach(cls => {
    if (cls.includes('streak') || cls.includes('xp-bar') || cls.includes('coins') || 
        cls.includes('stat-') || cls.includes('section-title') || cls.includes('plan-entry') ||
        cls.includes('main-quests') || cls.includes('card-1') || cls.includes('card-2') || cls.includes('card-3')) {
      groups.home.push(cls);
    } else if (cls.includes('plan-') || cls.includes('form-') || cls.includes('toggle-btn') || 
               cls.includes('weekday') || cls.includes('completed-chapters') || cls.includes('advice-')) {
      groups.plan.push(cls);
    } else if (cls.includes('shop-')) {
      groups.shop.push(cls);
    } else if (cls.includes('bottom-sheet') || cls.includes('completion-') || 
               cls.includes('word-kanji') || cls.includes('word-reading') || 
               cls.includes('word-translation') || cls.includes('word-type-badge') || 
               cls.includes('btn-primary-large')) {
      groups.overlay.push(cls);
    } else if (cls.includes('lib-tab')) {
      groups.tabs.push(cls);
    } else {
      groups.other.push(cls);
    }
  });
  
  console.log('📊 ГРУППИРОВКА ПО МОДУЛЯМ:\n');
  
  if (groups.home.length) {
    console.log(`🏠 HOME (${groups.home.length}):`);
    groups.home.forEach(c => console.log(`  - ${c}`));
    console.log();
  }
  
  if (groups.plan.length) {
    console.log(`📅 STUDY PLAN (${groups.plan.length}):`);
    groups.plan.forEach(c => console.log(`  - ${c}`));
    console.log();
  }
  
  if (groups.shop.length) {
    console.log(`🛒 SHOP (${groups.shop.length}):`);
    groups.shop.forEach(c => console.log(`  - ${c}`));
    console.log();
  }
  
  if (groups.overlay.length) {
    console.log(`📋 OVERLAYS (${groups.overlay.length}):`);
    groups.overlay.forEach(c => console.log(`  - ${c}`));
    console.log();
  }
  
  if (groups.tabs.length) {
    console.log(`📑 TABS (${groups.tabs.length}):`);
    groups.tabs.forEach(c => console.log(`  - ${c}`));
    console.log();
  }
  
  if (groups.other.length) {
    console.log(`❓ OTHER (${groups.other.length}):`);
    groups.other.forEach(c => console.log(`  - ${c}`));
    console.log();
  }
  
  // Сохраняем в файл для дальнейшего использования
  fs.writeFileSync('missing-classes.json', JSON.stringify({
    total: missing.length,
    classes: missing,
    groups
  }, null, 2));
  
  console.log('✅ Результаты сохранены в missing-classes.json');
  process.exit(1);
} else {
  console.log('✅ Все используемые классы определены в CSS!');
  process.exit(0);
}
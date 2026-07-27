import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Service Worker and Vite Build Alignment', () => {
  const publicSwPath = path.resolve(__dirname, '../public/sw.js');
  const distSwPath = path.resolve(__dirname, '../dist/sw.js');

  it('public/sw.js defines base path scope and relative paths', () => {
    const swContent = fs.readFileSync(publicSwPath, 'utf8');

    // Проверяем наличие динамического расчета SW_SCOPE и OFFLINE_URL
    expect(swContent).toContain("const SW_SCOPE = new URL('./', self.location).pathname;");
    expect(swContent).toContain(
      "const OFFLINE_URL = new URL('offline.html', self.location).pathname;"
    );

    // Проверяем, что LESSON_FILES использует относительный путь без слэша в начале
    expect(swContent).toContain("'data/content-index.json'");
    expect(swContent).toContain("'data/supplemental-practice.json'");
    expect(swContent).toContain('GRAMMAR_QUIZ_FILES');

    // Проверяем наличие плейсхолдеров для замещения при сборке
    expect(swContent).toContain('/* __STATIC_ASSETS_BEGIN__ */');
    expect(swContent).toContain('/* __STATIC_ASSETS_END__ */');

    // Проверяем резолвинг относительных URL через self.location
    expect(swContent).toContain('new URL(url, self.location)');
    expect(swContent).toContain('RESOLVED_STATIC_PATHS.includes(url.pathname)');
  });

  it('dist/sw.js (if built) replaces unbuilt source files with actual hashed production assets', () => {
    if (!fs.existsSync(distSwPath)) {
      // Игнорируем проверку dist, если сборка еще не выполнялась
      return;
    }

    const distSwContent = fs.readFileSync(distSwPath, 'utf8');

    // Не должно быть вызовов к исходным нескомпилированным файлам в dist/sw.js
    expect(distSwContent).not.toContain("'src/db.js'");
    expect(distSwContent).not.toContain("'ui/flashcards.js'");

    // Должны присутствовать ассеты из assets/
    expect(distSwContent).toMatch(/assets\/index-.*\.js/);
    expect(distSwContent).toMatch(/assets\/index-.*\.css/);
  });
});

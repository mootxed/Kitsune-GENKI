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

    // Проверяем, что точка входа курса использует package-relative путь
    expect(swContent).toContain("'data/courses/genki-1/manifest.json'");
    expect(swContent).toContain('COURSE_ENTRY_FILES');
    expect(swContent).toContain('courses\\/[^/]+\\/.*');

    // Проверяем наличие плейсхолдеров для замещения при сборке
    expect(swContent).toContain('/* __STATIC_ASSETS_BEGIN__ */');
    expect(swContent).toContain('/* __STATIC_ASSETS_END__ */');

    // Проверяем резолвинг относительных URL через self.location
    expect(swContent).toContain('new URL(url, self.location)');
    expect(swContent).toContain('RESOLVED_STATIC_PATHS.includes(url.pathname)');

    // Проверяем лимит кеша content и защиту метаданных
    expect(swContent).toContain('content: { maxEntries: 80');
    expect(swContent).toContain('isProtectedMetadataEntry');
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

describe('Service Worker Cache Eviction Logic (planCacheEvictions)', () => {
  const publicSwPath = path.resolve(__dirname, '../public/sw.js');
  let planCacheEvictions;
  let isProtectedMetadataEntry;

  beforeAll(() => {
    const swContent = fs.readFileSync(publicSwPath, 'utf8');
    const mockSelf = { location: new URL('http://localhost/'), addEventListener: () => {} };
    const fn = new Function(
      'self',
      'URL',
      `
      ${swContent}
      return { planCacheEvictions, isProtectedMetadataEntry };
    `
    );
    const result = fn(mockSelf, URL);
    planCacheEvictions = result.planCacheEvictions;
    isProtectedMetadataEntry = result.isProtectedMetadataEntry;
  });

  it('protects metadata entries and evicts old regular chunks when entries count exceeds limit', () => {
    const protectedUrls = [
      'http://localhost/data/courses/test-course/manifest.json',
      'http://localhost/data/courses/test-course/content-index.json',
      'http://localhost/data/courses/test-course/grammar/index.json',
      'http://localhost/data/courses/test-course/exercises/metadata.json',
      'http://localhost/data/courses/test-course/relations/metadata.json',
    ];

    const regularUrls = Array.from(
      { length: 80 },
      (_, i) => `http://localhost/data/courses/test-course/chunks/chunk-${i + 1}.json`
    );

    // Total 85 entries: 5 protected, 80 regular
    const entries = [...protectedUrls, ...regularUrls].map((url) => ({ key: url, size: 1000 }));
    const limits = { maxEntries: 75, maxSizeBytes: 15 * 1024 * 1024 };

    const toDelete = planCacheEvictions(entries, limits, isProtectedMetadataEntry);

    // None of the protected URLs should be selected for eviction
    for (const protUrl of protectedUrls) {
      expect(toDelete).not.toContain(protUrl);
    }

    // 80 regular entries vs limit of 75 => 5 oldest regular entries must be evicted
    expect(toDelete).toHaveLength(5);
    expect(toDelete).toEqual(regularUrls.slice(0, 5));
  });

  it('does not loop infinitely when protected metadata volume exceeds limitBytes', () => {
    const protectedUrl = 'http://localhost/data/courses/test-course/manifest.json';
    const regularUrl1 = 'http://localhost/data/courses/test-course/chunks/c1.json';
    const regularUrl2 = 'http://localhost/data/courses/test-course/chunks/c2.json';

    const entries = [
      { key: protectedUrl, size: 5000 },
      { key: regularUrl1, size: 100 },
      { key: regularUrl2, size: 100 },
    ];

    // Byte limit 1000 is much smaller than protected entry size 5000
    const limits = { maxEntries: 100, maxSizeBytes: 1000 };

    const toDelete = planCacheEvictions(entries, limits, isProtectedMetadataEntry);

    // Protected entry is not deleted
    expect(toDelete).not.toContain(protectedUrl);
    // Regular entries are deleted to try to fit within limits
    expect(toDelete).toEqual([regularUrl1, regularUrl2]);
  });
});

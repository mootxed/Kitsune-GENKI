import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Architecture & Import Dependencies', () => {
  function getImportedRelativeFiles(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    const imports = [];
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        imports.push(path.normalize(path.join(path.dirname(filePath), importPath)));
      }
    }
    return imports;
  }

  test('grammar-plan.js and practice-plan.js do not import chapter-progress.js directly', () => {
    const rootDir = process.cwd();
    const grammarPlanPath = path.join(rootDir, 'src', 'grammar-plan.js');
    const practicePlanPath = path.join(rootDir, 'src', 'practice-plan.js');
    const chapterProgressPath = path.join(rootDir, 'src', 'chapter-progress.js');

    const grammarImports = getImportedRelativeFiles(grammarPlanPath);
    const practiceImports = getImportedRelativeFiles(practicePlanPath);

    expect(grammarImports).not.toContain(chapterProgressPath);
    expect(practiceImports).not.toContain(chapterProgressPath);
  });

  test('generic runtime modules do not import the GENKI I package directly', () => {
    const rootDir = process.cwd();
    const sourceRoots = ['src', 'ui'].map((directory) => path.join(rootDir, directory));
    const allowed = new Set(
      [
        'src/courses/course-registry.js',
        'src/courses/genki-1/adapter.js',
        'src/courses/genki-1/migrations/state-v15.js',
        'src/courses/genki-1/migrations/vocabulary-id-map.js',
        'src/courses/genki-1/migrations/vocabulary-state.js',
        'src/backup-manager.js',
        'src/genki-vocabulary-id-map.js',
        'src/genki-vocabulary-migration.js',
      ].map((file) => path.join(rootDir, file))
    );

    function listJavaScriptFiles(directory) {
      return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const resolved = path.join(directory, entry.name);
        if (entry.isDirectory()) return listJavaScriptFiles(resolved);
        return entry.isFile() && entry.name.endsWith('.js') ? [resolved] : [];
      });
    }

    const violations = sourceRoots
      .flatMap(listJavaScriptFiles)
      .filter((file) => !allowed.has(file))
      .filter((file) => {
        const content = fs.readFileSync(file, 'utf8');
        return /(?:from\s+|import\s*\()['"][^'"]*(?:courses\/genki-1|genki-kanji|genki-vocabulary)/u.test(
          content
        );
      })
      .map((file) => path.relative(rootDir, file));

    expect(violations).toEqual([]);
  });

  test('canonical course data exists only inside course packages', () => {
    const rootDir = process.cwd();
    const removedLegacySources = [
      'public/data/content-index.json',
      'public/data/lessons',
      'public/data/stories',
      'public/data/grammar-quizzes',
      'public/data/supplemental-practice.json',
      'public/data/genki-kanji-availability.json',
      'public/data/genki-vocabulary-aliases.json',
      'public/data/genki-lesson-01-grammar-quiz.json',
    ];

    for (const source of removedLegacySources) {
      expect(fs.existsSync(path.join(rootDir, source)), source).toBe(false);
    }
    expect(fs.existsSync(path.join(rootDir, 'public/data/courses/genki-1/manifest.json'))).toBe(
      true
    );
  });

  test('runtime and service worker do not reference removed global course paths', () => {
    const rootDir = process.cwd();
    const runtimeFiles = [
      ...fs
        .readdirSync(path.join(rootDir, 'src'), { recursive: true })
        .filter((file) => String(file).endsWith('.js'))
        .map((file) => path.join(rootDir, 'src', file)),
      ...fs
        .readdirSync(path.join(rootDir, 'ui'), { recursive: true })
        .filter((file) => String(file).endsWith('.js'))
        .map((file) => path.join(rootDir, 'ui', file)),
      path.join(rootDir, 'public/sw.js'),
    ];
    const removedPathPattern =
      /data\/(?:content-index\.json|lessons\/|stories\/|grammar-quizzes\/|supplemental-practice\.json|genki-kanji-availability\.json|genki-vocabulary-aliases\.json)/u;

    const violations = runtimeFiles
      .filter((file) => removedPathPattern.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(rootDir, file));

    expect(violations).toEqual([]);
  });
});

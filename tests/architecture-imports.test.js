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
});

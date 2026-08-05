/* scripts/check-legacy-globals.js — Automated check for illegal window/globalThis property assignments */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

// Allowed files where intentional window.* assignments are permitted
const ALLOWED_FILES = new Set([
  path.join(rootDir, 'adapters', 'legacy-window-api.js'),
  path.join(rootDir, 'src', 'dev-tools.js'), // dev-tools log interceptor
]);

const IGNORED_PATHS = [
  path.join(rootDir, 'node_modules'),
  path.join(rootDir, 'dist'),
  path.join(rootDir, 'coverage'),
  path.join(rootDir, 'tests'),
  path.join(rootDir, 'scripts'),
  path.join(rootDir, 'playwright-report'),
  path.join(rootDir, 'test-results'),
];

function getAllJsFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (IGNORED_PATHS.some((ignored) => fullPath.startsWith(ignored))) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...getAllJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const targetDirectories = [
  rootDir,
  path.join(rootDir, 'src'),
  path.join(rootDir, 'ui'),
  path.join(rootDir, 'bootstrap'),
  path.join(rootDir, 'state'),
  path.join(rootDir, 'courses'),
];

const allJsFiles = new Set(
  targetDirectories
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => (fs.statSync(dir).isDirectory() ? getAllJsFiles(dir) : [dir]))
);

// Matches window.prop = ... or window['prop'] = ... or globalThis.prop = ...
// Rejects comparison operators (==, ===, !=, !==, <=, >=) or typeof calls
const assignmentRegex =
  /(?<!typeof\s+)\b(?:window|globalThis)(?:\.([a-zA-Z0-9_$]+)|\[\s*['"]([a-zA-Z0-9_$]+)['"]\s*\])\s*=(?!=)/gu;
const objectAssignRegex = /Object\.assign\s*\(\s*(?:window|globalThis)\s*,/gu;

const SAFE_WINDOW_PROPS = new Set([
  'location',
  'onerror',
  'onunhandledrejection',
  'onpopstate',
  'onload',
]);

const violations = [];

for (const filePath of allJsFiles) {
  if (ALLOWED_FILES.has(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    assignmentRegex.lastIndex = 0;
    let match;
    while ((match = assignmentRegex.exec(line)) !== null) {
      const propName = match[1] || match[2];
      if (propName && SAFE_WINDOW_PROPS.has(propName)) {
        continue;
      }
      violations.push({
        file: path.relative(rootDir, filePath),
        line: i + 1,
        code: trimmed,
        propName,
      });
    }

    objectAssignRegex.lastIndex = 0;
    if (objectAssignRegex.test(line)) {
      violations.push({
        file: path.relative(rootDir, filePath),
        line: i + 1,
        code: trimmed,
        propName: 'Object.assign',
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    '❌ Architecture Violation: Found illegal app-specific window/globalThis assignments:\n'
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} -> ${v.code}`);
  }
  console.error('\nNew window.* assignments outside adapters/legacy-window-api.js are forbidden.');
  process.exit(1);
} else {
  console.log('✅ Check legacy globals passed: No illegal window/globalThis assignments found.');
}

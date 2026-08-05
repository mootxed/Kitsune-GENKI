/* scripts/isolate-sourcemaps.js — Moves .map files from dist/ to .sourcemaps/ for CI archiving */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const sourcemapsDir = path.resolve(rootDir, '.sourcemaps');

function moveMapFiles(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      moveMapFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.map')) {
      const relPath = path.relative(distDir, fullPath);
      const targetPath = path.join(sourcemapsDir, relPath);

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.renameSync(fullPath, targetPath);
      console.log(`[Sourcemaps] Isolated → ${relPath} to .sourcemaps/`);
    }
  });
}

function run() {
  console.log('📦 Isolating sourcemaps from dist/ deployment bundle...\n');
  if (fs.existsSync(sourcemapsDir)) {
    fs.rmSync(sourcemapsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sourcemapsDir, { recursive: true });

  moveMapFiles(distDir);
  console.log('✅ Sourcemaps successfully isolated from public deployment bundle!');
}

run();

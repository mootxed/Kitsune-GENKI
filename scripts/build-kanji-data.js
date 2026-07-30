#!/usr/bin/env node
/**
 * scripts/build-kanji-data.js
 *
 * Собирает public/data/kanji-data.json из данных уроков.
 * Для каждого уникального кандзи из словаря уроков ищет JSON-файл
 * в @k1low/hanzi-writer-data-jp, затем hanzi-writer-data-jp (fallback).
 *
 * Запуск: node scripts/build-kanji-data.js
 * Автоматически: prebuild hook в package.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Диапазоны кодов кандзи ─────────────────────────────────────────────────
function isKanji(ch) {
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext-A
    (cp >= 0x20000 && cp <= 0x2a6df) || // CJK Ext-B
    (cp >= 0xf900 && cp <= 0xfaff) // CJK Compatibility
  );
}

// ── Шаг 1: собираем уникальные кандзи из уроков ───────────────────────────
function collectKanji() {
  const coursesDir = join(ROOT, 'public', 'data', 'courses');
  const kanjiSet = new Set();
  const dictionaryPath = join(ROOT, 'public', 'data', 'dictionary', 'entries.json');
  const dictionaryEntries = existsSync(dictionaryPath)
    ? JSON.parse(readFileSync(dictionaryPath, 'utf8')).entries || []
    : [];
  const dictionaryById = new Map(dictionaryEntries.map((entry) => [entry.id, entry]));

  for (const entry of dictionaryEntries) {
    for (const ch of entry.dictionaryForm || '') {
      if (isKanji(ch)) kanjiSet.add(ch);
    }
  }

  const packageDirectories = readdirSync(coursesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(coursesDir, entry.name));

  for (const packageDirectory of packageDirectories) {
    const manifestPath = join(packageDirectory, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const contentIndexPath = join(packageDirectory, manifest.dataPaths.contentIndex);
    const contentIndex = JSON.parse(readFileSync(contentIndexPath, 'utf8'));
    for (const entry of contentIndex.lessons || contentIndex.chapters || []) {
      const lessonPath = entry.lesson || entry.path;
      if (!lessonPath) continue;
      const data = JSON.parse(readFileSync(join(packageDirectory, lessonPath), 'utf8'));
      const vocab = data?.lesson?.vocabulary ?? data?.lesson?.words ?? [];
      for (const word of vocab) {
        const dictionaryEntry = dictionaryById.get(word.dictionaryId);
        const text =
          dictionaryEntry?.dictionaryForm ?? word.writtenForm ?? word.kanji ?? word.writing ?? '';
        for (const ch of text) {
          if (isKanji(ch)) kanjiSet.add(ch);
        }
      }
    }
  }

  return [...kanjiSet].sort();
}

// ── Шаг 2: ищем данные символа в датасетах ────────────────────────────────
const DATASETS = [
  join(ROOT, 'node_modules', '@k1low', 'hanzi-writer-data-jp'),
  join(ROOT, 'node_modules', 'hanzi-writer-data-jp'),
];

function loadCharData(char) {
  for (const dir of DATASETS) {
    const filePath = join(dir, `${char}.json`);
    if (existsSync(filePath)) {
      try {
        return JSON.parse(readFileSync(filePath, 'utf8'));
      } catch {
        // corrupt file — skip
      }
    }
  }
  return null;
}

// ── Шаг 3: сборка и запись ────────────────────────────────────────────────
function build() {
  // Guard check: stroke data requires mandatory licenses in public/licenses/
  const reqLic = [
    join(ROOT, 'public', 'licenses', 'hanzi-writer', 'LICENSE.txt'),
    join(ROOT, 'public', 'licenses', 'hanzi-writer-data-jp', 'LICENSES.md'),
  ];
  for (const lPath of reqLic) {
    if (!existsSync(lPath)) {
      console.error(`[build-kanji-data] ❌ ERROR: Mandatory stroke data license missing: ${lPath}`);
      console.error(
        '[build-kanji-data] Please run `npm run legal:prepare` before building kanji data.'
      );
      process.exit(1);
    }
  }

  console.log('[build-kanji-data] Collecting kanji from lessons…');
  const kanji = collectKanji();
  console.log(`[build-kanji-data] Found ${kanji.length} unique kanji`);
  if (kanji.length === 0) {
    throw new Error(
      '[build-kanji-data] No kanji found in lesson vocabulary; check the canonical word schema.'
    );
  }

  const outDir = join(ROOT, 'public', 'data', 'kanji');
  mkdirSync(outDir, { recursive: true });
  const expectedFiles = new Set(kanji.map((char) => `${char}.json`));
  let removedCount = 0;
  for (const file of readdirSync(outDir).filter((name) => name.endsWith('.json'))) {
    if (!expectedFiles.has(file)) {
      rmSync(join(outDir, file));
      removedCount++;
    }
  }

  const missing = [];
  let writtenCount = 0;

  for (const char of kanji) {
    const data = loadCharData(char);
    if (data) {
      const charPath = join(outDir, `${char}.json`);
      writeFileSync(charPath, JSON.stringify(data), 'utf8');
      writtenCount++;
    } else {
      missing.push(char);
    }
  }

  // Удаляем устаревший монолитный файл, если он существует
  const oldMonolithPath = join(ROOT, 'public', 'data', 'kanji-data.json');
  if (existsSync(oldMonolithPath)) {
    rmSync(oldMonolithPath);
    console.log('[build-kanji-data] 🧹 Removed obsolete public/data/kanji-data.json');
  }

  if (missing.length > 0) {
    console.warn(
      `[build-kanji-data] ⚠️  No stroke data for ${missing.length} kanji: ${missing.join(' ')}`
    );
    console.warn('[build-kanji-data]    These will fall back to multiple-choice mode at runtime.');
  }
  if (removedCount > 0) {
    console.log(`[build-kanji-data] 🧹 Removed ${removedCount} stale char files`);
  }

  console.log(
    `[build-kanji-data] ✅ Written ${writtenCount}/${kanji.length} char files → ${outDir}`
  );
}

build();

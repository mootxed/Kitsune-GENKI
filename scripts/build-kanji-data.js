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

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
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
  const lessonsDir = join(ROOT, 'public', 'data', 'lessons');
  const kanjiSet = new Set();

  const files = readdirSync(lessonsDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(lessonsDir, file), 'utf8'));
    const vocab = data?.lesson?.vocabulary ?? [];
    for (const word of vocab) {
      const text = word.kanji ?? '';
      for (const ch of text) {
        if (isKanji(ch)) kanjiSet.add(ch);
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
  console.log('[build-kanji-data] Collecting kanji from lessons…');
  const kanji = collectKanji();
  console.log(`[build-kanji-data] Found ${kanji.length} unique kanji`);

  const result = {};
  const missing = [];

  for (const char of kanji) {
    const data = loadCharData(char);
    if (data) {
      result[char] = data;
    } else {
      missing.push(char);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `[build-kanji-data] ⚠️  No stroke data for ${missing.length} kanji: ${missing.join(' ')}`
    );
    console.warn('[build-kanji-data]    These will fall back to multiple-choice mode at runtime.');
  }

  const outPath = join(ROOT, 'public', 'data', 'kanji-data.json');
  writeFileSync(outPath, JSON.stringify(result), 'utf8');

  const sizeKb = Math.round(readFileSync(outPath).length / 1024);
  console.log(
    `[build-kanji-data] ✅ Written ${Object.keys(result).length}/${kanji.length} chars → ${outPath} (${sizeKb} KB)`
  );
}

build();

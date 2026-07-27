#!/usr/bin/env node
/**
 * scripts/copy-third-party-licenses.js
 *
 * Deterministically copies required third-party license and notice files
 * from node_modules into public/licenses/ for production distribution.
 *
 * Exits with status 1 if any mandatory license file is missing.
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const HW_DIR = join(ROOT, 'node_modules', 'hanzi-writer');
const HW_DATA_DIR = join(ROOT, 'node_modules', '@k1low', 'hanzi-writer-data-jp');

const OUT_DIR = join(ROOT, 'public', 'licenses');

const MANDATORY_SOURCES = [
  {
    path: join(HW_DIR, 'LICENSE'),
    dest: join(OUT_DIR, 'hanzi-writer', 'LICENSE.txt'),
    name: 'hanzi-writer LICENSE',
  },
  {
    path: join(HW_DIR, 'COPYING.md'),
    dest: join(OUT_DIR, 'hanzi-writer', 'NOTICE.md'),
    name: 'hanzi-writer COPYING.md',
  },
  {
    path: join(HW_DATA_DIR, 'LICENSE'),
    dest: join(OUT_DIR, 'hanzi-writer-data-jp', 'LICENSES.md'),
    name: '@k1low/hanzi-writer-data-jp LICENSE',
  },
  {
    path: join(HW_DATA_DIR, 'licenses', 'COPYING.txt'),
    dest: join(OUT_DIR, 'hanzi-writer-data-jp', 'COPYING.txt'),
    name: '@k1low/hanzi-writer-data-jp COPYING.txt',
  },
  {
    path: join(HW_DATA_DIR, 'licenses', 'ARPHICPL.TXT'),
    dest: join(OUT_DIR, 'hanzi-writer-data-jp', 'ARPHICPL.TXT'),
    name: '@k1low/hanzi-writer-data-jp ARPHICPL.TXT',
  },
  {
    path: join(HW_DATA_DIR, 'licenses', 'LGPL.txt'),
    dest: join(OUT_DIR, 'hanzi-writer-data-jp', 'LGPL.txt'),
    name: '@k1low/hanzi-writer-data-jp LGPL.txt',
  },
  {
    path: join(HW_DATA_DIR, 'licenses', 'OFL.txt'),
    dest: join(OUT_DIR, 'hanzi-writer-data-jp', 'OFL.txt'),
    name: '@k1low/hanzi-writer-data-jp OFL.txt',
  },
  {
    path: join(HW_DATA_DIR, 'licenses', 'APL'),
    dest: join(OUT_DIR, 'hanzi-writer-data-jp', 'APL'),
    name: '@k1low/hanzi-writer-data-jp APL directory',
    isDir: true,
  },
];

export function copyLicenses() {
  console.log('[copy-third-party-licenses] Checking mandatory license files…');
  let missing = false;

  for (const item of MANDATORY_SOURCES) {
    if (!existsSync(item.path)) {
      console.error(`[copy-third-party-licenses] ❌ MISSING: ${item.name} (${item.path})`);
      missing = true;
    }
  }

  if (missing) {
    console.error('[copy-third-party-licenses] Cannot proceed without required license files.');
    process.exit(1);
  }

  for (const item of MANDATORY_SOURCES) {
    const parent = dirname(item.dest);
    mkdirSync(parent, { recursive: true });

    if (item.isDir) {
      cpSync(item.path, item.dest, { recursive: true, force: true });
    } else {
      const content = readFileSync(item.path, 'utf8');
      writeFileSync(item.dest, content, 'utf8');
    }
    console.log(`[copy-third-party-licenses] Synced → ${item.dest}`);
  }

  console.log(
    '[copy-third-party-licenses] ✅ All third-party license notices successfully copied.'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyLicenses();
}

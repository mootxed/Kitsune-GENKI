/* scripts/verify-fixtures.js — Verification script for historical migration fixtures */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures/migrations');

const REQUIRED_MANIFEST_FIELDS = [
  'id',
  'description',
  'sourceStateVersion',
  'targetStateVersion',
  'targetDbVersion',
  'fixedNow',
  'expectedWarnings',
  'expectedErrors',
  'invariants',
];

export function verifyFixtures() {
  console.log('[Fixtures Verifier] Checking migration fixtures directory...');
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.error(`[Fixtures Verifier] Directory not found: ${FIXTURES_DIR}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(FIXTURES_DIR, { withFileTypes: true });
  const fixtureDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (fixtureDirs.length === 0) {
    console.error('[Fixtures Verifier] No fixture subdirectories found');
    process.exit(1);
  }

  const seenIds = new Set();
  let errorsCount = 0;

  for (const dirName of fixtureDirs) {
    const dirPath = path.join(FIXTURES_DIR, dirName);
    const manifestPath = path.join(dirPath, 'manifest.json');
    const expectedPath = path.join(dirPath, 'expected.json');

    if (!fs.existsSync(manifestPath)) {
      console.error(`[Fixtures Verifier] Missing manifest.json in ${dirName}`);
      errorsCount++;
      continue;
    }

    if (!fs.existsSync(expectedPath)) {
      console.error(`[Fixtures Verifier] Missing expected.json in ${dirName}`);
      errorsCount++;
      continue;
    }

    let manifest;
    try {
      const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
      manifest = JSON.parse(manifestRaw);
    } catch (err) {
      console.error(`[Fixtures Verifier] Invalid JSON in ${manifestPath}: ${err.message}`);
      errorsCount++;
      continue;
    }

    for (const field of REQUIRED_MANIFEST_FIELDS) {
      if (manifest[field] === undefined) {
        console.error(`[Fixtures Verifier] Manifest in ${dirName} missing field: ${field}`);
        errorsCount++;
      }
    }

    if (seenIds.has(manifest.id)) {
      console.error(`[Fixtures Verifier] Duplicate fixture ID found: ${manifest.id}`);
      errorsCount++;
    } else if (manifest.id) {
      seenIds.add(manifest.id);
    }

    // Input state file check (state.json or session.json or idbState.json)
    const hasInputFile =
      fs.existsSync(path.join(dirPath, 'state.json')) ||
      fs.existsSync(path.join(dirPath, 'session.json')) ||
      fs.existsSync(path.join(dirPath, 'idbState.json'));

    if (!hasInputFile) {
      console.error(
        `[Fixtures Verifier] Missing input data file (state.json / session.json / idbState.json) in ${dirName}`
      );
      errorsCount++;
    }
  }

  if (errorsCount > 0) {
    console.error(`[Fixtures Verifier] ❌ Verification failed with ${errorsCount} error(s).`);
    process.exit(1);
  } else {
    console.log(
      `[Fixtures Verifier] ✅ Successfully verified ${fixtureDirs.length} migration fixtures.`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyFixtures();
}

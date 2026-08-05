/* scripts/generate-build-manifest.js — Generates build manifest with integrity hashes and commit metadata */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getFilesRecursively(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else if (entry.isFile() && entry.name !== 'dist-build-manifest.json') {
      results.push(fullPath);
    }
  }
  return results;
}

function run() {
  if (!fs.existsSync(DIST_DIR)) {
    console.warn(
      '[Manifest] Warning: dist/ directory does not exist. Skipping manifest generation.'
    );
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  const commitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA || 'local-build';

  const files = getFilesRecursively(DIST_DIR);
  const assetHashes = {};

  for (const file of files) {
    const relativePath = path.relative(DIST_DIR, file).replace(/\\/g, '/');
    assetHashes[relativePath] = hashFile(file);
  }

  const manifest = {
    name: packageJson.name || 'kotokitsu',
    version: packageJson.version || '0.1.0-alpha',
    commitSha,
    buildTimestamp: new Date().toISOString(),
    assetCount: Object.keys(assetHashes).length,
    hashes: assetHashes,
  };

  const manifestPath = path.join(DIST_DIR, 'dist-build-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(
    `[Manifest] Generated dist-build-manifest.json with commit: ${commitSha}, assets: ${manifest.assetCount}`
  );
}

run();

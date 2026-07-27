#!/usr/bin/env node
/**
 * scripts/check-legal-metadata.js
 *
 * Validates legal documentation, asset provenance, licensing metadata,
 * dependency versions, rebranding compliance, and documentation claims.
 *
 * Exits with status 1 on any validation failure.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function read(file) {
  return readFileSync(join(ROOT, file), 'utf8');
}

export function checkLegalMetadata() {
  console.log('[check-legal-metadata] Starting legal & metadata compliance audit…');
  const errors = [];

  // Check 1: Mandatory root & legal documents existence
  const requiredFiles = [
    'LICENSE',
    'LEGAL.md',
    'CONTENT_LICENSE.md',
    'THIRD_PARTY_NOTICES.md',
    'TRADEMARKS.md',
    'PRIVACY.md',
    'CONTENT_PROVENANCE.json',
    'public/rank/SOURCE.md',
    'ASSET_PROVENANCE.json',
    'docs/legal/README.md',
    'docs/legal/licensing-model.md',
    'docs/legal/asset-provenance.md',
    'docs/legal/third-party-content.md',
    'docs/legal/unresolved-legal-questions.md',
    'docs/legal/content-provenance.md',
    'docs/legal/unresolved-content-review.md',
  ];

  for (const file of requiredFiles) {
    if (!existsSync(join(ROOT, file))) {
      errors.push(`Missing mandatory legal document: ${file}`);
    }
  }

  // Check 2: Public brand check (KotoKitsu)
  if (existsSync(join(ROOT, 'package.json'))) {
    const pkg = JSON.parse(read('package.json'));
    if (pkg.name !== 'kotokitsu') {
      errors.push(`package.json name must be "kotokitsu", found "${pkg.name}"`);
    }
    if (pkg.productName !== 'KotoKitsu') {
      errors.push(`package.json productName must be "KotoKitsu", found "${pkg.productName}"`);
    }
  }

  if (existsSync(join(ROOT, 'public/manifest.json'))) {
    const manifest = JSON.parse(read('public/manifest.json'));
    if (manifest.short_name !== 'KotoKitsu') {
      errors.push(`manifest.json short_name must be "KotoKitsu", found "${manifest.short_name}"`);
    }
  }

  if (existsSync(join(ROOT, 'index.html'))) {
    const html = read('index.html');
    if (!html.includes('<title>KotoKitsu')) {
      errors.push('index.html title must contain "KotoKitsu"');
    }
  }

  // Check 3: Check absence of false registered trademark claims (KotoKitsu®)
  const filesToScanForReg = ['README.md', 'LEGAL.md', 'TRADEMARKS.md', 'PRIVACY.md', 'index.html'];
  for (const f of filesToScanForReg) {
    if (existsSync(join(ROOT, f))) {
      const txt = read(f);
      if (txt.includes('KotoKitsu®') || txt.includes('зарегистрированный товарный знак')) {
        errors.push(
          `File ${f} contains illegal registered trademark claim (KotoKitsu® or similar)`
        );
      }
    }
  }

  // Check 4: Check absence of Germany / Impressum claims in legal docs
  const legalDocs = ['LEGAL.md', 'PRIVACY.md', 'CONTENT_LICENSE.md', 'TRADEMARKS.md'];
  for (const f of legalDocs) {
    if (existsSync(join(ROOT, f))) {
      const txt = read(f);
      if (txt.includes('Impressum') || txt.includes('Germany') || txt.includes('Германия')) {
        errors.push(`Legal document ${f} incorrectly contains Impressum or Germany claims`);
      }
    }
  }

  // Check 5: Preservation of supplemental grammar quizzes (extra practice)
  const quizDir = join(ROOT, 'public/data/grammar-quizzes');
  if (!existsSync(quizDir)) {
    errors.push('Supplemental grammar quizzes directory public/data/grammar-quizzes/ is missing!');
  } else {
    for (let i = 1; i <= 12; i++) {
      const pad = String(i).padStart(2, '0');
      const qFile = join(quizDir, `lesson-${pad}.json`);
      if (!existsSync(qFile)) {
        errors.push(`Grammar quiz file missing: public/data/grammar-quizzes/lesson-${pad}.json`);
      }
    }
  }

  // Check 6: Vector Ranks CC0 1.0 & RhosGFX attribution
  if (existsSync(join(ROOT, 'public/rank/SOURCE.md'))) {
    const sourceTxt = read('public/rank/SOURCE.md');
    if (!sourceTxt.includes('RhosGFX')) {
      errors.push('public/rank/SOURCE.md must mention author "RhosGFX"');
    }
    if (!sourceTxt.includes('CC0 1.0 Universal') && !sourceTxt.includes('CC0')) {
      errors.push('public/rank/SOURCE.md must declare CC0 1.0 Universal license');
    }
  }

  if (existsSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'))) {
    const tpTxt = read('THIRD_PARTY_NOTICES.md');
    if (!tpTxt.includes('RhosGFX')) {
      errors.push('THIRD_PARTY_NOTICES.md must mention Vector Ranks author "RhosGFX"');
    }
    if (!tpTxt.includes('CC0 1.0')) {
      errors.push('THIRD_PARTY_NOTICES.md must declare Vector Ranks CC0 1.0 license');
    }
  }

  // Check 7: ASSET_PROVENANCE.json coverage for rank icons and story covers
  if (existsSync(join(ROOT, 'ASSET_PROVENANCE.json'))) {
    try {
      const provData = JSON.parse(read('ASSET_PROVENANCE.json'));
      const records = Array.isArray(provData.assets) ? provData.assets : [];
      const recordPaths = new Set(records.map((r) => r.path));

      // Check all public/rank/*.webp
      const rankDir = join(ROOT, 'public', 'rank');
      if (existsSync(rankDir)) {
        const rankFiles = readdirSync(rankDir).filter((f) => f.endsWith('.webp'));
        for (const rf of rankFiles) {
          const rel = `public/rank/${rf}`;
          if (!recordPaths.has(rel)) {
            errors.push(`Rank file missing provenance record: ${rel}`);
          }
        }
      }

      // Check all public/image/Story*.webp
      const imgDir = join(ROOT, 'public', 'image');
      if (existsSync(imgDir)) {
        const storyFiles = readdirSync(imgDir).filter(
          (f) => f.startsWith('Story') && f.endsWith('.webp')
        );
        for (const sf of storyFiles) {
          const rel = `public/image/${sf}`;
          if (!recordPaths.has(rel)) {
            errors.push(`Story cover missing provenance record: ${rel}`);
          }
        }
      }

      // Check AI story cover unknown fields presence
      for (const rec of records) {
        if (rec.assetType === 'story-cover' && rec.sourceType === 'ai-generated') {
          const reqFields = [
            'generator',
            'model',
            'commissionedBy',
            'licenseStatus',
            'reviewStatus',
          ];
          for (const f of reqFields) {
            if (!(f in rec)) {
              errors.push(`Story cover provenance record ${rec.path} missing required field: ${f}`);
            }
          }
        }
      }
    } catch (e) {
      errors.push(`ASSET_PROVENANCE.json is invalid JSON: ${e.message}`);
    }
  }

  // Check 8: Mandatory kanji license files in public/licenses/
  const mandatoryKanjiLicenses = [
    'public/licenses/README.md',
    'public/licenses/CC0-1.0.txt',
    'public/licenses/hanzi-writer/LICENSE.txt',
    'public/licenses/hanzi-writer/NOTICE.md',
    'public/licenses/hanzi-writer-data-jp/LICENSES.md',
    'public/licenses/hanzi-writer-data-jp/COPYING.txt',
    'public/licenses/hanzi-writer-data-jp/ARPHICPL.TXT',
    'public/licenses/hanzi-writer-data-jp/LGPL.txt',
    'public/licenses/hanzi-writer-data-jp/OFL.txt',
    'public/licenses/hanzi-writer-data-jp/APL',
  ];

  for (const licFile of mandatoryKanjiLicenses) {
    if (!existsSync(join(ROOT, licFile))) {
      errors.push(`Missing mandatory public license file: ${licFile}`);
    }
  }

  // Check 9: Version check against package-lock.json
  if (existsSync(join(ROOT, 'package-lock.json'))) {
    try {
      const lockData = JSON.parse(read('package-lock.json'));
      const getLockVersion = (pkgName) => {
        const pkgKey = `node_modules/${pkgName}`;
        if (lockData.packages && lockData.packages[pkgKey]) {
          return lockData.packages[pkgKey].version;
        }
        if (lockData.dependencies && lockData.dependencies[pkgName]) {
          return lockData.dependencies[pkgName].version;
        }
        return null;
      };

      const hwVersion = getLockVersion('hanzi-writer');
      const hwJpVersion = getLockVersion('@k1low/hanzi-writer-data-jp');

      if (existsSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'))) {
        const tpNotice = read('THIRD_PARTY_NOTICES.md');
        if (hwVersion && !tpNotice.includes(hwVersion)) {
          errors.push(
            `THIRD_PARTY_NOTICES.md version does not match hanzi-writer package-lock version (${hwVersion})`
          );
        }
        if (hwJpVersion && !tpNotice.includes(hwJpVersion)) {
          errors.push(
            `THIRD_PARTY_NOTICES.md version does not match @k1low/hanzi-writer-data-jp package-lock version (${hwJpVersion})`
          );
        }
      }
    } catch (e) {
      errors.push(`Error parsing package-lock.json: ${e.message}`);
    }
  }

  // Check 10: Audio documentation claims check (no bundled MP3 claims allowed)
  if (existsSync(join(ROOT, 'docs/features/audio.md'))) {
    const audioDoc = read('docs/features/audio.md');
    if (audioDoc.includes('MP3-файлы') || audioDoc.includes('оригинальных аудиозаписей')) {
      errors.push(
        'docs/features/audio.md incorrectly claims bundled MP3 audio files or original recordings exist'
      );
    }
  }
  if (existsSync(join(ROOT, 'docs/content/vocabulary.md'))) {
    const vocabDoc = read('docs/content/vocabulary.md');
    if (vocabDoc.includes('.mp3')) {
      errors.push(
        'docs/content/vocabulary.md contains non-existent .mp3 path in vocabulary schema example'
      );
    }
  }

  // Check 11: README links to legal documents
  if (existsSync(join(ROOT, 'README.md'))) {
    const readme = read('README.md');
    const requiredReadmeLinks = [
      'LICENSE',
      'LEGAL.md',
      'CONTENT_LICENSE.md',
      'THIRD_PARTY_NOTICES.md',
      'PRIVACY.md',
      'TRADEMARKS.md',
      'docs/legal/asset-provenance.md',
    ];
    for (const link of requiredReadmeLinks) {
      if (!readme.includes(link)) {
        errors.push(`README.md is missing link to required legal document: ${link}`);
      }
    }
  }

  // Check 12: OpenRouter provider privacy & ZDR routing check in services.js
  if (existsSync(join(ROOT, 'services.js'))) {
    const srv = read('services.js');
    if (!srv.includes('PRIVATE_PROVIDER_ROUTING')) {
      errors.push('services.js missing PRIVATE_PROVIDER_ROUTING constant export');
    }
    if (!srv.includes("data_collection: 'deny'") || !srv.includes('zdr: true')) {
      errors.push(
        "services.js missing OpenRouter provider settings: data_collection: 'deny' or zdr: true"
      );
    }
    if (!srv.includes('export async function openRouterRequest')) {
      errors.push('services.js must export centralized openRouterRequest helper function');
    }
    // Verify that fetchWithTimeout to OR_URL happens strictly inside openRouterRequest function
    const fetchOrUrlMatches = srv.match(/fetchWithTimeout\s*\(\s*OR_URL/g);
    if (!fetchOrUrlMatches || fetchOrUrlMatches.length !== 1) {
      errors.push(
        `services.js must make all OpenRouter requests via openRouterRequest helper. Found ${fetchOrUrlMatches ? fetchOrUrlMatches.length : 0} direct fetch calls to OR_URL`
      );
    }
    if (!srv.includes('provider: PRIVATE_PROVIDER_ROUTING')) {
      errors.push('services.js openRouterRequest must specify provider: PRIVATE_PROVIDER_ROUTING');
    }
  }

  // Check 13: Absence of local absolute file paths in docs
  const docFilesToCheck = [
    'README.md',
    'LEGAL.md',
    'CONTENT_LICENSE.md',
    'THIRD_PARTY_NOTICES.md',
    'TRADEMARKS.md',
    'PRIVACY.md',
    'docs/legal/README.md',
    'docs/legal/licensing-model.md',
    'docs/legal/asset-provenance.md',
    'docs/legal/third-party-content.md',
    'docs/legal/unresolved-legal-questions.md',
    'docs/legal/content-provenance.md',
    'docs/legal/unresolved-content-review.md',
  ];

  for (const docFile of docFilesToCheck) {
    if (existsSync(join(ROOT, docFile))) {
      const content = read(docFile);
      if (
        content.match(/\/home\/[a-zA-Z0-9_-]+\//) ||
        content.match(/\/Users\/[a-zA-Z0-9_-]+\//) ||
        content.match(/[C-Z]:\\\\/)
      ) {
        errors.push(`File contains absolute local filesystem path: ${docFile}`);
      }
    }
  }

  // Check 14: API key export prohibition in backup-manager.js and settings UI
  if (existsSync(join(ROOT, 'src/backup-manager.js'))) {
    const bm = read('src/backup-manager.js');
    if (bm.includes('includeApiKey')) {
      errors.push(
        'src/backup-manager.js contains deprecated includeApiKey parameter allowing API key export'
      );
    }
  }
  if (existsSync(join(ROOT, 'ui/settings.js'))) {
    const st = read('ui/settings.js');
    if (st.includes('export-include-key')) {
      errors.push('ui/settings.js contains UI checkbox for including API key in backup export');
    }
  }

  // Check 15: Absence of workbookReference, pdfPages, workbookPrintedPages in production runtime JSON files
  const runtimeDataDir = join(ROOT, 'public/data');
  if (existsSync(runtimeDataDir)) {
    const scanDir = (dir) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          const content = readFileSync(full, 'utf8');
          if (
            content.includes('"workbookReference"') ||
            content.includes('"pdfPages"') ||
            content.includes('"workbookPrintedPages"')
          ) {
            const rel = full.replace(ROOT + '/', '');
            errors.push(`Runtime JSON file contains workbook reference metadata: ${rel}`);
          }
        }
      }
    };
    scanDir(runtimeDataDir);
  }

  if (errors.length > 0) {
    console.error('\n[check-legal-metadata] ❌ Legal & Metadata Compliance Errors Found:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('[check-legal-metadata] ✅ All legal metadata checks passed successfully!');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkLegalMetadata();
}

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { checkLegalMetadata } from '../scripts/check-legal-metadata.js';
import { copyLicenses } from '../scripts/copy-third-party-licenses.js';

const rootDir = process.cwd();

describe('Legal & Metadata Compliance Checks', () => {
  test('1. LICENSE file exists in root', () => {
    expect(fs.existsSync(path.join(rootDir, 'LICENSE'))).toBe(true);
  });

  test('2. THIRD_PARTY_NOTICES.md file exists in root', () => {
    expect(fs.existsSync(path.join(rootDir, 'THIRD_PARTY_NOTICES.md'))).toBe(true);
  });

  test('3 & 4. Vector Ranks specifies RhosGFX and CC0 1.0 license in public/rank/SOURCE.md', () => {
    const sourcePath = path.join(rootDir, 'public', 'rank', 'SOURCE.md');
    expect(fs.existsSync(sourcePath)).toBe(true);
    const content = fs.readFileSync(sourcePath, 'utf8');
    expect(content).toContain('RhosGFX');
    expect(content).toContain('CC0 1.0 Universal');
  });

  test('5. Every public/rank/*.webp file is covered by ASSET_PROVENANCE.json', () => {
    const provPath = path.join(rootDir, 'ASSET_PROVENANCE.json');
    expect(fs.existsSync(provPath)).toBe(true);
    const prov = JSON.parse(fs.readFileSync(provPath, 'utf8'));
    const provPaths = new Set(prov.assets.map((a) => a.path));

    const rankFiles = fs
      .readdirSync(path.join(rootDir, 'public', 'rank'))
      .filter((f) => f.endsWith('.webp'));
    for (const rf of rankFiles) {
      expect(provPaths.has(`public/rank/${rf}`)).toBe(true);
    }
  });

  test('6 & 7. Every public/image/Story*.webp file is covered by ASSET_PROVENANCE.json with unknown fields set', () => {
    const provPath = path.join(rootDir, 'ASSET_PROVENANCE.json');
    const prov = JSON.parse(fs.readFileSync(provPath, 'utf8'));
    const provMap = new Map(prov.assets.map((a) => [a.path, a]));

    const storyFiles = fs
      .readdirSync(path.join(rootDir, 'public', 'image'))
      .filter((f) => f.startsWith('Story') && f.endsWith('.webp'));
    expect(storyFiles.length).toBe(12);

    for (const sf of storyFiles) {
      const rel = `public/image/${sf}`;
      expect(provMap.has(rel)).toBe(true);
      const rec = provMap.get(rel);
      expect(rec.sourceType).toBe('ai-generated');
      expect(rec.generator).toBe('unknown');
      expect(rec.model).toBe('unknown');
      expect(rec.reviewStatus).toBe('needs-author-confirmation');
    }
  });

  test('8. Missing provenance field is detected by provenance validator structure', () => {
    const prov = JSON.parse(fs.readFileSync(path.join(rootDir, 'ASSET_PROVENANCE.json'), 'utf8'));
    const rec = prov.assets[0];
    expect(rec).toHaveProperty('assetType');
    expect(rec).toHaveProperty('changes');
    expect(rec).toHaveProperty('reviewStatus');
  });

  test('9. Mandatory kanji license files exist in public/licenses/', () => {
    const requiredLicenses = [
      'public/licenses/README.md',
      'public/licenses/CC0-1.0.txt',
      'public/licenses/hanzi-writer/LICENSE.txt',
      'public/licenses/hanzi-writer/NOTICE.md',
      'public/licenses/hanzi-writer-data-jp/LICENSES.md',
      'public/licenses/hanzi-writer-data-jp/NOTICE.md',
      'public/licenses/hanzi-writer-data-jp/ARPHICPL.TXT',
      'public/licenses/hanzi-writer-data-jp/LGPL.txt',
      'public/licenses/hanzi-writer-data-jp/OFL.txt',
      'public/licenses/hanzi-writer-data-jp/APL',
    ];
    for (const file of requiredLicenses) {
      expect(fs.existsSync(path.join(rootDir, file))).toBe(true);
    }
  });

  test('10. Version in THIRD_PARTY_NOTICES.md matches package-lock.json', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
    const hwVersion =
      lock.packages?.['node_modules/hanzi-writer']?.version ||
      lock.dependencies?.['hanzi-writer']?.version;
    const hwJpVersion =
      lock.packages?.['node_modules/@k1low/hanzi-writer-data-jp']?.version ||
      lock.dependencies?.['@k1low/hanzi-writer-data-jp']?.version;

    const notices = fs.readFileSync(path.join(rootDir, 'THIRD_PARTY_NOTICES.md'), 'utf8');
    expect(notices).toContain(hwVersion);
    expect(notices).toContain(hwJpVersion);
  });

  test('11 & 12. copy-third-party-licenses is idempotent and preserves exact text content', () => {
    copyLicenses();
    const licPath = path.join(
      rootDir,
      'public',
      'licenses',
      'hanzi-writer-data-jp',
      'ARPHICPL.TXT'
    );
    const content1 = fs.readFileSync(licPath, 'utf8');

    // Run again
    copyLicenses();
    const content2 = fs.readFileSync(licPath, 'utf8');
    expect(content1).toBe(content2);
    expect(content1.toUpperCase()).toContain('ARPHIC PUBLIC LICENSE');
  });

  test('13. Audio documentation does not claim bundled MP3 files exist', () => {
    const audioDoc = fs.readFileSync(path.join(rootDir, 'docs', 'features', 'audio.md'), 'utf8');
    expect(audioDoc).not.toContain('Предзагруженные MP3-файлы');
    expect(audioDoc).not.toContain('оригинальных аудиозаписей');
    expect(audioDoc).toContain('Web Speech API');

    const vocabDoc = fs.readFileSync(
      path.join(rootDir, 'docs', 'content', 'vocabulary.md'),
      'utf8'
    );
    expect(vocabDoc).not.toContain('.mp3');
  });

  test('14. README.md contains links to primary legal documents', () => {
    const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
    expect(readme).toContain('LICENSE');
    expect(readme).toContain('LEGAL.md');
    expect(readme).toContain('CONTENT_LICENSE.md');
    expect(readme).toContain('THIRD_PARTY_NOTICES.md');
    expect(readme).toContain('PRIVACY.md');
    expect(readme).toContain('docs/legal/asset-provenance.md');
  });

  test('15. checkLegalMetadata script executes successfully without network access', () => {
    expect(() => checkLegalMetadata()).not.toThrow();
  });
});

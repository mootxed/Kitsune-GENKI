/* scripts/check-sourcemap-policy.js — Verified build sourcemaps policy auditor */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function runCheck() {
  console.log('🔍 Auditing Deployment Sourcemaps Policy (Option B: Hidden Sourcemaps)...\n');

  if (!fs.existsSync(distDir)) {
    console.error('❌ Error: dist/ directory does not exist. Run "npm run build" first.');
    process.exit(1);
  }

  const allFiles = getAllFiles(distDir);
  let hasErrors = false;

  // 1. Check for any .map files in dist
  const mapFiles = allFiles.filter((f) => f.endsWith('.map'));
  if (mapFiles.length > 0) {
    console.error(
      `❌ Sourcemap Violation: Found ${mapFiles.length} .map file(s) in public deployment dist/ directory:`
    );
    mapFiles.forEach((f) => console.error(`   • ${path.relative(rootDir, f)}`));
    hasErrors = true;
  } else {
    console.log('✅ No .map files found in public dist/ build artifacts.');
  }

  // 2. Check for public sourceMappingURL comments in JS/CSS/HTML files
  const textFiles = allFiles.filter((f) => /\.(js|css|html)$/.test(f));
  let sourceMappingUrlCount = 0;

  textFiles.forEach((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('sourceMappingURL=')) {
      console.error(
        `❌ Sourcemap Violation: File contains public "sourceMappingURL=": ${path.relative(rootDir, filePath)}`
      );
      sourceMappingUrlCount++;
      hasErrors = true;
    }
  });

  if (sourceMappingUrlCount === 0) {
    console.log('✅ No public sourceMappingURL references found in HTML/JS/CSS assets.');
  }

  console.log('\n----------------------------------------');
  if (hasErrors) {
    console.error('❌ Production Sourcemaps Policy Audit FAILED!');
    process.exit(1);
  } else {
    console.log('✅ Production Sourcemaps Policy Audit PASSED successfully!');
  }
}

runCheck();

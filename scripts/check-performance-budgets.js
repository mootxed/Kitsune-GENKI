/* scripts/check-performance-budgets.js — Automated build-time performance budget validator */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const budgetsPath = path.resolve(rootDir, 'performance-budgets.json');

function getGzipSize(buffer) {
  return zlib.gzipSync(buffer).length;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB (${bytes} bytes)`;
}

function runCheck() {
  console.log('🔍 Starting Performance Budget Validation...\n');

  if (!fs.existsSync(distDir)) {
    console.error('❌ Error: dist/ directory does not exist. Run "npm run build" first.');
    process.exit(1);
  }

  if (!fs.existsSync(budgetsPath)) {
    console.error('❌ Error: performance-budgets.json file not found.');
    process.exit(1);
  }

  const budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));
  let hasErrors = false;

  // 1. Validate Initial HTML Size
  const htmlPath = path.resolve(distDir, 'index.html');
  if (fs.existsSync(htmlPath)) {
    const htmlBuf = fs.readFileSync(htmlPath);
    const htmlRaw = htmlBuf.length;
    const htmlGzip = getGzipSize(htmlBuf);

    console.log(`📄 Initial HTML: ${formatBytes(htmlRaw)} [gzip: ${formatBytes(htmlGzip)}]`);
    if (budgets.initialHtml) {
      if (budgets.initialHtml.rawBytes && htmlRaw > budgets.initialHtml.rawBytes) {
        console.error(
          `   ❌ HTML raw size budget exceeded! Budget: ${formatBytes(budgets.initialHtml.rawBytes)}, Actual: ${formatBytes(htmlRaw)}`
        );
        hasErrors = true;
      }
      if (budgets.initialHtml.gzipBytes && htmlGzip > budgets.initialHtml.gzipBytes) {
        console.error(
          `   ❌ HTML gzip size budget exceeded! Budget: ${formatBytes(budgets.initialHtml.gzipBytes)}, Actual: ${formatBytes(htmlGzip)}`
        );
        hasErrors = true;
      }
    }
  }

  // 2. Validate Initial CSS Size
  const assetsDir = path.resolve(distDir, 'assets');
  let cssFiles = [];
  if (fs.existsSync(assetsDir)) {
    cssFiles = fs
      .readdirSync(assetsDir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => path.resolve(assetsDir, f));
  }

  let totalCssRaw = 0;
  let totalCssGzip = 0;
  cssFiles.forEach((file) => {
    const buf = fs.readFileSync(file);
    totalCssRaw += buf.length;
    totalCssGzip += getGzipSize(buf);
  });

  console.log(`🎨 Initial CSS: ${formatBytes(totalCssRaw)} [gzip: ${formatBytes(totalCssGzip)}]`);
  if (budgets.initialCss) {
    if (budgets.initialCss.gzipBytes && totalCssGzip > budgets.initialCss.gzipBytes) {
      console.error(
        `   ❌ CSS gzip budget exceeded! Budget: ${formatBytes(budgets.initialCss.gzipBytes)}, Actual: ${formatBytes(totalCssGzip)}`
      );
      hasErrors = true;
    }
  }

  // 3. Validate Initial JavaScript Precached Graph
  const swPath = path.resolve(distDir, 'sw.js');
  let precachedAssetPaths = [];
  if (fs.existsSync(swPath)) {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const match = swContent.match(
      /\/\* __STATIC_ASSETS_BEGIN__ \*\/([\s\S]*?)\/\* __STATIC_ASSETS_END__ \*\//
    );
    if (match && match[1]) {
      precachedAssetPaths = match[1]
        .split('\n')
        .map((line) => line.trim().replace(/^'|',?$/g, ''))
        .filter((line) => line.endsWith('.js'));
    }
  }

  let initialJsRaw = 0;
  let initialJsGzip = 0;
  const initialJsDetails = [];

  precachedAssetPaths.forEach((relPath) => {
    const fullPath = path.resolve(distDir, relPath);
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      const raw = buf.length;
      const gzip = getGzipSize(buf);
      initialJsRaw += raw;
      initialJsGzip += gzip;
      initialJsDetails.push({ name: path.basename(relPath), raw, gzip });
    }
  });

  console.log(
    `⚡ Initial JavaScript (Precached Graph): ${formatBytes(initialJsRaw)} [gzip: ${formatBytes(initialJsGzip)}]`
  );
  initialJsDetails.forEach((item) => {
    console.log(`   • ${item.name}: ${formatBytes(item.raw)} (gzip ${formatBytes(item.gzip)})`);
  });

  if (budgets.initialJavaScript) {
    if (budgets.initialJavaScript.rawBytes && initialJsRaw > budgets.initialJavaScript.rawBytes) {
      console.error(
        `   ❌ Initial JS raw budget exceeded! Budget: ${formatBytes(budgets.initialJavaScript.rawBytes)}, Actual: ${formatBytes(initialJsRaw)}`
      );
      hasErrors = true;
    }
    if (
      budgets.initialJavaScript.gzipBytes &&
      initialJsGzip > budgets.initialJavaScript.gzipBytes
    ) {
      console.error(
        `   ❌ Initial JS gzip budget exceeded! Budget: ${formatBytes(budgets.initialJavaScript.gzipBytes)}, Actual: ${formatBytes(initialJsGzip)}`
      );
      hasErrors = true;
    }
  }

  // 4. Validate Exclusion of Forbidden Modules from Initial Precache
  console.log(`\n🚫 Checking Lazy Module Chunk Splitting & Precache Isolation...`);
  const allAssetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];

  const requiredLazyChunks = [
    'vendor-hanziwriter',
    'shop',
    'dev-tools',
    'ai-story',
    'stories',
    'plan',
    'word-details',
    'user-dictionaries',
    'statistics',
    'chat',
    'crossword',
    'word-search',
  ];

  requiredLazyChunks.forEach((chunkPrefix) => {
    const foundChunk = allAssetFiles.find(
      (f) => f.startsWith(`${chunkPrefix}-`) && f.endsWith('.js')
    );
    if (!foundChunk) {
      console.error(
        `   ❌ Lazy chunk for "${chunkPrefix}" was NOT created as a separate bundle file!`
      );
      hasErrors = true;
    } else {
      const isPrecached = precachedAssetPaths.some((p) => p.includes(foundChunk));
      if (isPrecached) {
        console.error(
          `   ❌ Lazy chunk "${foundChunk}" is improperly included in Service Worker initial precache!`
        );
        hasErrors = true;
      } else {
        console.log(`   ✅ "${chunkPrefix}" cleanly isolated into dynamic chunk: ${foundChunk}`);
      }
    }
  });

  console.log('\n----------------------------------------');
  if (hasErrors) {
    console.error('❌ Performance Budget Validation FAILED!');
    process.exit(1);
  } else {
    console.log('✅ All Performance Budget checks PASSED successfully!');
  }
}

runCheck();

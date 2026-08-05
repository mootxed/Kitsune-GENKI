import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Directories and files to scan for production security audit
const TARGET_PATHS = [
  'src',
  'ui',
  'app.js',
  'router.js',
  'services.js',
  'session-manager.js',
  'srs.js',
  'quests.js',
  'achievements.js',
  'studyplan.js',
  'index.html',
  'bootstrap',
];

/**
 * Verified exact static code exceptions (must match specific line pattern & file).
 * File-level allowlisting is prohibited.
 */
const EXPLICIT_EXCEPTIONS = [
  {
    file: 'src/kanji-loader.js',
    linePattern: "new Function('mod', 'return import(mod)')",
    reason:
      'Dynamic import fallback required for Vitest / Node.js testing environment without HTTP server.',
  },
];

const DANGEROUS_PATTERNS = [
  { name: 'innerHTML', regex: /\.innerHTML\s*=/u },
  { name: 'outerHTML', regex: /\.outerHTML\s*=/u },
  { name: 'insertAdjacentHTML', regex: /\.insertAdjacentHTML\s*\(/u },
  { name: 'document.write', regex: /document\.write\s*\(/u },
  { name: 'DOMParser', regex: /new\s+DOMParser\s*\(/u },
  { name: 'createContextualFragment', regex: /createContextualFragment\s*\(/u },
  { name: 'eval', regex: /\beval\s*\(/u },
  { name: 'new Function', regex: /new\s+Function\s*\(/u },
  { name: 'script-creation', regex: /document\.createElement\(['"]script['"]\)/i },
];

/**
 * Recursively collects files from target paths.
 */
function collectFiles(targetPath) {
  const absolutePath = path.resolve(ROOT_DIR, targetPath);
  if (!fs.existsSync(absolutePath)) return [];

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [absolutePath];

  let files = [];
  const entries = fs.readdirSync(absolutePath);
  for (const entry of entries) {
    const fullPath = path.join(absolutePath, entry);
    const entryStat = fs.statSync(fullPath);
    if (entryStat.isDirectory()) {
      files = files.concat(collectFiles(fullPath));
    } else if (entryStat.isFile() && (fullPath.endsWith('.js') || fullPath.endsWith('.html'))) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Checks if a specific line is registered in EXPLICIT_EXCEPTIONS.
 */
function findExplicitException(relativePath, lineText) {
  return EXPLICIT_EXCEPTIONS.find((item) => {
    if (item.file !== relativePath) return false;
    if (typeof item.linePattern === 'string') {
      return lineText.includes(item.linePattern);
    }
    if (item.linePattern instanceof RegExp) {
      return item.linePattern.test(lineText);
    }
    return false;
  });
}

/**
 * Determines if an innerHTML assignment is dynamic (contains template string interpolation ${...}
 * or non-static string concatenation).
 */
function isDynamicInnerHTML(lineText) {
  // Check for template literal interpolation ${...}
  if (/\$\{.*?\}/u.test(lineText)) {
    return true;
  }
  // Check for dangerous dynamic function calls or variables appended with +
  if (/\.innerHTML\s*=.*?\+\s*[a-zA-Z_$]/u.test(lineText)) {
    return true;
  }
  return false;
}

function checkSecurity() {
  console.log('🔒 Executing Strict KotoKitsu DOM Security Audit...\n');

  let allFiles = [];
  for (const targetPath of TARGET_PATHS) {
    allFiles = allFiles.concat(collectFiles(targetPath));
  }

  const violations = [];
  let totalInspected = 0;
  let clearedMatches = 0;
  let exceptionMatches = 0;

  for (const filePath of allFiles) {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const lineText = line.trim();

      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.regex.test(line)) {
          totalInspected++;

          // 1. Check for explicit exact exceptions first
          const explicit = findExplicitException(relativePath, lineText);
          if (explicit) {
            exceptionMatches++;
            continue;
          }

          // 2. Disallow eval, new Function, document.write, outerHTML, insertAdjacentHTML unless explicitly exception-listed
          if (
            pattern.name === 'eval' ||
            pattern.name === 'new Function' ||
            pattern.name === 'document.write' ||
            pattern.name === 'outerHTML' ||
            pattern.name === 'insertAdjacentHTML' ||
            pattern.name === 'script-creation' ||
            pattern.name === 'createContextualFragment'
          ) {
            violations.push({
              file: relativePath,
              line: lineNumber,
              api: pattern.name,
              code: lineText,
              reason: `Forbidden DOM/eval sink [${pattern.name}]. Requires explicit verification.`,
            });
            continue;
          }

          // 3. For innerHTML: check if dynamic string interpolation is present
          if (pattern.name === 'innerHTML') {
            if (isDynamicInnerHTML(lineText)) {
              violations.push({
                file: relativePath,
                line: lineNumber,
                api: 'innerHTML (dynamic interpolation)',
                code: lineText,
                reason:
                  'Dynamic innerHTML interpolation is disallowed. Use document.createElement, textContent, dataset, replaceChildren, or append.',
              });
            } else {
              clearedMatches++;
            }
          }
        }
      }
    });
  }

  console.log(`Scan summary: ${totalInspected} security-sensitive DOM API call(s) inspected.`);
  console.log(`Static / cleared usages: ${clearedMatches}`);
  console.log(`Explicit verified exceptions: ${exceptionMatches}`);

  if (violations.length > 0) {
    console.error('\n❌ SECURITY AUDIT VIOLATIONS DETECTED!');
    console.error('The following unallowed or dynamic DOM sinks were found:\n');
    violations.forEach((v) => {
      console.error(`  - ${v.file}:${v.line} [${v.api}]`);
      console.error(`    Reason: ${v.reason}`);
      console.error(`    Code: ${v.code}\n`);
    });
    process.exit(1);
  }

  console.log('✅ All DOM API usages are verified and compliant with strict security audit rules.');
}

checkSecurity();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

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
 * File-level, directory-level, and loose line-pattern allowlisting are strictly prohibited.
 */
export const EXPLICIT_EXCEPTIONS = [
  {
    file: 'src/security-helpers.js',
    linePattern: 'element.innerHTML = sanitizeHTML(markup);',
    reason: 'Centralized DOMPurify safe HTML sanitizer helper.',
  },
  {
    file: 'src/kanji-loader.js',
    linePattern: "new Function('mod', 'return import(mod)')",
    reason:
      'Dynamic import fallback required for Vitest / Node.js testing environment without HTTP server.',
  },
];

/**
 * Validates exception list against strict security budget rules.
 */
export function validateExceptionBudget(exceptions = EXPLICIT_EXCEPTIONS) {
  const errors = [];
  let innerHTMLExceptionCount = 0;

  for (const exc of exceptions) {
    if (exc.file instanceof RegExp || typeof exc.file !== 'string') {
      errors.push(`Directory or regex file pattern exception is forbidden: ${exc.file}`);
      continue;
    }

    if (exc.file.includes('*') || exc.file.includes('..')) {
      errors.push(`Wildcard or path traversal file pattern exception is forbidden: ${exc.file}`);
    }

    if (!exc.linePattern) {
      errors.push(`File-level exception without linePattern is forbidden: ${exc.file}`);
    } else {
      const patternStr =
        typeof exc.linePattern === 'string' ? exc.linePattern : exc.linePattern.source;
      const dangerousPatterns = [
        /^\.innerHTML\s*=\s*$/u,
        /^body\.innerHTML\s*=\s*$/u,
        /^container\.innerHTML\s*=\s*$/u,
        /^overlay\.innerHTML\s*=\s*$/u,
        /^element\.innerHTML\s*=\s*$/u,
        /^t\.innerHTML\s*=\s*$/u,
        /^grid\.innerHTML\s*=\s*$/u,
        /\.innerHTML\s*=\s*$/u,
      ];
      for (const dangerous of dangerousPatterns) {
        if (dangerous.test(patternStr.trim())) {
          errors.push(
            `Generic left-side linePattern exception without right-side specification is forbidden in ${exc.file}: "${patternStr}"`
          );
        }
      }
    }

    const isInnerHTML =
      (typeof exc.linePattern === 'string' && exc.linePattern.includes('innerHTML')) ||
      (exc.linePattern instanceof RegExp && exc.linePattern.test('innerHTML'));
    if (isInnerHTML) {
      innerHTMLExceptionCount++;
    }
  }

  if (innerHTMLExceptionCount > 1) {
    errors.push(
      `innerHTML exception budget exceeded: found ${innerHTMLExceptionCount}, maximum allowed is 1.`
    );
  }

  return { valid: errors.length === 0, errors, innerHTMLExceptionCount };
}

const DANGEROUS_PATTERNS = [
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
    if (typeof item.file === 'string' && item.file !== relativePath) return false;
    if (item.file instanceof RegExp && !item.file.test(relativePath)) return false;

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
 * Walks AST nodes recursively.
 */
function walkAST(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          walkAST(item, callback);
        }
      }
    } else if (child && typeof child.type === 'string') {
      walkAST(child, callback);
    }
  }
}

/**
 * Analyzes JS code string via AST for innerHTML assignments and forbidden DOM sinks.
 */
export function auditCode(content, relativePath = 'test.js') {
  const violations = [];
  const lines = content.split('\n');

  let ast;
  try {
    ast = espree.parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      loc: true,
      range: true,
    });
  } catch (parseErr) {
    // If AST parsing fails (e.g. HTML file), fallback to line inspection
    return auditLinesFallback(content, relativePath);
  }

  let totalInspected = 0;
  let clearedMatches = 0;
  let exceptionMatches = 0;

  walkAST(ast, (node) => {
    // Check AssignmentExpression targeting innerHTML or outerHTML
    if (node.type === 'AssignmentExpression') {
      const left = node.left;
      if (
        left.type === 'MemberExpression' &&
        ((left.property.type === 'Identifier' && left.property.name === 'innerHTML') ||
          (left.property.type === 'Literal' && left.property.value === 'innerHTML'))
      ) {
        totalInspected++;
        const line = node.loc ? node.loc.start.line : 1;
        const lineText = lines[line - 1] ? lines[line - 1].trim() : '';

        const explicit = findExplicitException(relativePath, lineText);
        if (explicit) {
          exceptionMatches++;
          return;
        }

        const right = node.right;
        let isAllowed = false;

        if (right.type === 'Literal' && typeof right.value === 'string') {
          isAllowed = true;
        } else if (right.type === 'TemplateLiteral' && right.expressions.length === 0) {
          isAllowed = true;
        }

        if (isAllowed) {
          clearedMatches++;
        } else {
          violations.push({
            file: relativePath,
            line,
            api: 'innerHTML (dynamic sink)',
            code: lineText,
            reason:
              'Dynamic assignment to innerHTML is forbidden. Allowed: direct string literal, direct template literal without interpolation ${...}, or explicit documented exception.',
          });
        }
      }
    }
  });

  // Check line-based patterns for other forbidden sinks (eval, new Function, document.write, etc.)
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const lineText = line.trim();

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.regex.test(line)) {
        totalInspected++;
        const explicit = findExplicitException(relativePath, lineText);
        if (explicit) {
          exceptionMatches++;
          continue;
        }
        violations.push({
          file: relativePath,
          line: lineNumber,
          api: pattern.name,
          code: lineText,
          reason: `Forbidden DOM/eval sink [${pattern.name}]. Requires explicit verification.`,
        });
      }
    }
  });

  return { violations, totalInspected, clearedMatches, exceptionMatches };
}

function auditLinesFallback(content, relativePath) {
  const violations = [];
  const lines = content.split('\n');
  let totalInspected = 0;
  let clearedMatches = 0;
  let exceptionMatches = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const lineText = line.trim();

    if (/\.innerHTML\s*=/u.test(line)) {
      totalInspected++;
      const explicit = findExplicitException(relativePath, lineText);
      if (explicit) {
        exceptionMatches++;
        return;
      }
      // Check if it's direct static literal assignment
      const isStaticLiteral =
        /\.innerHTML\s*=\s*'[^']*';?$/u.test(lineText) ||
        /\.innerHTML\s*=\s*"[^"]*";?$/u.test(lineText) ||
        /\.innerHTML\s*=\s*`[^`$]*`;?$/u.test(lineText);

      if (isStaticLiteral) {
        clearedMatches++;
      } else {
        violations.push({
          file: relativePath,
          line: lineNumber,
          api: 'innerHTML (dynamic interpolation)',
          code: lineText,
          reason: 'Dynamic innerHTML assignment disallowed.',
        });
      }
    }

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.regex.test(line)) {
        totalInspected++;
        const explicit = findExplicitException(relativePath, lineText);
        if (explicit) {
          exceptionMatches++;
          continue;
        }
        violations.push({
          file: relativePath,
          line: lineNumber,
          api: pattern.name,
          code: lineText,
          reason: `Forbidden DOM/eval sink [${pattern.name}].`,
        });
      }
    }
  });

  return { violations, totalInspected, clearedMatches, exceptionMatches };
}

export function checkSecurity() {
  console.log('🔒 Executing Strict KotoKitsu DOM Security Audit (AST-based)...\n');

  const budgetResult = validateExceptionBudget();
  if (!budgetResult.valid) {
    console.error('\n❌ SECURITY AUDIT EXCEPTION BUDGET VIOLATIONS DETECTED!');
    budgetResult.errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  let allFiles = [];
  for (const targetPath of TARGET_PATHS) {
    allFiles = allFiles.concat(collectFiles(targetPath));
  }

  const allViolations = [];
  let grandInspected = 0;
  let grandCleared = 0;
  let grandExceptions = 0;

  for (const filePath of allFiles) {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    const { violations, totalInspected, clearedMatches, exceptionMatches } = auditCode(
      content,
      relativePath
    );

    allViolations.push(...violations);
    grandInspected += totalInspected;
    grandCleared += clearedMatches;
    grandExceptions += exceptionMatches;
  }

  console.log(`Scan summary: ${grandInspected} security-sensitive DOM API call(s) inspected.`);
  console.log(`Static / cleared usages: ${grandCleared}`);
  console.log(`Explicit verified exceptions: ${grandExceptions}`);

  if (allViolations.length > 0) {
    console.error('\n❌ SECURITY AUDIT VIOLATIONS DETECTED!');
    console.error('The following unallowed or dynamic DOM sinks were found:\n');
    allViolations.forEach((v) => {
      console.error(`  - ${v.file}:${v.line} [${v.api}]`);
      console.error(`    Reason: ${v.reason}`);
      console.error(`    Code: ${v.code}\n`);
    });
    process.exit(1);
  }

  console.log('✅ All DOM API usages are verified and compliant with strict security audit rules.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkSecurity();
}

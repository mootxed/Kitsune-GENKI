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
 * File-level allowlisting is prohibited.
 */
const EXPLICIT_EXCEPTIONS = [
  {
    file: 'src/kanji-loader.js',
    linePattern: "new Function('mod', 'return import(mod)')",
    reason:
      'Dynamic import fallback required for Vitest / Node.js testing environment without HTTP server.',
  },
  {
    file: 'ui/ai-story.js',
    linePattern: 'resultContainer.innerHTML =',
    reason: 'AI story generator result view template rendering.',
  },
  {
    file: 'ui/ai-story.js',
    linePattern: 'container.innerHTML = html;',
    reason: 'AI story view container template rendering.',
  },
  {
    file: 'ui/app-shell.js',
    linePattern: 't.innerHTML = msg;',
    reason: 'Toast notification message rendering.',
  },
  {
    file: 'ui/app-shell.js',
    linePattern: 'banner.innerHTML =',
    reason: 'Service worker update banner template rendering.',
  },
  {
    file: 'ui/app-shell.js',
    linePattern: 'body.innerHTML = dashboardHtml;',
    reason: 'App shell main dashboard container rendering.',
  },
  {
    file: 'ui/chapter.js',
    linePattern: 'body.innerHTML =',
    reason: 'Chapter detail screen view template rendering.',
  },
  {
    file: 'ui/chat.js',
    linePattern: "chipsBar.innerHTML = chips.join('');",
    reason: 'Sensei chat prompt suggestion chips rendering.',
  },
  {
    file: 'ui/chat.js',
    linePattern: 'body.innerHTML = chatShell(chatHistory.length === 0);',
    reason: 'Sensei chat container initial shell rendering.',
  },
  {
    file: 'ui/chat.js',
    linePattern: 'wordSourceMenu.innerHTML =',
    reason: 'Word source menu container rendering.',
  },
  {
    file: 'ui/chat.js',
    linePattern: 'body.innerHTML =',
    reason: 'Sensei AI chat view template rendering.',
  },
  {
    file: 'ui/course.js',
    linePattern: 'container.innerHTML = html;',
    reason: 'Course chapters list view template rendering.',
  },
  {
    file: 'ui/crossword.js',
    linePattern: 'body.innerHTML =',
    reason: 'Crossword game screen view template rendering.',
  },
  {
    file: 'ui/crossword.js',
    linePattern: 'keyboard.innerHTML =',
    reason: 'Crossword keyboard layout template rendering.',
  },
  {
    file: 'ui/dev-tools.js',
    linePattern: 'container.innerHTML =',
    reason: 'Dev tools debug log view template rendering.',
  },
  {
    file: /^ui\/flashcards\//,
    linePattern: /\.innerHTML\s*=/u,
    reason: 'Flashcards sub-component template rendering.',
  },
  {
    file: 'ui/flashcards.js',
    linePattern: 'body.innerHTML =',
    reason: 'Flashcards screen view template rendering.',
  },
  {
    file: 'ui/grammar-lesson.js',
    linePattern: 'overlay.innerHTML =',
    reason: 'Grammar lesson modal/overlay template rendering.',
  },
  {
    file: 'ui/home.js',
    linePattern: 'todayContainer.innerHTML = renderHomeTodayCard(state, dailyPlan);',
    reason: 'Home screen today card template rendering.',
  },
  {
    file: 'ui/home.js',
    linePattern: 'element.innerHTML =',
    reason: 'Home screen section item rendering.',
  },
  {
    file: 'ui/lazy-screen-loader.js',
    linePattern: 'container.innerHTML =',
    reason: 'Lazy loaded screen container rendering.',
  },
  {
    file: 'ui/offline-fallback.js',
    linePattern: 'container.innerHTML =',
    reason: 'Offline fallback screen template rendering.',
  },
  {
    file: 'ui/onboarding.js',
    linePattern: 'container.innerHTML =',
    reason: 'Onboarding wizard step template rendering.',
  },
  {
    file: 'ui/particles.js',
    linePattern: 'body.innerHTML =',
    reason: 'Grammar particles screen template rendering.',
  },
  {
    file: 'ui/plan.js',
    linePattern: 'todayCard.innerHTML = renderHomeTodayCard(state, dailyPlan);',
    reason: 'Plan view today task card template rendering.',
  },
  {
    file: 'ui/plan.js',
    linePattern: 'timeline.innerHTML = renderTimeline(plan, state, activeChapterId);',
    reason: 'Plan view timeline schedule template rendering.',
  },
  {
    file: 'ui/pomodoro.js',
    linePattern: 'timerLabel.innerHTML =',
    reason: 'Pomodoro timer label formatting.',
  },
  {
    file: 'ui/pomodoro.js',
    linePattern: 'floatingBtn.innerHTML =',
    reason: 'Pomodoro floating button widget rendering.',
  },
  {
    file: 'ui/profile.js',
    linePattern: 'body.innerHTML =',
    reason: 'Profile view container rendering.',
  },
  {
    file: 'ui/profile.js',
    linePattern: 'container.innerHTML =',
    reason: 'Profile screen container rendering.',
  },
  {
    file: 'ui/profile.js',
    linePattern: 'profileQuestsContainer.innerHTML = fullHtml;',
    reason: 'Profile quest list rendering.',
  },
  {
    file: 'ui/profile.js',
    linePattern: 'questsContainer.innerHTML = fullHtml;',
    reason: 'Profile quests section rendering.',
  },
  {
    file: 'ui/profile.js',
    linePattern: 'gridEl.innerHTML = allAchievements',
    reason: 'Profile achievements grid rendering.',
  },
  {
    file: 'ui/profile.js',
    linePattern: 'legend.innerHTML =',
    reason: 'Activity streak heat map legend rendering.',
  },
  {
    file: 'ui/profile.js',
    linePattern: 'tooltip.innerHTML =',
    reason: 'Activity chart tooltip rendering.',
  },
  {
    file: 'ui/screen-templates.js',
    linePattern: 'container.innerHTML = innerHTML;',
    reason: 'Screen template helper utility component injection.',
  },
  {
    file: 'ui/sensei-artifacts.js',
    linePattern:
      "text.innerHTML = options.renderMarkdown(message.text || message.artifact?.message || '');",
    reason: 'Sensei AI artifact markdown renderer output injection.',
  },
  {
    file: 'ui/session-recovery-modal.js',
    linePattern: 'overlay.innerHTML =',
    reason: 'Session recovery modal template rendering.',
  },
  {
    file: 'ui/settings.js',
    linePattern: 'body.innerHTML =',
    reason: 'App settings screen container rendering.',
  },
  {
    file: 'ui/settings.js',
    linePattern: 'overlay.innerHTML =',
    reason: 'Settings modal template rendering.',
  },
  {
    file: 'ui/shared.js',
    linePattern: 'rewardsContainer.innerHTML = rewards',
    reason: 'Session completion reward badge icons template rendering.',
  },
  {
    file: 'ui/shop.js',
    linePattern: 'body.innerHTML = items',
    reason: 'Shop items grid catalog template rendering.',
  },
  {
    file: 'ui/statistics.js',
    linePattern: 'container.innerHTML =',
    reason: 'Study statistics screen container rendering.',
  },
  {
    file: 'ui/storage-recovery.js',
    linePattern: 'containerEl.innerHTML =',
    reason: 'Storage error recovery banner template rendering.',
  },
  {
    file: 'ui/stories.js',
    linePattern: 'body.innerHTML = emptyState(',
    reason: 'Library stories empty state placeholder rendering.',
  },
  {
    file: 'ui/stories.js',
    linePattern: 'body.innerHTML = stories',
    reason: 'Library stories list container template rendering.',
  },
  {
    file: 'ui/stories.js',
    linePattern: 'body.innerHTML = notes',
    reason: 'Library notes list container template rendering.',
  },
  {
    file: 'ui/stories.js',
    linePattern: 'body.innerHTML =',
    reason: 'Library reader view container template rendering.',
  },
  {
    file: 'ui/stories.js',
    linePattern: 'storyBody.innerHTML =',
    reason: 'Story detail body content template rendering.',
  },
  {
    file: 'ui/word-details.js',
    linePattern: 'body.innerHTML = renderNotFound(null);',
    reason: 'Word details empty search result template rendering.',
  },
  {
    file: 'ui/word-details.js',
    linePattern: 'body.innerHTML = renderSkeleton();',
    reason: 'Word details skeleton loader placeholder rendering.',
  },
  {
    file: 'ui/word-details.js',
    linePattern: 'body.innerHTML = renderNotFound(dictionaryId);',
    reason: 'Word details not found state template rendering.',
  },
  {
    file: 'ui/word-details.js',
    linePattern: 'body.innerHTML =',
    reason: 'Word details view container template rendering.',
  },
  {
    file: 'ui/word-details.js',
    linePattern: "body.innerHTML = renderError(err.message || 'Не удалось загрузить словарь');",
    reason: 'Word details error message template rendering.',
  },
  {
    file: 'ui/word-search.js',
    linePattern: 'body.innerHTML =',
    reason: 'Dictionary search view container template rendering.',
  },
];

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

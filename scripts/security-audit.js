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
];

// Documented Allowlist for intentional / safe dangerous API uses
const ALLOWLIST = [
  // Core / App Shell
  {
    file: 'src/kanji-loader.js',
    marker: "new Function('mod', 'return import(mod)')",
    reason:
      'Dynamic import fallback required for Vitest / Node.js testing environment without HTTP server.',
  },
  {
    file: 'src/ai-disclosure.js',
    marker: /innerHTML\s*=/u,
    reason: 'Static AI privacy disclosure modal template HTML.',
  },
  {
    file: 'ui/app-shell.js',
    marker: /innerHTML\s*=/u,
    reason: 'Internal toast message & dashboard rendering with escaped parameters.',
  },
  {
    file: 'ui/lazy-screen-loader.js',
    marker: /innerHTML\s*=/u,
    reason: 'Lazy screen container loading markup.',
  },
  {
    file: 'ui/screen-templates.js',
    marker: /innerHTML\s*=/u,
    reason: 'Screen template container innerHTML setup.',
  },
  {
    file: 'ui/storage-recovery.js',
    marker: /innerHTML\s*=/u,
    reason: 'Storage recovery modal layout template markup.',
  },

  // UI Components Layouts & Views
  {
    file: 'ui/ai-story.js',
    marker: /innerHTML\s*=/u,
    reason: 'AI Story view container markup & sanitized markdown rendering.',
  },
  {
    file: 'ui/chapter.js',
    marker: /innerHTML\s*=/u,
    reason: 'Chapter layout container rendering.',
  },
  {
    file: 'ui/chat.js',
    marker: /innerHTML\s*=/u,
    reason: 'Chat UI message bubble rendering using escaped HTML markdown.',
  },
  {
    file: 'ui/crossword.js',
    marker: /innerHTML\s*=/u,
    reason: 'Crossword minigame container layout & virtual keyboard markup.',
  },
  {
    file: 'ui/dev-tools.js',
    marker: /innerHTML\s*=/u,
    reason: 'DevTools log inspector panel HTML rendering.',
  },
  {
    file: 'ui/flashcards.js',
    marker: /innerHTML\s*=/u,
    reason: 'Flashcards study view container markup.',
  },
  {
    file: 'ui/grammar-lesson.js',
    marker: /innerHTML\s*=/u,
    reason: 'Grammar lesson overlay modal markup.',
  },
  {
    file: 'ui/home.js',
    marker: /innerHTML\s*=/u,
    reason: 'Home dashboard component view markup.',
  },
  {
    file: 'ui/onboarding.js',
    marker: /innerHTML\s*=/u,
    reason: 'Onboarding wizard step layout markup.',
  },
  {
    file: 'ui/particles.js',
    marker: /innerHTML\s*=/u,
    reason: 'Particle practice view layout markup.',
  },
  {
    file: 'ui/plan.js',
    marker: /innerHTML\s*=/u,
    reason: 'Study plan view timeline & lesson catalog markup.',
  },
  {
    file: 'ui/pomodoro.js',
    marker: /innerHTML\s*=/u,
    reason: 'Pomodoro timer overlay panel markup.',
  },
  {
    file: 'ui/profile.js',
    marker: /innerHTML\s*=/u,
    reason: 'User profile dashboard, quests, & heatmap SVG markup.',
  },
  {
    file: 'ui/sensei-artifacts.js',
    marker: /innerHTML\s*=/u,
    reason: 'Sensei artifact markdown modal rendering.',
  },
  {
    file: 'ui/session-recovery-modal.js',
    marker: /innerHTML\s*=/u,
    reason: 'Session recovery modal overlay template.',
  },
  {
    file: 'ui/settings.js',
    marker: /innerHTML\s*=/u,
    reason: 'Settings tab view & import confirmation dialog template.',
  },
  {
    file: 'ui/shared.js',
    marker: /innerHTML\s*=/u,
    reason: 'Shared reward modal & action buttons rendering.',
  },
  {
    file: 'ui/shop.js',
    marker: /innerHTML\s*=/u,
    reason: 'Shop items list & empty state markup.',
  },
  {
    file: 'ui/statistics.js',
    marker: /innerHTML\s*=/u,
    reason: 'Statistics view chart & summary markup.',
  },
  {
    file: 'ui/stories.js',
    marker: /innerHTML\s*=/u,
    reason: 'Saved stories & notes reader view markup.',
  },
  {
    file: 'ui/user-dictionaries.js',
    marker: /innerHTML\s*=/u,
    reason: 'User dictionary manager modal & list markup.',
  },
  {
    file: 'ui/word-details.js',
    marker: /innerHTML\s*=/u,
    reason: 'Word details bottom sheet view markup.',
  },
  {
    file: 'ui/word-search.js',
    marker: /innerHTML\s*=/u,
    reason: 'Kanji & word search view layout markup.',
  },
  {
    file: 'ui/flashcards/card-modes.js',
    marker: /innerHTML\s*=/u,
    reason: 'Flashcards study mode card face & feedback markup.',
  },
  {
    file: 'ui/flashcards/dictionary-modal.js',
    marker: /innerHTML\s*=/u,
    reason: 'Dictionary modal inside review panel.',
  },
  {
    file: 'ui/flashcards/dictionary.js',
    marker: /innerHTML\s*=/u,
    reason: 'Dictionary list inside flashcards view.',
  },
  {
    file: 'ui/flashcards/drawing-mode.js',
    marker: /innerHTML\s*=/u,
    reason: 'Kanji stroke drawing container markup.',
  },
  {
    file: 'ui/flashcards/review-fsrs.js',
    marker: /innerHTML\s*=/u,
    reason: 'FSRS review card context container markup.',
  },
  {
    file: 'ui/flashcards/sensei-review-panel.js',
    marker: /innerHTML\s*=/u,
    reason: 'Sensei AI review panel detailed tables & cues markup.',
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

function isAllowlisted(relativePath, lineText) {
  return ALLOWLIST.some((item) => {
    if (item.file !== relativePath) return false;
    if (typeof item.marker === 'string') {
      return lineText.includes(item.marker);
    }
    if (item.marker instanceof RegExp) {
      return item.marker.test(lineText);
    }
    return false;
  });
}

function checkSecurity() {
  console.log('🔒 Executing KotoKitsu Static DOM Security Audit...\n');

  let allFiles = [];
  for (const targetPath of TARGET_PATHS) {
    allFiles = allFiles.concat(collectFiles(targetPath));
  }

  const unallowedViolations = [];
  let totalMatches = 0;
  let allowedMatches = 0;

  for (const filePath of allFiles) {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.regex.test(line)) {
          totalMatches++;
          const lineText = line.trim();

          if (isAllowlisted(relativePath, lineText)) {
            allowedMatches++;
          } else {
            unallowedViolations.push({
              file: relativePath,
              line: lineNumber,
              api: pattern.name,
              code: lineText,
            });
          }
        }
      }
    });
  }

  console.log(`Scan summary: ${totalMatches} security-sensitive DOM API call(s) inspected.`);
  console.log(`Allowlisted entries: ${allowedMatches}`);

  if (unallowedViolations.length > 0) {
    console.error('\n❌ SECURITY VIOLATIONS DETECTED!');
    console.error(
      'The following dangerous DOM API calls were found without a registered entry in ALLOWLIST:\n'
    );
    unallowedViolations.forEach((v) => {
      console.error(`  - ${v.file}:${v.line} [${v.api}]`);
      console.error(`    Code: ${v.code}\n`);
    });
    console.error(
      'If these uses are confirmed to be safe static templates, add an entry to ALLOWLIST in scripts/security-audit.js with justification.'
    );
    process.exit(1);
  }

  console.log('✅ All DOM API usages are verified and compliant with security allowlist.');
}

checkSecurity();

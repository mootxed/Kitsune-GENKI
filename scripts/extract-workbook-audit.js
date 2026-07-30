import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const auditMap = {
  version: 1,
  extractedAt: new Date().toISOString(),
  files: {},
};

// 1. Process supplemental-practice.json
const practicePath = join(ROOT, 'public/data/courses/genki-1/exercises/supplemental-practice.json');
if (existsSync(practicePath)) {
  const practiceData = JSON.parse(readFileSync(practicePath, 'utf8'));

  auditMap.files['supplemental-practice.json'] = {
    source: practiceData.source || null,
    items: {},
  };

  if (practiceData.source) {
    delete practiceData.source;
  }

  for (const chapter of practiceData.chapters || []) {
    for (const item of chapter.practice || []) {
      if (item.source || item.page !== undefined) {
        auditMap.files['supplemental-practice.json'].items[item.id] = {
          source: item.source,
          page: item.page,
        };
        delete item.source;
        delete item.page;
      }
    }
  }

  writeFileSync(practicePath, JSON.stringify(practiceData, null, 2), 'utf8');
  console.log('[extract-workbook-audit] Processed supplemental-practice.json');
}

// 2. Process grammar-quizzes/index.json
const quizIndexPath = join(ROOT, 'public/data/courses/genki-1/grammar/index.json');
if (existsSync(quizIndexPath)) {
  const quizIndex = JSON.parse(readFileSync(quizIndexPath, 'utf8'));
  auditMap.files['grammar-quizzes/index.json'] = {
    workbookTocPdfPages: quizIndex.workbookTocPdfPages || null,
    lessons: {},
  };
  delete quizIndex.workbookTocPdfPages;

  for (const l of quizIndex.lessons || []) {
    if (l.pdfPages || l.workbookPrintedPages) {
      auditMap.files['grammar-quizzes/index.json'].lessons[`lesson-${l.lessonNumber}`] = {
        pdfPages: l.pdfPages,
        workbookPrintedPages: l.workbookPrintedPages,
      };
      delete l.pdfPages;
      delete l.workbookPrintedPages;
    }
  }

  writeFileSync(quizIndexPath, JSON.stringify(quizIndex, null, 2), 'utf8');
  console.log('[extract-workbook-audit] Processed grammar-quizzes/index.json');
}

// Helper to sanitize character names in text
function sanitizeCharacterNames(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/メアリー/g, 'エレナ')
    .replace(/Мэри/g, 'Елена')
    .replace(/たけし/g, 'ケン')
    .replace(/Такэси/g, 'Кен')
    .replace(/Такеши/g, 'Кен');
}

function sanitizeObjectCharacters(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = sanitizeCharacterNames(obj[key]);
    } else if (typeof obj[key] === 'object') {
      sanitizeObjectCharacters(obj[key]);
    }
  }
  return obj;
}

// 3. Process individual quiz files
const quizFiles = [
  ...Array.from(
    { length: 12 },
    (_, i) => `public/data/courses/genki-1/grammar/lesson-${String(i + 1).padStart(2, '0')}.json`
  ),
];

for (const relPath of quizFiles) {
  const fullPath = join(ROOT, relPath);
  if (!existsSync(fullPath)) continue;

  const quiz = JSON.parse(readFileSync(fullPath, 'utf8'));

  auditMap.files[relPath] = {
    source: quiz.source || null,
    pdfPages: quiz.pdfPages || null,
    workbookPrintedPages: quiz.workbookPrintedPages || null,
    workbookTocPdfPages: quiz.workbookTocPdfPages || null,
    topics: {},
    questions: {},
  };

  delete quiz.source;
  delete quiz.pdfPages;
  delete quiz.workbookPrintedPages;
  delete quiz.workbookTocPdfPages;

  for (const topic of quiz.topics || []) {
    if (topic.workbookReference || topic.pdfPages) {
      auditMap.files[relPath].topics[topic.id] = {
        workbookReference: topic.workbookReference,
        pdfPages: topic.pdfPages,
      };
      delete topic.workbookReference;
      delete topic.pdfPages;
    }
  }

  for (const q of quiz.questions || []) {
    if (q.workbookReference || q.pdfPages) {
      auditMap.files[relPath].questions[q.id] = {
        workbookReference: q.workbookReference,
        pdfPages: q.pdfPages,
      };
      delete q.workbookReference;
      delete q.pdfPages;
    }
  }

  // Replace Genki story character names in lesson 1 / questions
  sanitizeObjectCharacters(quiz);

  writeFileSync(fullPath, JSON.stringify(quiz, null, 2), 'utf8');
  console.log(`[extract-workbook-audit] Processed ${relPath}`);
}

// Save audit map to audit/WORKBOOK_MAPPING_AUDIT.json
const auditDir = join(ROOT, 'audit');
mkdirSync(auditDir, { recursive: true });
const auditFile = join(auditDir, 'WORKBOOK_MAPPING_AUDIT.json');
writeFileSync(auditFile, JSON.stringify(auditMap, null, 2), 'utf8');
console.log(`[extract-workbook-audit] Saved audit map to ${auditFile}`);

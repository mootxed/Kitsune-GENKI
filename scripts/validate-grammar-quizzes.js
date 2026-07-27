/* scripts/validate-grammar-quizzes.js — CLI Content Validation Script */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateGrammarQuizIndex, validateGrammarQuizData } from '../src/grammar-quiz-content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadJson(relativePath) {
  const fullPath = path.resolve(rootDir, 'public', relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(content);
}

function runValidation() {
  console.log('🔍 Starting Grammar Quizzes Content Validation...\n');

  let totalErrors = 0;
  let totalWarnings = 0;

  // 1. Read index.json
  let index;
  try {
    index = loadJson('data/grammar-quizzes/index.json');
  } catch (err) {
    console.error('❌ Failed to load index.json:', err.message);
    process.exit(1);
  }

  // 2. Validate index.json
  const indexResult = validateGrammarQuizIndex(index);
  if (!indexResult.valid) {
    console.error('❌ index.json validation errors:');
    indexResult.errors.forEach((e) => console.error(`  - ${e}`));
    totalErrors += indexResult.errors.length;
  } else {
    console.log('✓ index.json schema and structure valid');
  }

  // 3. Load lesson content files (Lessons 1..12)
  const lessons = [];
  for (let i = 1; i <= 12; i++) {
    const pad = String(i).padStart(2, '0');
    try {
      const lessonObj = loadJson(`data/lessons/lesson-${pad}.json`);
      lessons.push(lessonObj);
    } catch (err) {
      console.warn(`⚠️ Warning: could not load lesson-${pad}.json:`, err.message);
    }
  }

  // 3.5 Validate Context Production Tasks across lessons
  const cpResult = validateContextProductionContent(lessons);
  if (!cpResult.valid) {
    console.error('❌ Context Production task validation errors:');
    cpResult.errors.forEach((e) => console.error(`  - ${e}`));
    totalErrors += cpResult.errors.length;
  } else {
    console.log(
      `✓ Context Production tasks valid (${cpResult.taskCount} tasks checked across ${cpResult.wordCount} words)`
    );
  }
  if (cpResult.warnings.length > 0) {
    cpResult.warnings.forEach((w) => console.warn(`  - ${w}`));
    totalWarnings += cpResult.warnings.length;
  }

  // 4. Validate each chapter quiz JSON
  let totalTopicCount = 0;
  let totalQuestionCount = 0;
  const globalTopicIds = new Set();
  const globalQuestionIds = new Set();

  for (const entry of index.chapters || []) {
    const chId = Number(entry.chapterId);
    let chapterData;

    try {
      chapterData = loadJson(entry.path);
    } catch (err) {
      console.error(`❌ Chapter ${chId}: Failed to load file ${entry.path}: ${err.message}`);
      totalErrors++;
      continue;
    }

    const validation = validateGrammarQuizData(chapterData, lessons, entry);

    if (!validation.valid) {
      console.error(
        `❌ Chapter ${chId} (${entry.path}): Validation failed with ${validation.errors.length} error(s):`
      );
      validation.errors.forEach((e) => console.error(`  - ${e}`));
      totalErrors += validation.errors.length;
    }

    if (validation.warnings.length > 0) {
      console.warn(`⚠️ Chapter ${chId}: ${validation.warnings.length} warning(s):`);
      validation.warnings.forEach((w) => console.warn(`  - ${w}`));
      totalWarnings += validation.warnings.length;
    }

    // Global ID uniqueness checks
    for (const topic of chapterData.topics || []) {
      totalTopicCount++;
      if (globalTopicIds.has(topic.id)) {
        console.error(`❌ Global duplicate topic ID: ${topic.id}`);
        totalErrors++;
      }
      globalTopicIds.add(topic.id);

      for (const q of topic.quiz || []) {
        totalQuestionCount++;
        if (globalQuestionIds.has(q.id)) {
          console.error(`❌ Global duplicate question ID: ${q.id}`);
          totalErrors++;
        }
        globalQuestionIds.add(q.id);
      }
    }
  }

  console.log('\n========================================');
  console.log('📊 Content Validation Summary');
  console.log('========================================');
  console.log(`${index.chapters?.length || 0} chapters`);
  console.log(`${totalTopicCount} topics`);
  console.log(`${totalQuestionCount} questions`);
  console.log(`${cpResult.taskCount} context-production tasks`);
  console.log(`${totalErrors} errors`);
  console.log(`${totalWarnings} warnings`);
  console.log('========================================\n');

  if (totalErrors > 0) {
    console.error('❌ Validation failed with errors.');
    process.exit(1);
  } else {
    console.log('✅ All grammar quizzes & context production tasks validated successfully!');
  }
}

function validateContextProductionContent(lessons) {
  const errors = [];
  const warnings = [];
  const seenTaskIds = new Set();
  let taskCount = 0;
  let wordCount = 0;

  for (const lessonWrap of lessons) {
    const lesson = lessonWrap.lesson || lessonWrap;
    const words = lesson.words || lesson.vocabulary || [];

    for (const word of words) {
      const cpSource = word.contextProduction || word.context_production;
      if (!cpSource) continue;

      const rawTasks = Array.isArray(cpSource) ? cpSource : [cpSource];
      if (rawTasks.length > 0) wordCount++;

      for (const task of rawTasks) {
        taskCount++;
        if (!task || typeof task !== 'object') {
          errors.push(`Word ${word.id}: Invalid task object structure`);
          continue;
        }

        const taskId = task.id;
        if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
          errors.push(`Word ${word.id}: Context production task missing stable 'id'`);
        } else {
          if (seenTaskIds.has(taskId.trim())) {
            errors.push(`Duplicate task ID: ${taskId}`);
          }
          seenTaskIds.add(taskId.trim());
        }

        if (task.focusItemId !== word.id) {
          errors.push(
            `Task ${taskId}: focusItemId '${task.focusItemId}' does not match word id '${word.id}'`
          );
        }

        if (!task.prompt || typeof task.prompt !== 'string' || !task.prompt.trim()) {
          errors.push(`Task ${taskId || word.id}: prompt must be a non-empty string`);
        }

        const declaredAnswers = Array.isArray(task.acceptedAnswers)
          ? task.acceptedAnswers
          : task.acceptedAnswers != null
            ? [task.acceptedAnswers]
            : [];

        if (declaredAnswers.length === 0) {
          errors.push(`Task ${taskId || word.id}: acceptedAnswers must be a non-empty array`);
        } else {
          const normSeen = new Set();
          for (const ans of declaredAnswers) {
            if (!ans || typeof ans !== 'string' || !ans.trim()) {
              errors.push(
                `Task ${taskId || word.id}: acceptedAnswer contains an empty or non-string value`
              );
              continue;
            }
            const norm = ans
              .trim()
              .normalize('NFKC')
              .replace(/[。！？.!?「」]/gu, '')
              .replace(/[,\s]+$/u, '')
              .replace(/\s+/g, ' ');
            if (!norm) {
              errors.push(
                `Task ${taskId || word.id}: acceptedAnswer '${ans}' normalizes to an empty string`
              );
            }
            if (normSeen.has(norm)) {
              errors.push(
                `Task ${taskId || word.id}: duplicate acceptedAnswer '${ans}' after normalization`
              );
            }
            normSeen.add(norm);
          }
        }

        const rf = task.requiredForm;
        if (!rf) {
          errors.push(`Task ${taskId || word.id}: requiredForm is missing`);
        } else if (typeof rf === 'object') {
          if (!rf.type || typeof rf.type !== 'string') {
            errors.push(`Task ${taskId || word.id}: requiredForm.type is required`);
          }
        } else if (typeof rf !== 'string' || !rf.trim()) {
          errors.push(`Task ${taskId || word.id}: requiredForm must be a string or object`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    taskCount,
    wordCount,
  };
}

runValidation();

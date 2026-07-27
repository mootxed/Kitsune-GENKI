/* Supplemental external practice metadata loader and validator. No answer-key content is exposed. */

export const SUPPLEMENTAL_PRACTICE_SCHEMA_VERSION = 1;
export const WORKBOOK_PRACTICE_SCHEMA_VERSION = SUPPLEMENTAL_PRACTICE_SCHEMA_VERSION;
const ALLOWED_SECTIONS = new Set(['conversation-grammar', 'reading-writing']);
const ALLOWED_COMPLETION_MODES = new Set(['manual']);

let practicePromise = null;
let practiceIndex = null;

async function fetchPracticeJson() {
  const response = await fetch('data/supplemental-practice.json');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for data/supplemental-practice.json`);
  }
  return response.json();
}

export function validateSupplementalPracticeData(data, chapters = []) {
  const errors = [];
  const warnings = [];
  const chapterIds = new Set();
  const taskIds = new Set();
  const grammarIdsByChapter = new Map(
    (chapters || []).map((chapter) => [
      Number(chapter.id || chapter.lesson_id),
      new Set(
        (chapter.grammarTopics || chapter.grammar || chapter.notes || []).map((topic, index) =>
          String(
            topic.id ||
              (topic.note_id
                ? `L${Number(chapter.id || chapter.lesson_id)}_g${topic.note_id}`
                : `L${Number(chapter.id || chapter.lesson_id)}_g${index + 1}`)
          )
        )
      ),
    ])
  );

  if (data?.schemaVersion !== SUPPLEMENTAL_PRACTICE_SCHEMA_VERSION) {
    errors.push(`unsupported-schema-version:${data?.schemaVersion}`);
  }
  if (!Array.isArray(data?.chapters)) errors.push('chapters-must-be-an-array');

  for (const chapter of data?.chapters || []) {
    const chapterId = Number(chapter?.chapterId);
    if (!Number.isInteger(chapterId) || chapterId <= 0) {
      errors.push(`invalid-chapter-id:${chapter?.chapterId}`);
      continue;
    }
    if (chapterIds.has(chapterId)) errors.push(`duplicate-chapter-id:${chapterId}`);
    chapterIds.add(chapterId);
    if (chapters.length > 0 && !grammarIdsByChapter.has(chapterId)) {
      errors.push(`unknown-chapter-id:${chapterId}`);
    }

    for (const task of chapter.practice || []) {
      if (!task?.id) errors.push(`missing-task-id:${chapterId}`);
      else if (taskIds.has(task.id)) errors.push(`duplicate-task-id:${task.id}`);
      else taskIds.add(task.id);
      if (!task?.title) errors.push(`missing-title:${task?.id || chapterId}`);
      if (!ALLOWED_SECTIONS.has(task?.section)) {
        errors.push(`invalid-section:${task?.id || chapterId}`);
      }
      if (!ALLOWED_COMPLETION_MODES.has(task?.completionMode)) {
        errors.push(`invalid-completion-mode:${task?.id || chapterId}`);
      }
      if (!(Number(task?.estimatedMinutes) > 0)) {
        errors.push(`invalid-estimated-minutes:${task?.id || chapterId}`);
      }

      const grammarIds = grammarIdsByChapter.get(chapterId);
      if (grammarIds) {
        for (const grammarId of task.relatedGrammarIds || []) {
          if (!grammarIds.has(String(grammarId))) {
            warnings.push(`unknown-grammar-reference:${task.id}:${grammarId}`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    chapterCount: chapterIds.size,
    taskCount: taskIds.size,
  };
}

export const validateWorkbookPracticeData = validateSupplementalPracticeData;

export async function loadSupplementalPracticeData() {
  if (!practicePromise) {
    practicePromise = fetchPracticeJson()
      .then((data) => {
        const validation = validateSupplementalPracticeData(data);
        if (!validation.valid) {
          throw new Error(
            `Invalid Supplemental practice metadata: ${validation.errors.join(', ')}`
          );
        }
        practiceIndex = new Map(
          data.chapters.map((chapter) => [Number(chapter.chapterId), chapter.practice || []])
        );
        return data;
      })
      .catch((error) => {
        practicePromise = null;
        practiceIndex = null;
        throw error;
      });
  }
  return practicePromise;
}

export const loadWorkbookPracticeData = loadSupplementalPracticeData;

export async function getSupplementalPracticeForChapter(chapterId) {
  if (!practiceIndex) await loadSupplementalPracticeData();
  return practiceIndex?.get(Number(chapterId)) || [];
}

export const getWorkbookPracticeForChapter = getSupplementalPracticeForChapter;

export function clearSupplementalPracticeCache() {
  practicePromise = null;
  practiceIndex = null;
}

export const clearWorkbookPracticeCache = clearSupplementalPracticeCache;

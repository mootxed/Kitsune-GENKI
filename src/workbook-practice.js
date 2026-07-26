/* Workbook metadata loader and validator. No answer-key content is exposed. */

export const WORKBOOK_PRACTICE_SCHEMA_VERSION = 1;
const ALLOWED_SECTIONS = new Set(['conversation-grammar', 'reading-writing']);
const ALLOWED_COMPLETION_MODES = new Set(['manual']);

let workbookPromise = null;
let workbookIndex = null;

async function fetchWorkbookJson() {
  const response = await fetch('data/genki-i-workbook-practice.json');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for data/genki-i-workbook-practice.json`);
  }
  return response.json();
}

export function validateWorkbookPracticeData(data, chapters = []) {
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

  if (data?.schemaVersion !== WORKBOOK_PRACTICE_SCHEMA_VERSION) {
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
      if (!Number.isInteger(task?.page) || task.page <= 0) {
        errors.push(`invalid-page:${task?.id || chapterId}`);
      }
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

export async function loadWorkbookPracticeData() {
  if (!workbookPromise) {
    workbookPromise = fetchWorkbookJson()
      .then((data) => {
        const validation = validateWorkbookPracticeData(data);
        if (!validation.valid) {
          throw new Error(`Invalid Workbook metadata: ${validation.errors.join(', ')}`);
        }
        workbookIndex = new Map(
          data.chapters.map((chapter) => [Number(chapter.chapterId), chapter.practice || []])
        );
        return data;
      })
      .catch((error) => {
        workbookPromise = null;
        workbookIndex = null;
        throw error;
      });
  }
  return workbookPromise;
}

export async function getWorkbookPracticeForChapter(chapterId) {
  if (!workbookIndex) await loadWorkbookPracticeData();
  return workbookIndex?.get(Number(chapterId)) || [];
}

export function clearWorkbookPracticeCache() {
  workbookPromise = null;
  workbookIndex = null;
}

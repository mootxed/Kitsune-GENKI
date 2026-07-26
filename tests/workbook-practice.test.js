import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeChapterContent } from '../src/chapter-content.js';
import { validateWorkbookPracticeData } from '../src/workbook-practice.js';

const workbook = JSON.parse(fs.readFileSync('public/data/genki-i-workbook-practice.json', 'utf8'));

function loadNormalizedChapters() {
  return workbook.chapters.map(({ chapterId, practice }) => {
    const raw = JSON.parse(
      fs.readFileSync(
        `public/data/lessons/lesson-${String(chapterId).padStart(2, '0')}.json`,
        'utf8'
      )
    ).lesson;
    return normalizeChapterContent(raw, practice);
  });
}

describe('GENKI Workbook metadata integration', () => {
  it('validates all 12 chapters, 119 tasks and every grammar reference', () => {
    const validation = validateWorkbookPracticeData(workbook, loadNormalizedChapters());

    expect(validation).toEqual({
      valid: true,
      errors: [],
      warnings: [],
      chapterCount: 12,
      taskCount: 119,
    });
  });

  it('preserves stable grammar IDs and safe task metadata', () => {
    const chapter = loadNormalizedChapters()[0];

    expect(chapter.grammarTopics[0]).toMatchObject({
      id: 'L1_g1',
      note_id: 1,
      order: 1,
    });
    expect(chapter.practiceTasks[0]).toMatchObject({
      id: 'L01-wb-cg-01',
      section: 'conversation-grammar',
      source: 'GENKI I Workbook, Third Edition',
      completionMode: 'manual',
      relatedGrammarIds: ['L1_g1'],
    });
    expect(chapter.practiceTasks[0]).not.toHaveProperty('answer');
  });
});

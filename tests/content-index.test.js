import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { StudyPlan } from '../studyplan.js';

async function contentIndex() {
  const raw = await readFile('public/data/content-index.json', 'utf8');
  return JSON.parse(raw);
}

describe('content index planning metadata', () => {
  it('содержит полный каталог и ненулевые веса без загрузки LESSONS', async () => {
    const index = await contentIndex();
    expect(index.chapters).toHaveLength(12);
    index.chapters.forEach((chapter) => {
      expect(chapter.vocabCount).toBeGreaterThan(0);
      expect(chapter.grammarCount).toBeGreaterThan(0);
      expect(chapter.estimatedItems).toBeGreaterThan(0);
      expect(chapter.importanceWeight).toBeGreaterThan(0);
      expect(chapter.estimatedMinutes).toBeGreaterThan(0);
      expect(chapter.checklist).toEqual(['vocab', 'grammar', 'dialog', 'listening', 'reading']);
    });

    const plan = StudyPlan.generatePlan(
      {
        startDate: '2026-01-05',
        totalDays: 60,
        studyDaysOfWeek: [1, 2, 3, 4, 5],
      },
      index.chapters,
      []
    );
    expect(plan.error).toBeUndefined();
    expect(plan.segments).toHaveLength(12);
    expect(new Set(plan.segments.map((segment) => segment.days)).size).toBeGreaterThan(1);
  });
});

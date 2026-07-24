/* tests/prior-knowledge.test.js — Prior knowledge model & UI synchronization tests */
import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState, runMigrations } from '../state/store.js';
import {
  getChapterProgress,
  getCompletedChapterIds,
  getActualCompletedChapterIds,
  getPriorKnowledgeChapterIds,
  selectActiveChapterId,
  ensureActiveChapterId,
  setChapterSection,
} from '../src/chapter-progress.js';
import { StudyPlan } from '../studyplan.js';
import { renderChapter } from '../ui/chapter.js';

const MOCK_CHAPTERS = [
  { id: 1, title: 'Глава 1', vocabCount: 10 },
  { id: 2, title: 'Глава 2', vocabCount: 10 },
  { id: 3, title: 'Глава 3', vocabCount: 10 },
  { id: 4, title: 'Глава 4', vocabCount: 10 },
  { id: 5, title: 'Глава 5', vocabCount: 10 },
  { id: 6, title: 'Глава 6', vocabCount: 10 },
];

describe('Prior Knowledge Synchronization & Canonical Progress', () => {
  let appState;

  beforeEach(() => {
    appState = defaultState();
    document.body.innerHTML = `
      <div id="chapter-title"></div>
      <div id="chapter-jp"></div>
      <div id="chapter-body"></div>
      <div id="completed-chapters-list"></div>
      <div id="toast"></div>
    `;
  });

  it('1. Пользователь отметил главы 1–4 как изученные ранее: effective completed = [1,2,3,4], активная = 5, прогресс = 5/5, completionSource = prior-knowledge', () => {
    appState.priorKnowledgeChapterIds = [1, 2, 3, 4];

    expect(getCompletedChapterIds(appState, MOCK_CHAPTERS)).toEqual([1, 2, 3, 4]);

    const activeId = selectActiveChapterId(appState, MOCK_CHAPTERS, '2026-07-24');
    expect(activeId).toBe(5);

    const progress1 = getChapterProgress(appState, 1, MOCK_CHAPTERS[0]);
    expect(progress1.completed).toBe(true);
    expect(progress1.completedCount).toBe(5);
    expect(progress1.totalCount).toBe(5);
    expect(progress1.ratio).toBe(1);
    expect(progress1.nextSection).toBeNull();
    expect(progress1.completionSource).toBe('prior-knowledge');
    expect(progress1.previouslyStudied).toBe(true);
  });

  it('2. Импорт prior knowledge: не изменяет XP, не создаёт learningEvents/reviewEvents/SRS, не выдаёт completion reward', () => {
    const initialXP = appState.xp;
    const initialLearningEvents = [...appState.learningEvents];
    const initialReviewEvents = [...appState.reviewEvents];
    const initialSRS = { ...appState.srs };

    appState.priorKnowledgeChapterIds = [1, 2, 3, 4];

    expect(appState.xp).toBe(initialXP);
    expect(appState.learningEvents).toEqual(initialLearningEvents);
    expect(appState.reviewEvents).toEqual(initialReviewEvents);
    expect(appState.srs).toEqual(initialSRS);
    expect(appState.chapters[1]?.completedAt).toBeUndefined();
    expect(appState.chapters[1]?.completionRewardedAt).toBeUndefined();
  });

  it('3. Пересчёт плана: не возвращает главы 1–4, priorKnowledgeChapterIds сохраняется', () => {
    appState.priorKnowledgeChapterIds = [1, 2, 3, 4];
    const plan = StudyPlan.generatePlan(
      { startDate: '2026-07-24', totalDays: 30, studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      MOCK_CHAPTERS,
      getCompletedChapterIds(appState, MOCK_CHAPTERS)
    );
    appState.studyPlan = plan;

    const plannedChapterIds = plan.segments.map((s) => s.chapterId);
    expect(plannedChapterIds).not.toContain(1);
    expect(plannedChapterIds).not.toContain(2);
    expect(plannedChapterIds).not.toContain(3);
    expect(plannedChapterIds).not.toContain(4);
    expect(plannedChapterIds).toContain(5);

    const recalculated = StudyPlan.recalcPlan(
      appState.studyPlan,
      MOCK_CHAPTERS,
      getCompletedChapterIds(appState, MOCK_CHAPTERS),
      { today: '2026-07-25' }
    );

    const recalcChapterIds = recalculated.segments.map((s) => s.chapterId);
    expect(recalcChapterIds).not.toContain(1);
    expect(recalcChapterIds).not.toContain(2);
    expect(recalcChapterIds).not.toContain(3);
    expect(recalcChapterIds).not.toContain(4);
    expect(appState.priorKnowledgeChapterIds).toEqual([1, 2, 3, 4]);
  });

  it('4. Удаление плана: не удаляет предыдущие знания; следующая доступная глава остаётся 5', () => {
    appState.priorKnowledgeChapterIds = [1, 2, 3, 4];
    appState.studyPlan = { segments: [] };

    // Удаляем план
    appState.studyPlan = null;
    ensureActiveChapterId(appState, MOCK_CHAPTERS, '2026-07-24');

    expect(appState.priorKnowledgeChapterIds).toEqual([1, 2, 3, 4]);
    expect(appState.activeChapterId).toBe(5);
  });

  it('5. Повторное открытие формы: отметки сохранены, реально завершённая глава 1 заблокирована для снятия (disabled)', () => {
    // Глава 1 реально завершена в приложении
    appState.chapters[1] = {
      started: true,
      completedAt: Date.now(),
      checklist: { vocab: true, grammar: true, dialog: true, listening: true, reading: true },
    };
    // Главы 2, 3 отмечены как prior knowledge
    appState.priorKnowledgeChapterIds = [2, 3];

    expect(getActualCompletedChapterIds(appState, MOCK_CHAPTERS)).toEqual([1]);
    expect(getCompletedChapterIds(appState, MOCK_CHAPTERS)).toEqual([1, 2, 3]);

    // Проверяем renderCompletedChaptersList в ui/plan.js
    const container = document.getElementById('completed-chapters-list');
    const actualSet = new Set(getActualCompletedChapterIds(appState, MOCK_CHAPTERS));
    const effectiveSet = new Set(getCompletedChapterIds(appState, MOCK_CHAPTERS));

    container.innerHTML = MOCK_CHAPTERS.map((ch) => {
      const isActual = actualSet.has(ch.id);
      const isEffective = effectiveSet.has(ch.id);
      return `<input type="checkbox" class="chapter-checkbox" data-chapter-id="${ch.id}" ${isEffective ? 'checked' : ''} ${isActual ? 'disabled' : ''}>`;
    }).join('');

    const cb1 = container.querySelector('[data-chapter-id="1"]');
    const cb2 = container.querySelector('[data-chapter-id="2"]');
    const cb5 = container.querySelector('[data-chapter-id="5"]');

    expect(cb1.checked).toBe(true);
    expect(cb1.disabled).toBe(true);
    expect(cb2.checked).toBe(true);
    expect(cb2.disabled).toBe(false);
    expect(cb5.checked).toBe(false);
  });

  it('6. Снятие ручной отметки: удаляет только prior-knowledge статус, не удаляет настоящие данные главы', () => {
    // Глава 1 реально пройдена
    setChapterSection(appState, 1, 'vocab', true, { chapters: MOCK_CHAPTERS });
    // Глава 2 в prior knowledge
    appState.priorKnowledgeChapterIds = [2];

    // Снимаем отметку главы 2 (удаляем из priorKnowledgeChapterIds)
    appState.priorKnowledgeChapterIds = appState.priorKnowledgeChapterIds.filter((id) => id !== 2);

    expect(getPriorKnowledgeChapterIds(appState)).toEqual([]);
    // Глава 1 сохранила свои секции в state.chapters
    expect(appState.chapters[1].checklist.vocab).toBe(true);
  });

  it('7. Миграция v6 → v7: переносит legacy studyPlan.completedChapters, работает идемпотентно, не создаёт события', () => {
    const v6State = {
      version: 6,
      chapters: {
        1: {
          started: true,
          completedAt: 12345,
          checklist: { vocab: true, grammar: true, dialog: true, listening: true, reading: true },
        },
      },
      learningEvents: [],
      studyPlan: {
        completedChapters: [1, 2, 3, 4],
      },
    };

    const migrated = runMigrations(v6State);
    expect(migrated.version).toBe(7);
    // Глава 1 - реальное завершение -> не в priorKnowledgeChapterIds
    // Главы 2, 3, 4 -> перенесены в priorKnowledgeChapterIds
    expect(migrated.priorKnowledgeChapterIds).toEqual([2, 3, 4]);
    expect(migrated.learningEvents).toEqual([]);

    // Идемпотентность
    const reMigrated = runMigrations(migrated);
    expect(reMigrated.priorKnowledgeChapterIds).toEqual([2, 3, 4]);
  });

  it('8. ui/chapter.js: prior-knowledge глава не показывает start-chapter-btn, не показывает текст о блокировке, показывает статус "Изучено ранее", отфильтровывает undefined в категориях', async () => {
    appState.priorKnowledgeChapterIds = [1];
    window.nav = () => {};

    const lessonWithUndefinedCategory = {
      id: 1,
      title: 'Приветствие',
      words: [
        { word: 'こんにちは', category: 'Приветствия' },
        { word: 'さようなら', category: undefined },
        { word: 'ありがとう', category: null },
      ],
    };

    const { LESSONS } = await import('../ui/home.js');
    LESSONS.push(lessonWithUndefinedCategory);

    await renderChapter(1, appState, {
      toast: () => {},
    });

    const bodyHtml = document.getElementById('chapter-body').innerHTML;

    // Не показывает кнопку старта
    expect(document.getElementById('ch-start')).toBeNull();
    // Не показывает текст о блокировке
    expect(bodyHtml).not.toContain('Слова и грамматика заблокированы до старта главы');

    // Показывает значок "Изучено ранее"
    expect(document.querySelector('[data-testid="prior-knowledge-badge"]')).not.toBeNull();
    expect(bodyHtml).toContain('Изучено ранее');

    // Показывает 5/5
    expect(document.querySelector('[data-testid="chapter-progress-text"]').textContent).toBe('5/5');

    // Категории: содержит "Приветствия", не содержит "undefined"
    expect(bodyHtml).toContain('Приветствия');
    expect(bodyHtml).not.toContain('undefined');
    expect(bodyHtml).not.toContain('null');
  });
});

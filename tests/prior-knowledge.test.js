/* tests/prior-knowledge.test.js — Prior knowledge model, SRS integration & UI tests */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runMigrations, defaultState, CURRENT_VERSION } from '../state/store.js';
import { State } from 'ts-fsrs';
import {
  getCompletedChapterIds,
  getPriorKnowledgeChapterIds,
  selectActiveChapterId,
} from '../src/chapter-progress.js';
import {
  ensureChapterVocabularyCards,
  reconcilePriorKnowledgeVocabulary,
} from '../src/chapter-vocabulary.js';
import { isWordUnlocked } from '../src/srs-helpers.js';
import { limitNewCardsForSession } from '../src/srs-limits.js';
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

const MOCK_LESSON_1 = {
  id: 1,
  title: 'Приветствия',
  words: [
    { id: 'L1_V001', kanji: 'こんにちは', category: 'Приветствия' },
    { id: 'L1_V002', kanji: 'ありがとう', category: 'Приветствия' },
  ],
};

const MOCK_LESSON_2 = {
  id: 2,
  title: 'Числа',
  words: [
    { id: 'L2_V001', kanji: '一', category: 'Числа' },
    { id: 'L2_V002', kanji: '二', category: 'Числа' },
  ],
};

describe('Prior Knowledge Synchronization & SRS Integration', () => {
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

  it('1. Пользователь отмечает главы 1–4 как prior knowledge: активная глава 5, главы 1–4 отсутствуют в плане, их слова добавляются в state.srs', async () => {
    appState.priorKnowledgeChapterIds = [1, 2, 3, 4];

    expect(getCompletedChapterIds(appState, MOCK_CHAPTERS)).toEqual([1, 2, 3, 4]);

    const activeId = selectActiveChapterId(appState, MOCK_CHAPTERS, '2026-07-24');
    expect(activeId).toBe(5);

    const plan = StudyPlan.generatePlan(
      { startDate: '2026-07-24', totalDays: 30, studyDaysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      MOCK_CHAPTERS,
      getCompletedChapterIds(appState, MOCK_CHAPTERS)
    );
    const plannedIds = plan.segments.map((s) => s.chapterId);
    expect(plannedIds).not.toContain(1);
    expect(plannedIds).not.toContain(2);
    expect(plannedIds).not.toContain(3);
    expect(plannedIds).not.toContain(4);
    expect(plannedIds).toContain(5);

    // Подгрузка слов из prior knowledge главы
    ensureChapterVocabularyCards(appState, MOCK_LESSON_1);
    const cardKeys = Object.keys(appState.srs);
    expect(cardKeys.length).toBeGreaterThan(0);
    expect(cardKeys.some((k) => k.startsWith('L1_V001'))).toBe(true);
  });

  it('2. Созданные карточки: State.New, reps/lapses/stability/difficulty=0, lastReview=null, без reviewEvents/learningEvents/mastery/XP', () => {
    const initialXP = appState.xp;
    appState.priorKnowledgeChapterIds = [1];

    ensureChapterVocabularyCards(appState, MOCK_LESSON_1);

    const cardId = 'L1_V001';
    const card = appState.srs[cardId];
    expect(card).toBeDefined();
    expect(card.state).toBe(State.New);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.lastReview).toBeNull();
    expect(typeof card.due).toBe('number');

    // Проверяем, что не создались сопутствующие события и не выдался XP
    expect(appState.xp).toBe(initialXP);
    expect(appState.learningEvents).toEqual([]);
    expect(appState.reviewEvents).toEqual([]);
    expect(appState.masteryArchive).toEqual({});
  });

  it('3. Повторный reconciliation: идемпотентен, не создаёт дубликаты, не меняет due/reps/stability', () => {
    appState.priorKnowledgeChapterIds = [1];
    ensureChapterVocabularyCards(appState, MOCK_LESSON_1);

    const firstCardState = { ...appState.srs['L1_V001'] };
    const firstCount = Object.keys(appState.srs).length;

    // Вторая попытка reconciliation
    const result = ensureChapterVocabularyCards(appState, MOCK_LESSON_1);

    expect(result.created).toBe(0);
    expect(Object.keys(appState.srs).length).toBe(firstCount);
    expect(appState.srs['L1_V001'].due).toBe(firstCardState.due);
    expect(appState.srs['L1_V001'].reps).toBe(firstCardState.reps);
    expect(appState.srs['L1_V001'].stability).toBe(firstCardState.stability);
  });

  it('4. Существующая карточка с прогрессом не перезаписывается и не сбрасывается в State.New', () => {
    appState.priorKnowledgeChapterIds = [1];

    // Создаём карточку с прогрессом
    appState.srs['L1_V001'] = {
      id: 'L1_V001',
      itemId: 'L1_V001',
      skill: 'recognition',
      knowledgeType: 'vocabulary',
      state: State.Review,
      reps: 5,
      lapses: 1,
      stability: 12.5,
      difficulty: 4.2,
      due: 1700000000000,
      lastReview: 1690000000000,
    };

    ensureChapterVocabularyCards(appState, MOCK_LESSON_1);

    const card = appState.srs['L1_V001'];
    expect(card.state).toBe(State.Review);
    expect(card.reps).toBe(5);
    expect(card.lapses).toBe(1);
    expect(card.stability).toBe(12.5);
    expect(card.difficulty).toBe(4.2);
    expect(card.due).toBe(1700000000000);
  });

  it('5. Пользователь с сохранёнными priorKnowledgeChapterIds после запуска получает карточки через runtime reconciliation', async () => {
    appState.priorKnowledgeChapterIds = [1, 2];

    const mockLoader = vi.fn().mockImplementation(async (id) => {
      if (id === 1) return { lesson: MOCK_LESSON_1 };
      if (id === 2) return { lesson: MOCK_LESSON_2 };
      throw new Error('Not found');
    });

    const res = await reconcilePriorKnowledgeVocabulary(appState, mockLoader);

    expect(res.success).toBe(true);
    expect(res.addedCards).toBeGreaterThan(0);
    expect(appState.srs['L1_V001']).toBeDefined();
    expect(appState.srs['L2_V001']).toBeDefined();
  });

  it('6. Офлайн-ошибка загрузки одной главы: приложение не падает, сохраняет priorKnowledgeChapterIds', async () => {
    appState.priorKnowledgeChapterIds = [1, 2];

    const mockLoader = vi.fn().mockImplementation(async (id) => {
      if (id === 1) return { lesson: MOCK_LESSON_1 };
      if (id === 2) throw new Error('Offline network failure');
    });

    const res = await reconcilePriorKnowledgeVocabulary(appState, mockLoader);

    expect(res.success).toBe(false);
    expect(res.failedChapters).toEqual([2]);
    expect(appState.priorKnowledgeChapterIds).toEqual([1, 2]);
    expect(appState.srs['L1_V001']).toBeDefined();
  });

  it('7. Снятие prior knowledge: не удаляет созданные SRS-карточки и исторические данные', () => {
    appState.priorKnowledgeChapterIds = [1, 2];
    ensureChapterVocabularyCards(appState, MOCK_LESSON_1);
    expect(appState.srs['L1_V001']).toBeDefined();

    // Пользователь убирает главу 1 из prior knowledge
    appState.priorKnowledgeChapterIds = [2];

    expect(getPriorKnowledgeChapterIds(appState)).toEqual([2]);
    expect(appState.srs['L1_V001']).toBeDefined();
    expect(isWordUnlocked('L1_V001', appState)).toBe(false); // Заблокировано до явного старта главы, но карточка не удалена
  });

  it('8. Экран prior-knowledge главы: показывает баннер "Изучено ранее", SRS-карточки, кнопку повторения и блокирует стартовую кнопку/XP', async () => {
    appState.priorKnowledgeChapterIds = [1];
    ensureChapterVocabularyCards(appState, MOCK_LESSON_1);

    const { LESSONS } = await import('../ui/home.js');
    LESSONS.push(MOCK_LESSON_1);

    let startedChapterId = null;
    let startedCards = null;

    await renderChapter(1, appState, {
      toast: () => {},
      startChapterFlashcards: (chId, cards) => {
        startedChapterId = chId;
        startedCards = cards;
      },
    });

    const bodyHtml = document.getElementById('chapter-body').innerHTML;

    expect(document.getElementById('ch-start')).toBeNull();
    expect(document.querySelector('[data-testid="prior-knowledge-badge"]')).not.toBeNull();
    expect(bodyHtml).toContain('Изучено ранее');

    const studyBtn = document.getElementById('ch-study');
    expect(studyBtn).not.toBeNull();

    studyBtn.click();
    expect(startedChapterId).toBe(1);
    expect(startedCards.length).toBeGreaterThan(0);
  });

  it('9. Дневной и сессионный лимиты FSRS: сотни новых карточек не обходят лимиты', () => {
    appState.priorKnowledgeChapterIds = [1, 2];
    ensureChapterVocabularyCards(appState, MOCK_LESSON_1);
    ensureChapterVocabularyCards(appState, MOCK_LESSON_2);

    const allNewDue = Object.values(appState.srs);
    expect(allNewDue.length).toBeGreaterThan(2);

    const limited = limitNewCardsForSession(allNewDue, appState.srs, {
      config: { dailyNewCardsLimit: 2, sessionNewCardsLimit: 2 },
    });

    // Из 4 карточек двух уроков сессия должна выдать ровно 2 карточки
    expect(limited.length).toBe(2);
  });

  it('10. Миграция v6 → v7: переносит legacy studyPlan.completedChapters идемпотентно', () => {
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
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.priorKnowledgeChapterIds).toEqual([2, 3, 4]);

    const reMigrated = runMigrations(migrated);
    expect(reMigrated.priorKnowledgeChapterIds).toEqual([2, 3, 4]);
  });
});

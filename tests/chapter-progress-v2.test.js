import { describe, it, expect, beforeEach } from 'vitest';
import { defaultState } from '../state/store.js';
import {
  getChapterGrammarTopics,
  getChapterPracticeTasks,
  getChapterProgress,
  hasCompletedChecklist,
  isChapterCompleted,
  isGrammarBlockCompleted,
  isGrammarTopicCompleted,
  isPracticeBlockCompleted,
  isPracticeItemCompleted,
  isVocabularyBlockCompleted,
  setChapterSection,
  completeChapter,
} from '../src/chapter-progress.js';

const MOCK_LESSON = {
  id: 2,
  lesson_id: 2,
  title: 'Урок 2',
  words: [
    { id: 'L2_V001', kanji: 'これ' },
    { id: 'L2_V002', kanji: 'それ' },
  ],
  notes: [
    { note_id: 1, title: 'Грамматика 1: これ, それ', content: '...' },
    { note_id: 2, title: 'Грамматика 2: この, その', content: '...' },
  ],
};

describe('Task 3: Chapter Progress & 3-Block Redesign', () => {
  let appState;

  beforeEach(() => {
    appState = defaultState();
  });

  it('1. getChapterGrammarTopics извлекает темы с детерминированными ID', () => {
    const topics = getChapterGrammarTopics(MOCK_LESSON);
    expect(topics).toHaveLength(2);
    expect(topics[0]).toEqual({
      id: 'L2_g1',
      title: 'Грамматика 1: これ, それ',
      content: '...',
      order: 1,
      chapterId: 2,
      estimatedMinutes: 10,
    });
    expect(topics[1].id).toBe('L2_g2');
  });

  it('2. getChapterPracticeTasks возвращает унифицированные задачи практики по умолчанию', () => {
    const practice = getChapterPracticeTasks(MOCK_LESSON);
    expect(practice).toHaveLength(3);
    expect(practice.map((p) => p.id)).toEqual(['dialog', 'listening', 'reading']);
  });

  it('3. Старые сохранения с checklist.grammar = true считаются пройденными по грамматике', () => {
    appState.chapters[2] = {
      started: true,
      legacyVocabularyCompleted: true,
      checklist: { vocab: true, grammar: true, dialog: true, listening: true, reading: true },
    };

    expect(isGrammarTopicCompleted(appState.chapters[2], 'L2_g1')).toBe(true);
    expect(isGrammarBlockCompleted(appState.chapters[2], MOCK_LESSON)).toBe(true);
    expect(isPracticeBlockCompleted(appState.chapters[2], MOCK_LESSON)).toBe(true);
    expect(isChapterCompleted(appState.chapters[2], MOCK_LESSON, appState)).toBe(true);
  });

  it('4. Гранулярное выполнение грамматических тем и практик', () => {
    appState.chapters[2] = {
      started: true,
      checklist: { L2_g1: true },
    };

    expect(isGrammarTopicCompleted(appState.chapters[2], 'L2_g1')).toBe(true);
    expect(isGrammarTopicCompleted(appState.chapters[2], 'L2_g2')).toBe(false);
    expect(isGrammarBlockCompleted(appState.chapters[2], MOCK_LESSON)).toBe(false);

    setChapterSection(appState, 2, 'L2_g2', true);
    expect(isGrammarBlockCompleted(appState.chapters[2], MOCK_LESSON)).toBe(true);

    expect(isPracticeBlockCompleted(appState.chapters[2], MOCK_LESSON)).toBe(false);
    setChapterSection(appState, 2, 'dialog', true);
    setChapterSection(appState, 2, 'listening', true);
    setChapterSection(appState, 2, 'reading', true);
    expect(isPracticeBlockCompleted(appState.chapters[2], MOCK_LESSON)).toBe(true);
  });

  it('5. Глава завершена только при открытии всех слов, прохождении всей грамматики и практики', () => {
    appState.chapters[2] = {
      started: true,
      legacyVocabularyCompleted: true,
      checklist: { vocab: true, L2_g1: true, L2_g2: true, dialog: true, listening: true },
    };

    expect(isChapterCompleted(appState.chapters[2], MOCK_LESSON, appState)).toBe(false);

    setChapterSection(appState, 2, 'reading', true);
    expect(isChapterCompleted(appState.chapters[2], MOCK_LESSON, appState)).toBe(true);
  });
});

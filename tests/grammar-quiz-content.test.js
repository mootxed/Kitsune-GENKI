import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateGrammarQuizData,
  validateGrammarQuizIndex,
  normalizeGrammarQuizAnswer,
  buildVocabularyReferenceIndex,
  clearGrammarQuizCache,
  loadGrammarQuizIndex,
  loadGrammarQuizChapter,
  getGrammarQuizForChapter,
  getGrammarQuizTopic,
} from '../src/grammar-quiz-content.js';
import quizData from '../public/data/courses/genki-1/grammar/lesson-01.json';
import indexData from '../public/data/courses/genki-1/grammar/index.json';
import lesson01Data from '../public/data/courses/genki-1/lessons/lesson-01.json';

describe('Grammar Quiz Content & Schema (lesson-01.json & loader API)', () => {
  beforeEach(() => {
    clearGrammarQuizCache();
    vi.restoreAllMocks();
  });

  it('loads JSON with valid schemaVersion === 1 and chapterId === 1', () => {
    expect(quizData).toBeDefined();
    expect(quizData.schemaVersion).toBe(1);
    expect(quizData.chapterId).toBe(1);
  });

  it('validates index structure cleanly via validateGrammarQuizIndex', () => {
    const result = validateGrammarQuizIndex(indexData);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('contains exactly 5 topics matching lesson-01 grammar note IDs', () => {
    expect(Array.isArray(quizData.topics)).toBe(true);
    expect(quizData.topics.length).toBe(5);

    const topicIds = quizData.topics.map((t) => t.id);
    expect(topicIds).toEqual(['L1_g1', 'L1_g2', 'L1_g3', 'L1_g4', 'L1_g5']);

    const lessonNoteIds = (lesson01Data.lesson.notes || lesson01Data.lesson.grammar).map(
      (n, i) => `L1_g${n.note_id || i + 1}`
    );
    expect(topicIds).toEqual(lessonNoteIds);
  });

  it('ensures each topic has 3 or more questions and all question IDs are unique', () => {
    const allQuestionIds = new Set();

    for (const topic of quizData.topics) {
      expect(Array.isArray(topic.quiz)).toBe(true);
      expect(topic.quiz.length).toBeGreaterThanOrEqual(3);

      for (const q of topic.quiz) {
        expect(allQuestionIds.has(q.id)).toBe(false);
        allQuestionIds.add(q.id);
      }
    }
  });

  it('correctly normalizes user answer strings', () => {
    expect(normalizeGrammarQuizAnswer('  たけしです。 ')).toBe('たけしです');
    expect(normalizeGrammarQuizAnswer('   hello   world. ')).toBe('hello world');
  });

  it('builds vocabulary reference index across lesson objects', () => {
    const index = buildVocabularyReferenceIndex([lesson01Data.lesson]);
    expect(index.has('L1_V001')).toBe(true);
    expect(index.get('L1_V001').chapterId).toBe(1);
  });

  it('supports lazy chapter loading and cache clearing by chapterId', async () => {
    global.fetch = vi.fn((url) => {
      try {
        const pathname = new URL(String(url), 'http://localhost/').pathname.replace(/^\/+/, '');
        const data = JSON.parse(fs.readFileSync(path.resolve('public', pathname), 'utf8'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      } catch {
        return Promise.reject(new Error(`404 ${url}`));
      }
    });

    const chapter1 = await loadGrammarQuizChapter(1);
    expect(chapter1).toBeDefined();
    expect(chapter1.chapterId).toBe('genki-1:lesson-1');

    const safeFetch = await getGrammarQuizForChapter(1);
    expect(safeFetch).toEqual(chapter1);

    const topic = await getGrammarQuizTopic(1, 'genki-1:grammar:L1_g1');
    expect(topic).toBeDefined();
    expect(topic.id).toBe('genki-1:grammar:L1_g1');

    // Test clearing cache by chapterId
    clearGrammarQuizCache(1);
    const reFetched = await loadGrammarQuizChapter(1);
    expect(reFetched).toBeDefined();
  });
});

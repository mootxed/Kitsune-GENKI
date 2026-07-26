import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  validateGrammarQuizIndex,
  validateGrammarQuizData,
  buildVocabularyReferenceIndex,
  detectGrammarPrerequisiteCycles,
} from '../src/grammar-quiz-content.js';

const rootDir = path.resolve(__dirname, '..');

function loadJson(relPath) {
  const absPath = path.resolve(rootDir, 'public', relPath);
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw);
}

describe('Grammar Quiz All Chapters Integrity (Lessons 01–12)', () => {
  const index = loadJson('data/grammar-quizzes/index.json');
  const lessons = Array.from({ length: 12 }, (_, i) => {
    const pad = String(i + 1).padStart(2, '0');
    return loadJson(`data/lessons/lesson-${pad}.json`);
  });
  const vocabIndex = buildVocabularyReferenceIndex(lessons);

  it('verifies index.json contains exactly 12 sequential chapters 1..12', () => {
    const result = validateGrammarQuizIndex(index);
    expect(result.valid).toBe(true);
    expect(index.chapters.length).toBe(12);

    index.chapters.forEach((ch, idx) => {
      expect(ch.chapterId).toBe(idx + 1);
      expect(ch.path).toBe(`data/grammar-quizzes/lesson-${String(idx + 1).padStart(2, '0')}.json`);
      expect(fs.existsSync(path.resolve(rootDir, 'public', ch.path))).toBe(true);
    });
  });

  it('validates each chapter JSON structure, topic count, and question count', () => {
    let totalTopics = 0;
    let totalQuestions = 0;

    index.chapters.forEach((entry) => {
      const chapterData = loadJson(entry.path);
      const validation = validateGrammarQuizData(chapterData, lessons, entry);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);

      const topicCount = chapterData.topics.length;
      let questionCount = 0;
      chapterData.topics.forEach((t) => {
        questionCount += t.quiz.length;
        expect(t.quiz.length).toBeGreaterThanOrEqual(3);
      });

      expect(topicCount).toBe(entry.topicCount);
      expect(questionCount).toBe(entry.questionCount);

      totalTopics += topicCount;
      totalQuestions += questionCount;
    });

    expect(totalTopics).toBe(76);
    expect(totalQuestions).toBe(228);
  });

  it('verifies global uniqueness of all topic IDs and question IDs', () => {
    const allTopicIds = new Set();
    const allQuestionIds = new Set();

    index.chapters.forEach((entry) => {
      const chapterData = loadJson(entry.path);
      chapterData.topics.forEach((topic) => {
        expect(allTopicIds.has(topic.id)).toBe(false);
        allTopicIds.add(topic.id);

        topic.quiz.forEach((q) => {
          expect(allQuestionIds.has(q.id)).toBe(false);
          expect(q.id.startsWith(topic.id)).toBe(true);
          allQuestionIds.add(q.id);
        });
      });
    });

    expect(allTopicIds.size).toBe(76);
    expect(allQuestionIds.size).toBe(228);
  });

  it('verifies all topics exist in their corresponding lesson JSON notes and noteIds match', () => {
    index.chapters.forEach((entry) => {
      const chapterData = loadJson(entry.path);
      const lessonObj = lessons.find(
        (l) => Number(l.lesson?.lesson_id || l.lesson?.id) === entry.chapterId
      )?.lesson;
      expect(lessonObj).toBeDefined();

      const lessonNotes = lessonObj.notes || lessonObj.grammar || [];

      chapterData.topics.forEach((topic) => {
        const matchingNote = lessonNotes.find(
          (n, idx) =>
            String(n.id || `L${entry.chapterId}_g${n.note_id || n.noteId || idx + 1}`) === topic.id
        );
        expect(matchingNote).toBeDefined();
        if (topic.noteId != null && (matchingNote.note_id != null || matchingNote.noteId != null)) {
          expect(Number(topic.noteId)).toBe(Number(matchingNote.note_id ?? matchingNote.noteId));
        }
      });
    });
  });

  it('verifies grammarRefs only refer to existing past or present topics and no future chapters/topics', () => {
    const globalTopicIds = new Set();
    const topicOrderMap = new Map();

    index.chapters.forEach((entry) => {
      const chapterData = loadJson(entry.path);
      chapterData.topics.forEach((t, idx) => {
        globalTopicIds.add(t.id);
        topicOrderMap.set(t.id, {
          chapterId: entry.chapterId,
          noteId: Number(t.noteId) || idx + 1,
        });
      });
    });

    index.chapters.forEach((entry) => {
      const chapterData = loadJson(entry.path);
      chapterData.topics.forEach((topic) => {
        topic.quiz.forEach((q) => {
          (q.grammarRefs || []).forEach((ref) => {
            expect(globalTopicIds.has(ref)).toBe(true);
            const refMeta = topicOrderMap.get(ref);
            expect(refMeta.chapterId).toBeLessThanOrEqual(entry.chapterId);
            if (refMeta.chapterId === entry.chapterId) {
              expect(refMeta.noteId).toBeLessThanOrEqual(Number(topic.noteId));
            }
          });
        });
      });
    });
  });

  it('verifies vocabularyRefs and requiredVocabularyIds refer to existing past or present chapter vocabulary', () => {
    index.chapters.forEach((entry) => {
      const chapterData = loadJson(entry.path);
      chapterData.topics.forEach((topic) => {
        (topic.requiredVocabularyIds || []).forEach((vId) => {
          const vEntry = vocabIndex.get(String(vId));
          expect(vEntry).toBeDefined();
          expect(vEntry.chapterId).toBeLessThanOrEqual(entry.chapterId);
        });

        topic.quiz.forEach((q) => {
          (q.vocabularyRefs || []).forEach((vRef) => {
            const vEntry = vocabIndex.get(String(vRef));
            expect(vEntry).toBeDefined();
            expect(vEntry.chapterId).toBeLessThanOrEqual(entry.chapterId);
          });
        });
      });
    });
  });

  it('checks pedagogical prerequisites and detects cycles', () => {
    const allTopics = [];
    index.chapters.forEach((entry) => {
      const chapterData = loadJson(entry.path);
      chapterData.topics.forEach((t) => {
        allTopics.push({ ...t, chapterId: chapterData.chapterId });
      });
    });

    expect(detectGrammarPrerequisiteCycles(allTopics)).toBe(false);

    allTopics.forEach((topic) => {
      (topic.prerequisiteGrammarIds || []).forEach((pId) => {
        expect(pId).not.toBe(topic.id);
        const match = String(pId).match(/^L(\d+)_g(\d+)/i);
        if (match) {
          const pCh = Number(match[1]);
          const pNote = Number(match[2]);
          expect(pCh).toBeLessThanOrEqual(topic.chapterId);
          if (pCh === topic.chapterId) {
            expect(pNote).toBeLessThan(Number(topic.noteId));
          }
        }
      });
    });
  });

  it('checks UI question type support and verifies no question types outside standard set', () => {
    const allowed = new Set(['single-choice', 'fill-blank', 'sentence-order']);
    index.chapters.forEach((entry) => {
      const chapterData = loadJson(entry.path);
      chapterData.topics.forEach((t) => {
        t.quiz.forEach((q) => {
          expect(allowed.has(q.type)).toBe(true);
        });
      });
    });
  });

  it('ensures no future grammar concepts leak into representative question texts of earlier chapters', () => {
    // Chapter 2: no te-form
    const ch2 = loadJson('data/grammar-quizzes/lesson-02.json');
    const ch2Text = JSON.stringify(ch2);
    expect(ch2Text).not.toContain('て形');
    expect(ch2Text).not.toContain('て-form');

    // Chapter 3: no short forms
    const ch3 = loadJson('data/grammar-quizzes/lesson-03.json');
    const ch3Text = JSON.stringify(ch3);
    expect(ch3Text).not.toContain('short form');
    expect(ch3Text).not.toContain('ショートフォーム');

    // Chapter 6: no passive or tara
    const ch6 = loadJson('data/grammar-quizzes/lesson-06.json');
    const ch6Text = JSON.stringify(ch6);
    expect(ch6Text).not.toContain('受身');
    expect(ch6Text).not.toContain('～たら');

    // Chapter 8: no comparisons (Chapter 10)
    const ch8 = loadJson('data/grammar-quizzes/lesson-08.json');
    const ch8Text = JSON.stringify(ch8);
    expect(ch8Text).not.toContain('のほうが');
    expect(ch8Text).not.toContain('より');

    // Chapter 11: no ~node (Chapter 12)
    const ch11 = loadJson('data/grammar-quizzes/lesson-11.json');
    const ch11Text = JSON.stringify(ch11);
    expect(ch11Text).not.toContain('～ので');
  });
});

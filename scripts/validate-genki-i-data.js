#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), 'utf8'));
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function collectVocabularyRefs(value, location, output) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectVocabularyRefs(entry, `${location}[${index}]`, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      ['focusItemId', 'targetWordId', 'itemId'].includes(key) &&
      typeof entry === 'string' &&
      /^L\d+_V\d+$/u.test(entry)
    ) {
      output.push({ id: entry, location: `${location}.${key}` });
    }
    if (
      ['requiredVocabularyIds', 'vocabularyRefs', 'itemIds', 'wordIds'].includes(key) &&
      Array.isArray(entry)
    ) {
      entry.forEach((id, index) => {
        if (typeof id === 'string' && /^L\d+_V\d+$/u.test(id)) {
          output.push({ id, location: `${location}.${key}[${index}]` });
        }
      });
    }
    collectVocabularyRefs(entry, `${location}.${key}`, output);
  }
}

function collectGrammarRefs(value, location, output) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectGrammarRefs(entry, `${location}[${index}]`, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      ['grammarTopicIds', 'grammarRefs', 'prerequisiteGrammarIds'].includes(key) &&
      Array.isArray(entry)
    ) {
      entry.forEach((id, index) => {
        if (typeof id === 'string') {
          output.push({ id, location: `${location}.${key}[${index}]` });
        }
      });
    }
    collectGrammarRefs(entry, `${location}.${key}`, output);
  }
}

export async function validateGenkiData() {
  const errors = [];
  const words = [];
  const wordIds = new Set();
  const identities = new Set();
  const grammarIds = new Set();
  const lessonCounts = new Map();
  const vocabularyRefs = [];
  const grammarRefs = [];

  for (let lessonId = 1; lessonId <= 12; lessonId++) {
    const suffix = String(lessonId).padStart(2, '0');
    const relativePath = `public/data/courses/genki-1/lessons/lesson-${suffix}.json`;
    const document = await readJson(relativePath);
    const lesson = document.lesson;
    addError(errors, document.schemaVersion === 2, `${relativePath}: schemaVersion must be 2`);
    addError(errors, Number(lesson?.lesson_id) === lessonId, `${relativePath}: wrong lesson_id`);
    addError(
      errors,
      Array.isArray(lesson?.vocabulary) && lesson.vocabulary.length > 0,
      `${relativePath}: vocabulary is empty`
    );
    lessonCounts.set(lessonId, lesson?.vocabulary?.length || 0);

    for (const [index, word] of (lesson?.vocabulary || []).entries()) {
      const location = `${relativePath}.lesson.vocabulary[${index}]`;
      for (const field of ['id', 'lesson', 'writtenForm', 'reading', 'meaning']) {
        addError(
          errors,
          word[field] !== null && word[field] !== undefined && String(word[field]).trim() !== '',
          `${location}: ${field} is required`
        );
      }
      addError(errors, Number(word.lesson) === lessonId, `${location}: lesson mismatch`);
      addError(
        errors,
        new RegExp(`^L${lessonId}_V\\d+$`, 'u').test(word.id),
        `${location}: ID must belong to lesson ${lessonId}`
      );
      for (const legacyField of ['kanji', 'writing', 'translation']) {
        addError(
          errors,
          !Object.hasOwn(word, legacyField),
          `${location}: legacy field ${legacyField} is forbidden`
        );
      }
      addError(errors, word.writtenForm !== '-', `${location}: "-" is not a written form`);
      addError(errors, !wordIds.has(word.id), `${location}: duplicate ID ${word.id}`);
      wordIds.add(word.id);
      const identity = `${word.writtenForm.normalize('NFKC')}\u0000${word.reading.normalize('NFKC')}`;
      addError(
        errors,
        !identities.has(identity),
        `${location}: late duplicate ${word.writtenForm} / ${word.reading}`
      );
      identities.add(identity);
      words.push(word);
      collectVocabularyRefs(word, location, vocabularyRefs);
      collectGrammarRefs(word, location, grammarRefs);
    }

    const noteIds = new Set();
    const noteTitles = new Set();
    for (const [index, note] of (lesson?.notes || []).entries()) {
      const location = `${relativePath}.lesson.notes[${index}]`;
      addError(errors, /^L\d+_g\d+$/u.test(note.id), `${location}: invalid grammar ID`);
      addError(errors, !noteIds.has(note.id), `${location}: duplicate grammar ID ${note.id}`);
      addError(
        errors,
        !noteTitles.has(String(note.title).trim()),
        `${location}: duplicate grammar title ${note.title}`
      );
      noteIds.add(note.id);
      noteTitles.add(String(note.title).trim());
      grammarIds.add(note.id);
      collectVocabularyRefs(note, location, vocabularyRefs);
      collectGrammarRefs(note, location, grammarRefs);
    }

    const quizPath = `public/data/courses/genki-1/grammar/lesson-${suffix}.json`;
    const quiz = await readJson(quizPath);
    addError(errors, Number(quiz.chapterId) === lessonId, `${quizPath}: wrong chapterId`);
    for (const topic of quiz.topics || []) grammarIds.add(String(topic.id));
    collectVocabularyRefs(quiz, quizPath, vocabularyRefs);
    collectGrammarRefs(quiz, quizPath, grammarRefs);

    const storyPath = `public/data/courses/genki-1/stories/story-${suffix}.json`;
    const story = await readJson(storyPath);
    addError(errors, Number(story.lesson_id) === lessonId, `${storyPath}: wrong lesson_id`);
    for (const [sentenceIndex, sentence] of (story.content || []).entries()) {
      addError(
        errors,
        Array.isArray(sentence.tokens),
        `${storyPath}.content[${sentenceIndex}]: tokens are required`
      );
      for (const [tokenIndex, token] of (sentence.tokens || []).entries()) {
        addError(
          errors,
          typeof token.kanji === 'string' && typeof token.type === 'string',
          `${storyPath}.content[${sentenceIndex}].tokens[${tokenIndex}]: invalid token`
        );
      }
    }
  }

  for (const reference of vocabularyRefs) {
    addError(
      errors,
      wordIds.has(reference.id),
      `${reference.location}: missing vocabulary ${reference.id}`
    );
  }
  for (const reference of grammarRefs) {
    addError(
      errors,
      grammarIds.has(reference.id),
      `${reference.location}: missing grammar ${reference.id}`
    );
  }

  const kanji = await readJson('public/data/courses/genki-1/relations/kanji-availability.json');
  const seenKanji = new Set();
  const kanjiLessons = new Set();
  addError(errors, kanji.schemaVersion === 1, 'genki-kanji-availability: wrong schemaVersion');
  for (const [index, entry] of (kanji.characters || []).entries()) {
    const location = `genki-kanji-availability.characters[${index}]`;
    addError(errors, [...String(entry.kanji)].length === 1, `${location}: invalid kanji`);
    addError(
      errors,
      Number.isInteger(entry.unlockLesson) && entry.unlockLesson >= 3 && entry.unlockLesson <= 12,
      `${location}: invalid unlockLesson`
    );
    addError(errors, !seenKanji.has(entry.kanji), `${location}: duplicate ${entry.kanji}`);
    seenKanji.add(entry.kanji);
    kanjiLessons.add(entry.unlockLesson);
  }
  addError(errors, seenKanji.size === 145, `expected 145 kanji, got ${seenKanji.size}`);
  for (let lessonId = 3; lessonId <= 12; lessonId++) {
    addError(errors, kanjiLessons.has(lessonId), `kanji lesson ${lessonId} is missing`);
  }

  const aliases = await readJson('public/data/courses/genki-1/migrations/vocabulary-aliases.json');
  for (const [oldId, canonicalId] of Object.entries(aliases.aliases || {})) {
    addError(errors, !wordIds.has(oldId), `alias source ${oldId} is still canonical`);
    addError(errors, wordIds.has(canonicalId), `alias ${oldId} targets missing ${canonicalId}`);
  }
  for (const retiredId of aliases.retiredIds || []) {
    addError(errors, !wordIds.has(retiredId), `retired ID ${retiredId} is still canonical`);
    addError(
      errors,
      !Object.hasOwn(aliases.aliases || {}, retiredId),
      `retired ID ${retiredId} is also an alias`
    );
  }

  const contentIndex = await readJson('public/data/courses/genki-1/content-index.json');
  addError(
    errors,
    (contentIndex.chapters || []).length === 12,
    'content-index: expected 12 chapters'
  );
  for (const chapter of contentIndex.chapters || []) {
    addError(
      errors,
      Number(chapter.vocabCount) === lessonCounts.get(Number(chapter.id)),
      `content-index chapter ${chapter.id}: vocabCount mismatch`
    );
  }

  const curated = await readJson('public/data/curated-word-examples.json');
  collectVocabularyRefs(curated, 'public/data/curated-word-examples.json', vocabularyRefs);
  for (const example of curated.examples || []) {
    addError(
      errors,
      wordIds.has(example.targetWordId),
      `curated example ${example.id}: missing ${example.targetWordId}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      lessons: lessonCounts.size,
      words: words.length,
      grammarTopics: grammarIds.size,
      kanji: seenKanji.size,
      aliases: Object.keys(aliases.aliases || {}).length,
      retiredIds: (aliases.retiredIds || []).length,
    },
  };
}

async function main() {
  const result = await validateGenkiData();
  if (!result.valid) {
    result.errors.forEach((error) => console.error(`ERROR ${error}`));
    throw new Error(`GENKI I validation failed with ${result.errors.length} error(s)`);
  }
  console.log(
    `GENKI I valid: ${result.stats.lessons} lessons, ${result.stats.words} words, ${result.stats.grammarTopics} grammar topics, ${result.stats.kanji} kanji`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

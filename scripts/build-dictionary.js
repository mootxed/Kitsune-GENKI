#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  DICTIONARY_CONTENT_VERSION,
  DICTIONARY_SCHEMA_VERSION,
  normalizeDictionaryEntry,
  normalizeCourseVocabularyReference,
} from '../src/dictionary/dictionary-contract.js';
import { dictionaryEntryId, normalizeDictionaryText } from '../src/dictionary/dictionary-id.js';
import { conjugateVerb } from '../src/verb-conjugator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE_ID = 'genki-1';
const COURSE_ROOT = path.join(ROOT, 'public/data/courses', COURSE_ID);
const LESSON_ROOT = path.join(COURSE_ROOT, 'lessons');
const COURSE_ALIASES_PATH = path.join(COURSE_ROOT, 'migrations/vocabulary-aliases.json');
const DICTIONARY_ROOT = path.join(ROOT, 'public/data/dictionary');
const ENTRIES_PATH = path.join(DICTIONARY_ROOT, 'entries.json');
const TOKEN_INDEX_PATH = path.join(DICTIONARY_ROOT, 'token-index.json');
const ALIASES_PATH = path.join(DICTIONARY_ROOT, 'aliases.json');
const MANIFEST_PATH = path.join(DICTIONARY_ROOT, 'manifest.json');
const REPORT_PATH = path.join(DICTIONARY_ROOT, 'report.json');
const GENERATED_ALIASES_PATH = path.join(ROOT, 'src/dictionary/generated-dictionary-aliases.js');

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (fallback !== null && error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values
        .flat(Infinity)
        .map((value) =>
          String(value || '')
            .normalize('NFKC')
            .trim()
        )
        .filter(Boolean)
    ),
  ];
}

function generateTokenForms(raw) {
  const dictionaryForm = normalizeDictionaryText(
    raw.dictionaryForm || raw.writtenForm || raw.kanji || raw.writing || raw.reading
  );
  const reading = normalizeDictionaryText(raw.reading || raw.writing || dictionaryForm);
  const forms = [dictionaryForm, reading, ...(raw.tokenForms || [])];
  if (raw.partOfSpeech === 'verb' && raw.verbClass) {
    try {
      for (const form of conjugateVerb({
        writing: reading,
        kanji: dictionaryForm,
        partOfSpeech: raw.partOfSpeech,
        verbClass: raw.verbClass,
      })) {
        if (!form) continue;
        forms.push(form.kana, form.kanji);
      }
    } catch (error) {
      console.warn(
        `[Dictionary] Token forms limited for ${dictionaryForm}/${reading}: ${error.message}`
      );
    }
  }
  return uniqueStrings(forms);
}

function linguisticShape(raw, dictionaryId = null) {
  return normalizeDictionaryEntry({
    id: dictionaryId || undefined,
    dictionaryForm:
      raw.dictionaryForm || raw.writtenForm || raw.kanji || raw.writing || raw.reading,
    reading: raw.reading || raw.writing || raw.dictionaryForm || raw.writtenForm,
    meanings: raw.meanings || [raw.meaning || raw.translation || raw.courseMeaning],
    partOfSpeech: raw.partOfSpeech || null,
    verbClass: raw.verbClass || null,
    adjectiveClass: raw.adjectiveClass || null,
    transitivity: raw.transitivity || null,
    tokenForms: generateTokenForms(raw),
    semanticTags: uniqueStrings([raw.semanticTags || [], raw.category || '', raw.topic || '']),
    romaji: raw.romaji || '',
    source: raw.source === 'ai' ? 'ai' : 'curated',
    confidence: raw.confidence ?? 1,
    provenance: raw.provenance || {
      sourceType: 'course-package',
      sourceId: COURSE_ID,
      contentVersion: DICTIONARY_CONTENT_VERSION,
    },
  });
}

function compatibleField(left, right) {
  if (left === null || left === undefined) return true;
  if (right === null || right === undefined) return true;
  return left === right;
}

function compatibleLexeme(left, right) {
  return (
    compatibleField(left.partOfSpeech, right.partOfSpeech) &&
    compatibleField(left.verbClass, right.verbClass) &&
    compatibleField(left.adjectiveClass, right.adjectiveClass)
  );
}

function mergeEntries(left, right) {
  return normalizeDictionaryEntry({
    ...left,
    partOfSpeech: left.partOfSpeech || right.partOfSpeech || null,
    verbClass: left.verbClass || right.verbClass || null,
    adjectiveClass: left.adjectiveClass || right.adjectiveClass || null,
    transitivity: left.transitivity || right.transitivity || null,
    meanings: uniqueStrings([left.meanings, right.meanings]),
    tokenForms: uniqueStrings([left.tokenForms, right.tokenForms]),
    semanticTags: uniqueStrings([left.semanticTags, right.semanticTags]),
    romaji: left.romaji || right.romaji,
    confidence: Math.max(left.confidence, right.confidence),
  });
}

function referenceFromWord(word, { courseLessonId, dictionaryId }) {
  const localId = String(word.localId || word.id);
  const referenceId = String(word.id || '').startsWith(`${COURSE_ID}:vocabulary:`)
    ? String(word.id)
    : `${COURSE_ID}:vocabulary:${localId}`;
  return normalizeCourseVocabularyReference({
    id: referenceId,
    localId,
    courseId: COURSE_ID,
    dictionaryId,
    introducedIn: courseLessonId,
    lessonId: courseLessonId,
    chapterId: courseLessonId,
    courseMeaning: word.courseMeaning || word.meaning || word.translation,
    tags: uniqueStrings([word.tags || [], word.category || '', word.topic || '']),
    note: word.note || null,
    contextProduction: word.contextProduction || word.context_production || null,
    acceptedAnswers: word.acceptedAnswers || word.accepted_answers || null,
    particlePatterns: word.particlePatterns || null,
    examples: word.examples || null,
  });
}

async function aliasModule(aliases) {
  const serialized = JSON.stringify(aliases, null, 2);
  return format(
    `/* Generated by scripts/build-dictionary.js. Do not edit manually. */

export const DICTIONARY_ALIASES = Object.freeze(${serialized});

export function resolveGeneratedDictionaryAlias(value) {
  let current = String(value || '');
  const visited = new Set();
  while (DICTIONARY_ALIASES[current] && !visited.has(current)) {
    visited.add(current);
    current = DICTIONARY_ALIASES[current];
  }
  return current;
}
`,
    {
      parser: 'babel',
      singleQuote: true,
      semi: true,
      trailingComma: 'es5',
      tabWidth: 2,
      printWidth: 100,
    }
  );
}

async function collectLessonDocuments() {
  const files = (await readdir(LESSON_ROOT))
    .filter((file) => /^lesson-\d+\.json$/u.test(file))
    .sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      path: path.join(LESSON_ROOT, file),
      document: await readJson(path.join(LESSON_ROOT, file)),
    }))
  );
}

export async function buildDictionary(options = {}) {
  const mode = options.mode || 'write';
  const SOURCE_PATH = path.join(ROOT, 'data-source/dictionary/genki-1-vocabulary.json');
  const sourceDataset = await readJson(SOURCE_PATH, { schemaVersion: 1, entries: [] });
  const courseAliases = await readJson(COURSE_ALIASES_PATH, {
    schemaVersion: 1,
    aliases: {},
    retiredIds: [],
  });
  const lessonDocuments = await collectLessonDocuments();

  const entries = new Map();
  const sourceMap = new Map(); // localId -> entry.id
  const aliases = {};
  const aliasTargets = new Map();
  const references = [];
  const collisions = [];
  let duplicateOccurrences = 0;

  function registerAlias(aliasKey, targetId) {
    if (!aliasKey || !targetId) return;
    if (!aliasTargets.has(aliasKey)) {
      aliasTargets.set(aliasKey, new Set());
    }
    aliasTargets.get(aliasKey).add(targetId);
    aliases[aliasKey] = targetId;
  }

  // 1. Process source dataset entries
  for (const rawWord of sourceDataset.entries || []) {
    const candidate = linguisticShape(rawWord);
    let dictionaryId = candidate.id;

    // Check for kanji retention safety: if rawWord specifies kanji writing, generated dictionaryForm must contain kanji
    if (
      /[\\u4e00-\\u9faf]/.test(rawWord.dictionaryForm || rawWord.writtenForm || '') &&
      !/[\\u4e00-\\u9faf]/.test(candidate.dictionaryForm)
    ) {
      throw new Error(
        `[Dictionary] Kanji lost for ${rawWord.localId}: expected ${rawWord.dictionaryForm}, got ${candidate.dictionaryForm}`
      );
    }

    let entry = entries.get(dictionaryId);
    if (entry) {
      if (compatibleLexeme(entry, candidate)) {
        entry = mergeEntries(entry, candidate);
        duplicateOccurrences++;
      } else {
        const disambiguator = rawWord.senseId || candidate.partOfSpeech || 'lexeme';
        dictionaryId = dictionaryEntryId(candidate, { disambiguator });
        entry = linguisticShape(rawWord, dictionaryId);
        collisions.push({
          baseId: candidate.id,
          resolvedId: dictionaryId,
          reason: 'part-of-speech-or-class',
          referenceId: rawWord.localId,
        });
      }
    } else {
      entry = candidate;
    }

    entries.set(dictionaryId, entry);
    if (rawWord.localId) {
      sourceMap.set(rawWord.localId, dictionaryId);
    }

    // Global aliases: legacy lexeme ID, old hiragana ID, and dictionaryId itself
    if (rawWord.lexemeId && rawWord.lexemeId !== '__none' && rawWord.lexemeId !== dictionaryId) {
      registerAlias(rawWord.lexemeId, dictionaryId);
    }
    if (rawWord.writtenForm && rawWord.writtenForm !== candidate.dictionaryForm) {
      const legacyHiraganaId = `jp-word:${normalizeDictionaryText(rawWord.writtenForm)}:${candidate.reading}`;
      if (legacyHiraganaId !== dictionaryId) {
        registerAlias(legacyHiraganaId, dictionaryId);
      }
    }
  }

  // 2. Process lesson documents and build course references
  for (const lessonRecord of lessonDocuments) {
    const lesson = lessonRecord.document.lesson || lessonRecord.document;
    const lessonNumber = Number(lesson.lesson_id ?? lesson.localId ?? lesson.id);
    const courseLessonId = `${COURSE_ID}:lesson-${lessonNumber}`;
    const sourceWords = lesson.vocabulary || lesson.words || [];
    const nextReferences = [];

    for (const word of sourceWords) {
      const localId = String(word.localId || word.id).replace(/^genki-1:vocabulary:/, '');
      const dictionaryId = sourceMap.get(localId) || sourceMap.get(word.id) || word.dictionaryId;
      if (!dictionaryId || !entries.has(dictionaryId)) {
        throw new Error(
          `[Dictionary] ${lessonRecord.file}/${word.id} references missing dictionary ID (${dictionaryId})`
        );
      }

      const reference = referenceFromWord(word, {
        courseLessonId,
        dictionaryId,
      });
      nextReferences.push(reference);
      references.push(reference);

      // Safe global alias: namespaced full course reference ID -> dictionaryId
      registerAlias(reference.id, dictionaryId);
    }

    lesson.vocabulary = nextReferences;
    delete lesson.words;
  }

  // 3. Process course aliases (retired/legacy IDs to current dictionary IDs)
  for (const [legacyLocalId, canonicalLocalId] of Object.entries(courseAliases.aliases || {})) {
    const namespacedLegacy = `${COURSE_ID}:vocabulary:${legacyLocalId}`;
    const target =
      sourceMap.get(canonicalLocalId) ||
      aliases[`${COURSE_ID}:vocabulary:${canonicalLocalId}`] ||
      aliases[canonicalLocalId];
    if (!target) {
      throw new Error(
        `[Dictionary] Course alias ${legacyLocalId} targets unknown ${canonicalLocalId}`
      );
    }
    registerAlias(namespacedLegacy, target);
  }

  const aliasCollisions = [];
  for (const [aliasKey, targets] of aliasTargets.entries()) {
    if (targets.size > 1) {
      aliasCollisions.push({ aliasKey, targets: Array.from(targets) });
    }
  }
  if (aliasCollisions.length > 0) {
    const details = aliasCollisions
      .map((c) => `  "${c.aliasKey}" -> [${c.targets.join(', ')}]`)
      .join('\n');
    throw new Error(
      `[Dictionary] Alias collision error: single legacy alias registered for multiple canonical dictionary IDs:\n${details}`
    );
  }

  const sortedEntries = [...entries.values()].sort((left, right) =>
    left.id.localeCompare(right.id, 'ja')
  );
  const sortedAliases = Object.fromEntries(
    Object.entries(aliases).sort(([left], [right]) => left.localeCompare(right, 'ja'))
  );
  const tokenMap = new Map();
  for (const entry of sortedEntries) {
    for (const token of entry.tokenForms) {
      const normalized = normalizeDictionaryText(token);
      if (!normalized) continue;
      if (!tokenMap.has(normalized)) tokenMap.set(normalized, new Set());
      tokenMap.get(normalized).add(entry.id);
    }
  }
  const tokens = Object.fromEntries(
    [...tokenMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'ja'))
      .map(([token, candidateIds]) => [
        token,
        [...candidateIds].sort((left, right) => left.localeCompare(right, 'ja')),
      ])
  );

  const report = {
    schemaVersion: 1,
    entries: sortedEntries.length,
    courseReferences: references.length,
    duplicateOccurrences,
    collisions,
    aliases: Object.keys(sortedAliases).length,
    tokenForms: Object.keys(tokens).length,
    retiredCourseIds: (courseAliases.retiredIds || []).length,
  };
  const outputs = new Map([
    [
      ENTRIES_PATH,
      stableJson({ schemaVersion: DICTIONARY_SCHEMA_VERSION, entries: sortedEntries }),
    ],
    [TOKEN_INDEX_PATH, stableJson({ schemaVersion: DICTIONARY_SCHEMA_VERSION, tokens })],
    [
      ALIASES_PATH,
      stableJson({ schemaVersion: DICTIONARY_SCHEMA_VERSION, aliases: sortedAliases }),
    ],
    [
      MANIFEST_PATH,
      stableJson({
        schemaVersion: DICTIONARY_SCHEMA_VERSION,
        contentVersion: DICTIONARY_CONTENT_VERSION,
        entries: './entries.json',
        tokenIndex: './token-index.json',
        aliases: './aliases.json',
      }),
    ],
    [REPORT_PATH, stableJson(report)],
    [GENERATED_ALIASES_PATH, await aliasModule(sortedAliases)],
    ...lessonDocuments.map((record) => [record.path, stableJson(record.document)]),
  ]);

  let differences = 0;
  for (const [filePath, content] of outputs) {
    let current = null;
    try {
      current = await readFile(filePath, 'utf8');
    } catch {
      // New generated file.
    }
    if (current === content) continue;
    differences++;
    if (mode === 'write') {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
      console.log(`updated ${path.relative(ROOT, filePath)}`);
    } else {
      console.error(`outdated ${path.relative(ROOT, filePath)}`);
    }
  }
  if (mode === 'check' && differences > 0) {
    throw new Error(`${differences} generated dictionary artifact(s) are outdated`);
  }
  return { ...report, differences };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes('--check') ? 'check' : 'write';
  buildDictionary({ mode })
    .then((result) => {
      console.log(
        `Dictionary built: ${result.entries} entries, ${result.courseReferences} references, ${result.aliases} aliases, ${result.tokenForms} token forms`
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

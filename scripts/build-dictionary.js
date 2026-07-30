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

function compatibleLexeme(left, right) {
  return (
    left.partOfSpeech === right.partOfSpeech &&
    left.verbClass === right.verbClass &&
    left.adjectiveClass === right.adjectiveClass
  );
}

function mergeEntries(left, right) {
  return normalizeDictionaryEntry({
    ...left,
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
  const existingDocument = await readJson(ENTRIES_PATH, { schemaVersion: 1, entries: [] });
  const existingAliasDocument = await readJson(ALIASES_PATH, { schemaVersion: 1, aliases: {} });
  const existingReport = await readJson(REPORT_PATH, {
    duplicateOccurrences: 0,
    collisions: [],
  });
  const existingEntries = new Map(
    (existingDocument.entries || []).map((entry) => [entry.id, normalizeDictionaryEntry(entry)])
  );
  const courseAliases = await readJson(COURSE_ALIASES_PATH, {
    schemaVersion: 1,
    aliases: {},
    retiredIds: [],
  });
  const lessonDocuments = await collectLessonDocuments();
  const referenceOnly = lessonDocuments.every((record) =>
    (record.document.lesson?.vocabulary || []).every(
      (word) => word.dictionaryId && !word.writtenForm && !word.dictionaryForm
    )
  );
  const entries = new Map(
    [...existingEntries].filter(([, entry]) => entry.provenance?.sourceId !== COURSE_ID)
  );
  const aliases = { ...(existingAliasDocument.aliases || {}) };
  const references = [];
  const collisions = referenceOnly ? [...(existingReport.collisions || [])] : [];
  let duplicateOccurrences = referenceOnly ? Number(existingReport.duplicateOccurrences) || 0 : 0;

  for (const lessonRecord of lessonDocuments) {
    const lesson = lessonRecord.document.lesson || lessonRecord.document;
    const lessonNumber = Number(lesson.lesson_id ?? lesson.localId ?? lesson.id);
    const courseLessonId = `${COURSE_ID}:lesson-${lessonNumber}`;
    const sourceWords = lesson.vocabulary || lesson.words || [];
    const nextReferences = [];

    for (const word of sourceWords) {
      let dictionaryId = word.dictionaryId || null;
      let entry = dictionaryId ? existingEntries.get(dictionaryId) : null;
      if (!entry) {
        if (!word.writtenForm && !word.dictionaryForm && !word.kanji && !word.writing) {
          throw new Error(
            `[Dictionary] ${lessonRecord.file}/${word.id} references missing ${dictionaryId}`
          );
        }
        const candidate = linguisticShape(word);
        dictionaryId = candidate.id;
        const current = entries.get(dictionaryId);
        if (current) {
          if (compatibleLexeme(current, candidate)) {
            entry = mergeEntries(current, candidate);
            duplicateOccurrences++;
          } else {
            const disambiguator = word.senseId || candidate.partOfSpeech || 'lexeme';
            dictionaryId = dictionaryEntryId(candidate, { disambiguator });
            entry = linguisticShape(word, dictionaryId);
            collisions.push({
              baseId: candidate.id,
              resolvedId: dictionaryId,
              reason: 'part-of-speech-or-class',
              referenceId: word.id,
            });
          }
        } else {
          entry = candidate;
        }
      }
      entries.set(dictionaryId, entry);
      const reference = referenceFromWord(word, {
        courseLessonId,
        dictionaryId,
      });
      nextReferences.push(reference);
      references.push(reference);

      const legacyIds = uniqueStrings([
        word.localId,
        String(word.id || '').startsWith(`${COURSE_ID}:vocabulary:`) ? '' : word.id,
        word.lexemeId && word.lexemeId !== '__none' ? word.lexemeId : '',
        reference.id,
      ]);
      for (const alias of legacyIds) {
        if (alias !== dictionaryId) aliases[alias] = dictionaryId;
      }
    }

    lesson.vocabulary = nextReferences;
    delete lesson.words;
  }

  for (const [legacyLocalId, canonicalLocalId] of Object.entries(courseAliases.aliases || {})) {
    const target =
      aliases[canonicalLocalId] || aliases[`${COURSE_ID}:vocabulary:${canonicalLocalId}`];
    if (!target) {
      throw new Error(
        `[Dictionary] Course alias ${legacyLocalId} targets unknown ${canonicalLocalId}`
      );
    }
    aliases[legacyLocalId] = target;
    aliases[`${COURSE_ID}:vocabulary:${legacyLocalId}`] = target;
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

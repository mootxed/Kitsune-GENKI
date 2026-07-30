#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CourseVocabularyReferenceSchema,
  DictionaryEntrySchema,
  DictionaryManifestSchema,
} from '../src/dictionary/dictionary-contract.js';
import { normalizeDictionaryText } from '../src/dictionary/dictionary-id.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DICTIONARY_ROOT = path.join(ROOT, 'public/data/dictionary');
const LESSON_ROOT = path.join(ROOT, 'public/data/courses/genki-1/lessons');
const FORBIDDEN_GLOBAL_FIELDS = [
  'courseId',
  'introducedIn',
  'lessonIds',
  'courseMeaning',
  'lessonId',
  'chapterId',
  'progress',
];
const FORBIDDEN_REFERENCE_FIELDS = [
  'writtenForm',
  'reading',
  'meaning',
  'translation',
  'kanji',
  'writing',
  'meanings',
  'partOfSpeech',
  'verbClass',
  'adjectiveClass',
  'transitivity',
  'tokenForms',
  'lexemeId',
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function issueMessage(error) {
  return (
    error?.issues?.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') ||
    error?.message ||
    String(error)
  );
}

function resolveAlias(aliases, value) {
  let current = String(value || '');
  const visited = new Set();
  while (aliases[current]) {
    if (visited.has(current)) return { value: current, cycle: [...visited, current] };
    visited.add(current);
    current = aliases[current];
  }
  return { value: current, cycle: null };
}

export async function validateDictionary() {
  const errors = [];
  const manifest = await readJson(path.join(DICTIONARY_ROOT, 'manifest.json'));
  const parsedManifest = DictionaryManifestSchema.safeParse(manifest);
  if (!parsedManifest.success) {
    errors.push(`manifest.json: ${issueMessage(parsedManifest.error)}`);
  }
  const entriesDocument = await readJson(path.join(DICTIONARY_ROOT, 'entries.json'));
  const tokenDocument = await readJson(path.join(DICTIONARY_ROOT, 'token-index.json'));
  const aliasDocument = await readJson(path.join(DICTIONARY_ROOT, 'aliases.json'));
  const report = await readJson(path.join(DICTIONARY_ROOT, 'report.json'));
  const entries = entriesDocument.entries || [];
  const aliases = aliasDocument.aliases || {};
  const tokens = tokenDocument.tokens || {};
  const entryById = new Map();

  for (const [index, raw] of entries.entries()) {
    const location = `entries.json.entries[${index}]`;
    const parsed = DictionaryEntrySchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`${location}: ${issueMessage(parsed.error)}`);
      continue;
    }
    const entry = parsed.data;
    if (entryById.has(entry.id)) errors.push(`${location}: duplicate ID ${entry.id}`);
    entryById.set(entry.id, entry);
    for (const field of FORBIDDEN_GLOBAL_FIELDS) {
      if (Object.hasOwn(raw, field)) errors.push(`${location}: forbidden course field ${field}`);
    }
  }

  for (const [alias, target] of Object.entries(aliases)) {
    const resolved = resolveAlias(aliases, alias);
    if (resolved.cycle) errors.push(`aliases.json: cycle ${resolved.cycle.join(' -> ')}`);
    if (!entryById.has(resolved.value)) {
      errors.push(`aliases.json: ${alias} targets unknown ${target}`);
    }
  }

  const expectedTokens = new Map();
  for (const entry of entries) {
    for (const form of entry.tokenForms || []) {
      const token = normalizeDictionaryText(form);
      if (!expectedTokens.has(token)) expectedTokens.set(token, new Set());
      expectedTokens.get(token).add(entry.id);
    }
  }
  for (const [token, candidates] of Object.entries(tokens)) {
    const expected = [...(expectedTokens.get(token) || [])].sort();
    const actual = [...candidates].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`token-index.json: invalid candidates for ${token}`);
    }
    if (new Set(candidates).size !== candidates.length) {
      errors.push(`token-index.json: duplicate candidate for ${token}`);
    }
    for (const id of candidates) {
      if (!entryById.has(id)) errors.push(`token-index.json: ${token} references unknown ${id}`);
    }
  }
  for (const token of expectedTokens.keys()) {
    if (!Object.hasOwn(tokens, token)) errors.push(`token-index.json: missing ${token}`);
  }

  const lessonFiles = (await readdir(LESSON_ROOT))
    .filter((file) => /^lesson-\d+\.json$/u.test(file))
    .sort();
  const referenceIds = new Set();
  let referenceCount = 0;
  for (const file of lessonFiles) {
    const document = await readJson(path.join(LESSON_ROOT, file));
    const references = document.lesson?.vocabulary || [];
    const lessonReferenceIds = new Set();
    for (const [index, raw] of references.entries()) {
      const location = `${file}.lesson.vocabulary[${index}]`;
      const parsed = CourseVocabularyReferenceSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push(`${location}: ${issueMessage(parsed.error)}`);
        continue;
      }
      const reference = parsed.data;
      referenceCount++;
      if (lessonReferenceIds.has(reference.id)) {
        errors.push(`${location}: duplicate lesson reference ${reference.id}`);
      }
      lessonReferenceIds.add(reference.id);
      if (referenceIds.has(reference.id)) {
        errors.push(`${location}: duplicate course reference ${reference.id}`);
      }
      referenceIds.add(reference.id);
      if (!entryById.has(reference.dictionaryId)) {
        errors.push(`${location}: missing DictionaryEntry ${reference.dictionaryId}`);
      }
      for (const field of FORBIDDEN_REFERENCE_FIELDS) {
        if (Object.hasOwn(raw, field)) {
          errors.push(`${location}: duplicated global field ${field}`);
        }
      }
    }
  }

  if (referenceCount !== report.courseReferences) {
    errors.push(
      `report.json: expected ${report.courseReferences} references, validated ${referenceCount}`
    );
  }
  if (entries.length !== report.entries) {
    errors.push(`report.json: expected ${report.entries} entries, validated ${entries.length}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      entries: entries.length,
      references: referenceCount,
      aliases: Object.keys(aliases).length,
      tokenForms: Object.keys(tokens).length,
      duplicateOccurrences: report.duplicateOccurrences || 0,
      collisions: (report.collisions || []).length,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateDictionary()
    .then((result) => {
      if (!result.valid) {
        result.errors.forEach((error) => console.error(`ERROR ${error}`));
        throw new Error(`Dictionary validation failed with ${result.errors.length} error(s)`);
      }
      console.log(
        `Dictionary valid: ${result.stats.entries} entries, ${result.stats.references} GENKI I references, ${result.stats.aliases} aliases, ${result.stats.tokenForms} token forms, ${result.stats.collisions} collisions`
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

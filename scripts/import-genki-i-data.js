#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readXlsxRows } from './lib/xlsx.js';
import { normalizeWord } from '../src/normalize-word.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LESSON_DIRECTORY = path.join(ROOT, 'public/data/lessons');
const ALIASES_PATH = path.join(ROOT, 'public/data/genki-vocabulary-aliases.json');
const KANJI_PATH = path.join(ROOT, 'public/data/genki-kanji-availability.json');
const ID_MAP_MODULE_PATH = path.join(ROOT, 'src/genki-vocabulary-id-map.js');
const CONTENT_INDEX_PATH = path.join(ROOT, 'public/data/content-index.json');
const CURATED_EXAMPLES_PATH = path.join(ROOT, 'public/data/curated-word-examples.json');
const QUIZ_DIRECTORY = path.join(ROOT, 'public/data/grammar-quizzes');
const REPORT_PATH = path.join(ROOT, 'reports/genki-1-data-audit.md');

const REQUIRED_WORD_HEADERS = ['Урок', 'Кандзи', 'Кана', 'Перевод'];
const REQUIRED_KANJI_HEADERS = ['Кандзи', 'Урок'];
const MANUAL_ID_MATCHES = new Map([
  // Obvious typo in the old lesson JSON. The XLSX value is authoritative.
  ['10\u0000野球\u0000やきゅう', 'L10_V011'],
  // The old JSON reused this ID for ～後 and an erroneous ～語 row. It must not
  // be captured by the unrelated lesson-1 language suffix 〜ご.
  ['10\u0000〜後\u0000〜ご', 'L10_V055'],
]);
const MANUAL_LEGACY_ALIASES = Object.freeze({
  L1_V022: 'L1_V026', // ～先生 -> せんせい
  L1_V053: 'L1_V073', // 何 (なん / なに) -> source row なに
  L1_V055: 'L1_V071', // 電話番号 -> source row ばんごう
  L2_V031: 'L2_V058', // ペン -> source spelling ぺん
});

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/[～~]/gu, '〜');
}

function comparableForm(value) {
  return normalizeText(value)
    .replace(/\([^)]*\)/gu, '')
    .replace(/（[^）]*）/gu, '')
    .replace(/\s+/gu, '')
    .trim();
}

function parseLesson(value, context) {
  const match = normalizeText(value).match(/\d+/u);
  const lesson = match ? Number(match[0]) : 0;
  if (!Number.isInteger(lesson) || lesson < 1 || lesson > 12) {
    throw new Error(`${context}: expected lesson 1-12, got "${value}"`);
  }
  return lesson;
}

function assertHeaders(actual, expected, workbookName) {
  for (let index = 0; index < expected.length; index++) {
    if (normalizeText(actual[index]) !== expected[index]) {
      throw new Error(
        `${workbookName}: column ${index + 1} must be "${expected[index]}", got "${actual[index] ?? ''}"`
      );
    }
  }
}

export function parseWordWorkbook(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('Vocabulary XLSX is empty');
  assertHeaders(rows[0] || [], REQUIRED_WORD_HEADERS, 'Vocabulary XLSX');

  const words = [];
  let lesson = 0;
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const sourceRow = rowIndex + 1;
    const row = [...(rows[rowIndex] || []), '', '', '', ''];
    if (normalizeText(row[0])) lesson = parseLesson(row[0], `Vocabulary XLSX row ${sourceRow}`);

    const rawWrittenForm = normalizeText(row[1]);
    const reading = normalizeText(row[2]);
    const meaning = normalizeText(row[3]);
    if (!rawWrittenForm && !reading && !meaning) continue;
    if (!lesson) throw new Error(`Vocabulary XLSX row ${sourceRow}: lesson block is missing`);

    const writtenForm = ['', '-', '−', '—'].includes(rawWrittenForm) ? reading : rawWrittenForm;
    if (!writtenForm || !reading || !meaning) {
      throw new Error(
        `Vocabulary XLSX row ${sourceRow}: written form, reading and meaning are required`
      );
    }

    words.push({ lesson, writtenForm, reading, meaning, sourceRow, rawWrittenForm });
  }

  const lessonCounts = new Map();
  const identities = new Map();
  for (const word of words) {
    lessonCounts.set(word.lesson, (lessonCounts.get(word.lesson) || 0) + 1);
    const identity = `${word.writtenForm}\u0000${word.reading}`;
    if (identities.has(identity)) {
      const earlier = identities.get(identity);
      throw new Error(
        `Vocabulary XLSX duplicate at rows ${earlier.sourceRow} and ${word.sourceRow}: ${word.writtenForm} / ${word.reading}`
      );
    }
    identities.set(identity, word);
  }
  for (let lessonId = 1; lessonId <= 12; lessonId++) {
    if (!lessonCounts.has(lessonId))
      throw new Error(`Vocabulary XLSX: lesson ${lessonId} is missing`);
  }
  return words;
}

export function parseKanjiWorkbook(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('Kanji XLSX is empty');
  assertHeaders(rows[0] || [], REQUIRED_KANJI_HEADERS, 'Kanji XLSX');
  const characters = [];
  const seen = new Map();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const sourceRow = rowIndex + 1;
    const row = [...(rows[rowIndex] || []), ''];
    const kanji = normalizeText(row[0]);
    const rawLesson = normalizeText(row[1]);
    if (!kanji && !rawLesson) continue;
    const unlockLesson = parseLesson(rawLesson, `Kanji XLSX row ${sourceRow}`);
    if ([...kanji].length !== 1 || !/\p{Script=Han}/u.test(kanji)) {
      throw new Error(`Kanji XLSX row ${sourceRow}: expected one kanji, got "${kanji}"`);
    }
    if (unlockLesson < 3) {
      throw new Error(`Kanji XLSX row ${sourceRow}: unlock lesson must be 3-12`);
    }
    if (seen.has(kanji)) {
      throw new Error(
        `Kanji XLSX duplicate "${kanji}" at rows ${seen.get(kanji)} and ${sourceRow}`
      );
    }
    seen.set(kanji, sourceRow);
    characters.push({ kanji, unlockLesson, sourceRow });
  }
  for (let lessonId = 3; lessonId <= 12; lessonId++) {
    if (!characters.some((entry) => entry.unlockLesson === lessonId)) {
      throw new Error(`Kanji XLSX: lesson ${lessonId} is missing`);
    }
  }
  return characters;
}

function legacyWord(raw, lesson, position, file) {
  return {
    raw,
    lesson,
    position,
    file,
    id: normalizeText(raw.id),
    writtenForm: normalizeText(raw.writtenForm || raw.kanji || raw.reading || raw.writing),
    reading: normalizeText(raw.reading || raw.writing || raw.writtenForm || raw.kanji),
    meaning: normalizeText(raw.meaning || raw.translation),
  };
}

function scoreCandidate(source, candidate) {
  const sameLesson = source.lesson === candidate.lesson ? 20 : 0;
  if (source.writtenForm === candidate.writtenForm && source.reading === candidate.reading) {
    return 140 + sameLesson;
  }
  if (source.writtenForm === candidate.writtenForm) return 120 + sameLesson;
  if (
    source.reading === candidate.reading &&
    (source.writtenForm === source.reading ||
      candidate.writtenForm === candidate.reading ||
      source.lesson === candidate.lesson)
  ) {
    return 105 + sameLesson;
  }
  if (
    source.lesson === candidate.lesson &&
    comparableForm(source.reading) === comparableForm(candidate.reading)
  ) {
    return 90;
  }
  if (
    source.lesson === candidate.lesson &&
    comparableForm(source.writtenForm) === comparableForm(candidate.writtenForm)
  ) {
    return 85;
  }
  return 0;
}

function isEquivalentCandidate(source, candidate, score) {
  if (score >= 140) return true;
  if (source.writtenForm === candidate.writtenForm && score >= 120) return true;
  if (
    source.reading === candidate.reading &&
    (source.writtenForm === source.reading ||
      candidate.writtenForm === candidate.reading ||
      source.lesson === candidate.lesson)
  ) {
    return true;
  }
  return source.lesson === candidate.lesson && score >= 85;
}

function numericIdIndex(id, lesson) {
  const match = id.match(new RegExp(`^L0?${lesson}_V(\\d+)$`, 'u'));
  return match ? Number(match[1]) : 0;
}

function mergeUniqueArray(values) {
  const seen = new Set();
  const result = [];
  for (const value of values.flat()) {
    const key = JSON.stringify(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function canonicalGrammarId(value) {
  const text = normalizeText(value);
  const match = text.match(/^L0?(\d+)_g0?(\d+)$/u);
  return match ? `L${Number(match[1])}_g${Number(match[2])}` : text;
}

function canonicalProductionTasks(candidates, canonicalId) {
  const tasks = [];
  for (const candidate of candidates) {
    const source = candidate.raw.contextProduction || candidate.raw.context_production;
    for (const task of Array.isArray(source) ? source : source ? [source] : []) {
      tasks.push({
        ...task,
        focusItemId: canonicalId,
        grammarTopicIds: Array.isArray(task.grammarTopicIds)
          ? task.grammarTopicIds.map(canonicalGrammarId)
          : [],
      });
    }
  }
  const merged = mergeUniqueArray(tasks);
  if (merged.length === 0) return null;
  return merged.length === 1 ? merged[0] : merged;
}

function canonicalWord(source, id, candidates) {
  const primary = candidates[0]?.raw || {};
  const excluded = new Set([
    'id',
    'lesson',
    'kanji',
    'writing',
    'translation',
    'writtenForm',
    'reading',
    'meaning',
    'contextProduction',
    'context_production',
    'acceptedAnswers',
    'accepted_answers',
    'examples',
  ]);
  const extras = Object.fromEntries(
    Object.entries(primary).filter(([key, value]) => !excluded.has(key) && value != null)
  );
  const normalizedLegacy = normalizeWord(primary, source.lesson);
  for (const key of [
    'category',
    'romaji',
    'topic',
    'partOfSpeech',
    'verbClass',
    'adjectiveClass',
    'lexemeId',
    'semanticTags',
    'particlePatterns',
    'transitivity',
    'note',
  ]) {
    const value = normalizedLegacy?.[key];
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    if (value !== null && value !== undefined && value !== '' && !isEmptyArray) {
      extras[key] = value;
    }
  }
  const examples = mergeUniqueArray(
    candidates.map((candidate) =>
      Array.isArray(candidate.raw.examples) ? candidate.raw.examples : []
    )
  );
  const acceptedAnswers = mergeUniqueArray(
    candidates.map((candidate) => {
      const answers = candidate.raw.acceptedAnswers || candidate.raw.accepted_answers;
      return Array.isArray(answers) ? answers : [];
    })
  );
  const contextProduction = canonicalProductionTasks(candidates, id);

  return {
    id,
    lesson: source.lesson,
    writtenForm: source.writtenForm,
    reading: source.reading,
    meaning: source.meaning,
    ...extras,
    ...(examples.length > 0 ? { examples } : {}),
    ...(acceptedAnswers.length > 0 ? { acceptedAnswers } : {}),
    ...(contextProduction ? { contextProduction } : {}),
  };
}

function normalizeGrammarNotes(notes, lessonId) {
  return (Array.isArray(notes) ? notes : []).map((note, index) => {
    const noteId = Number(note.noteId ?? note.note_id ?? index + 1);
    const id = canonicalGrammarId(note.id || `L${lessonId}_g${noteId}`);
    const rest = { ...note };
    delete rest.note_id;
    return { id, noteId, ...rest };
  });
}

function replaceVocabularyReferences(value, aliases, retiredIds = new Set()) {
  if (Array.isArray(value)) {
    return value.map((entry) => replaceVocabularyReferences(entry, aliases, retiredIds));
  }
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (['focusItemId', 'targetWordId', 'itemId'].includes(key) && typeof entry === 'string') {
      result[key] = aliases[entry] || entry;
    } else if (
      ['requiredVocabularyIds', 'vocabularyRefs', 'itemIds', 'wordIds'].includes(key) &&
      Array.isArray(entry)
    ) {
      result[key] = [
        ...new Set(entry.map((id) => aliases[id] || id).filter((id) => !retiredIds.has(id))),
      ];
    } else if (key === 'grammarTopicIds' && Array.isArray(entry)) {
      result[key] = entry.map(canonicalGrammarId);
    } else {
      result[key] = replaceVocabularyReferences(entry, aliases, retiredIds);
    }
  }
  return result;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function loadBaseline(directory = LESSON_DIRECTORY) {
  const lessonDocs = [];
  const oldWords = [];
  for (let lessonId = 1; lessonId <= 12; lessonId++) {
    const file = `lesson-${String(lessonId).padStart(2, '0')}.json`;
    const document = await readJson(path.join(directory, file));
    const lesson = document.lesson || document;
    lessonDocs.push({ file, document, lesson });
    const vocabulary = lesson.vocabulary || lesson.words || [];
    vocabulary.forEach((word, index) =>
      oldWords.push(legacyWord(word, lessonId, index + 1, `public/data/lessons/${file}`))
    );
  }
  return { lessonDocs, oldWords };
}

function buildVocabulary(sourceWords, oldWords) {
  const reservedIds = new Map(
    [...MANUAL_ID_MATCHES.entries()].map(([sourceKey, id]) => [id, sourceKey])
  );
  const usedCanonicalIds = new Map();
  const aliases = {};
  const matches = [];
  const maxByLesson = new Map();
  for (let lesson = 1; lesson <= 12; lesson++) {
    maxByLesson.set(
      lesson,
      Math.max(0, ...oldWords.map((word) => numericIdIndex(word.id, lesson)))
    );
  }

  for (const source of sourceWords) {
    const sourceKey = `${source.lesson}\u0000${source.writtenForm}\u0000${source.reading}`;
    const manualId = MANUAL_ID_MATCHES.get(sourceKey);
    const scored = oldWords
      .map((candidate) => ({ candidate, score: scoreCandidate(source, candidate) }))
      .filter(({ score, candidate }) => score > 0 || candidate.id === manualId)
      .map(({ candidate, score }) => ({
        candidate,
        score: candidate.id === manualId ? 1000 : score,
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.candidate.lesson - b.candidate.lesson ||
          a.candidate.position - b.candidate.position
      );

    let primary = scored.find(
      ({ candidate }) =>
        candidate.id &&
        numericIdIndex(candidate.id, source.lesson) > 0 &&
        !usedCanonicalIds.has(candidate.id) &&
        (!reservedIds.has(candidate.id) || reservedIds.get(candidate.id) === sourceKey)
    )?.candidate;
    let id = primary?.id;
    if (!id) {
      const next = (maxByLesson.get(source.lesson) || 0) + 1;
      maxByLesson.set(source.lesson, next);
      id = `L${source.lesson}_V${String(next).padStart(3, '0')}`;
    }
    usedCanonicalIds.set(id, source);

    const equivalent = scored
      .filter(({ candidate, score }) => isEquivalentCandidate(source, candidate, score))
      .map(({ candidate }) => candidate)
      .filter(
        (candidate) =>
          candidate.id === id ||
          !usedCanonicalIds.has(candidate.id) ||
          usedCanonicalIds.get(candidate.id) === source
      );
    const candidates = [
      ...(primary ? [primary] : []),
      ...equivalent.filter((candidate) => candidate !== primary),
    ];
    for (const candidate of candidates) {
      if (candidate.id && candidate.id !== id && !aliases[candidate.id]) {
        aliases[candidate.id] = id;
      }
    }
    matches.push({ source, id, candidates, scored });
  }

  const canonicalIds = new Set(matches.map((match) => match.id));
  const mappedOldIds = new Set([...canonicalIds, ...Object.keys(aliases)]);
  const retiredIds = [...new Set(oldWords.map((word) => word.id))]
    .filter((id) => id && !mappedOldIds.has(id))
    .sort();
  const words = matches.map(({ source, id, candidates }) => canonicalWord(source, id, candidates));
  return { words, aliases, retiredIds, matches };
}

function buildReport({ sourceWords, kanji, oldWords, aliases, retiredIds, matches, duplicateIds }) {
  const oldIdentityGroups = new Map();
  for (const word of oldWords) {
    const key = `${word.writtenForm}\u0000${word.reading}`;
    if (!oldIdentityGroups.has(key)) oldIdentityGroups.set(key, []);
    oldIdentityGroups.get(key).push(word);
  }
  const duplicateLexemes = [...oldIdentityGroups.values()].filter((group) => group.length > 1);
  const newIds = matches.filter((match) => match.candidates.length === 0);
  const moved = matches.filter(
    (match) => match.candidates[0] && match.candidates[0].lesson !== match.source.lesson
  );

  const lines = [
    '# Аудит данных GENKI I',
    '',
    'Отчёт сгенерирован `scripts/import-genki-i-data.js`. XLSX используются только на этапе импорта; приложение читает JSON.',
    '',
    '## Краткий итог',
    '',
    `- Старых словарных строк: ${oldWords.length}.`,
    `- Канонических строк из XLSX: ${sourceWords.length}.`,
    `- Точных дублирующихся лексем в старых JSON: ${duplicateLexemes.length} групп (${duplicateLexemes.reduce((sum, group) => sum + group.length, 0)} строк).`,
    `- Старых ID, перенаправленных на канонический ID: ${Object.keys(aliases).length}.`,
    `- Новых слов, для которых выдан ранее не использовавшийся ID: ${newIds.length}.`,
    `- Старых ID вне таблицы, прогресс которых переносится в архив: ${retiredIds.length}.`,
    `- Кандзи в отдельной таблице доступности: ${kanji.length}, уроки 3–12.`,
    '',
    '## Найденные архитектурные проблемы',
    '',
    '- Словарные JSON использовали поля `kanji`, `writing`, `translation` и не содержали явного номера урока в записи.',
    '- Runtime-нормализация поддерживала конкурирующие массивы `words` и `vocabulary`.',
    '- Открытие кандзи не имело отдельного канонического набора данных и динамического правила показа каны.',
    '- В четырёх случаях один ID был назначен двум разным строкам, поэтому прогресс по такому ID исторически неоднозначен.',
    '- Грамматические ссылки смешивали форматы `L01_g01` и `L1_g1`.',
    '- Истории токенизированы независимо и не имеют надёжных ссылок на словарные ID; автоматическое связывание не выполнялось.',
    '- Документация схемы описывала несуществующий формат `genki1_l*_v*` и расходилась с runtime.',
    '',
    '## Единый формат',
    '',
    'Обязательные поля каждой записи: `id`, `lesson`, `writtenForm`, `reading`, `meaning`. Дополнительные проверенные метаданные сохраняются. Legacy-поля создаются только runtime-адаптером и больше не являются источником данных.',
    '',
    '## Старые поздние дубли',
    '',
    '| Написание | Чтение | Старые ID и уроки |',
    '|---|---|---|',
    ...duplicateLexemes.map((group) => {
      const first = group[0];
      return `| ${first.writtenForm} | ${first.reading} | ${group.map((word) => `${word.id} (урок ${word.lesson})`).join(', ')} |`;
    }),
    '',
    '## Конфликты повторно использованных ID',
    '',
    '| ID | Старые значения | Действие |',
    '|---|---|---|',
    ...duplicateIds.map(
      ([id, words]) =>
        `| ${id} | ${words.map((word) => `${word.writtenForm} / ${word.reading}`).join('; ')} | ID сохраняется только за однозначно сопоставленной канонической записью; остальные записи получают новый ID или архивируются. |`
    ),
    '',
    '## Перемещения между уроками',
    '',
    ...(moved.length
      ? moved.map(
          ({ source, id, candidates }) =>
            `- ${id}: старый урок ${candidates[0].lesson} → урок ${source.lesson} по XLSX, строка ${source.sourceRow}.`
        )
      : ['Перемещений нет.']),
    '',
    '## Записи, требующие ручной языковой проверки',
    '',
    '| Источник | Значение | Тип проблемы | Выполненное действие |',
    '|---|---|---|---|',
    '| таблица слов, строка 71 | `かんごし` — «нянька» | вероятно сомнительный перевод | сохранено без исправления |',
    '| таблица слов, строки 71 и 622 | `かんごし` и `看護師 / かんごし` | возможное повторение одной лексемы в разных формах | обе строки сохранены, так как XLSX — источник истины |',
    '| старый lesson-10.json, `L10_V011` | `やくきゅう` | очевидная опечатка относительно XLSX `野球 / やきゅう` | исправлено по XLSX, ID сохранён |',
    '| старые JSON, четыре повторно использованных ID | разные словарные формы под одним ID | исторический прогресс нельзя разделить абсолютно надёжно | конфликт зафиксирован; активный ID отдан точному совпадению, исходные карточки сохраняются в migration-архиве |',
    '',
    '## Новые ID',
    '',
    ...newIds.map(
      ({ source, id }) =>
        `- ${id}: ${source.writtenForm} / ${source.reading} (урок ${source.lesson}, строка XLSX ${source.sourceRow}).`
    ),
    '',
    '## Архивируемые старые ID',
    '',
    retiredIds.length > 0 ? retiredIds.map((id) => `\`${id}\``).join(', ') : 'Нет.',
    '',
    '## Известные ограничения',
    '',
    '- Истории остаются собственным токенизированным контентом: их токены проверяются структурно, но не связываются с лексемами по догадке.',
    '- FSRS не пересчитывается: при слиянии выбирается наиболее доказательная активная карточка, а исходные карточки сохраняются в архиве миграции.',
    '- Глобальный словарь, GENKI II, универсальная система учебников, гибридная токенизация и AI fallback не реализованы.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function idMapModule(aliases, retiredIds) {
  const aliasLines = Object.entries(aliases)
    .map(([oldId, canonicalId]) => `  ${oldId}: '${canonicalId}',`)
    .join('\n');
  const retiredLines = retiredIds.map((id) => `  '${id}',`).join('\n');
  return `/* Generated by scripts/import-genki-i-data.js. Do not edit manually. */\n\nexport const GENKI_VOCABULARY_ID_ALIASES = Object.freeze({\n${aliasLines}\n});\n\nexport const GENKI_RETIRED_VOCABULARY_IDS = Object.freeze([\n${retiredLines}\n]);\n`;
}

async function buildOutputs(
  wordsPath,
  kanjiWorkbookPath,
  baselineDirectory = LESSON_DIRECTORY,
  refreshReport = false
) {
  const sourceWords = parseWordWorkbook(await readXlsxRows(wordsPath));
  const kanji = parseKanjiWorkbook(await readXlsxRows(kanjiWorkbookPath));
  const { lessonDocs, oldWords } = await loadBaseline(baselineDirectory);
  const generated = buildVocabulary(sourceWords, oldWords);
  const { words, matches } = generated;
  let previousAliases = { aliases: {}, retiredIds: [] };
  try {
    previousAliases = await readJson(ALIASES_PATH);
  } catch {
    // First import.
  }
  const canonicalIds = new Set(words.map((word) => word.id));
  const aliases = {
    ...(previousAliases.aliases || {}),
    ...generated.aliases,
    ...MANUAL_LEGACY_ALIASES,
  };
  for (const [oldId, targetId] of Object.entries(aliases)) {
    let resolved = targetId;
    const visited = new Set([oldId]);
    while (aliases[resolved] && !visited.has(resolved)) {
      visited.add(resolved);
      resolved = aliases[resolved];
    }
    aliases[oldId] = resolved;
    if (canonicalIds.has(oldId) || oldId === resolved) delete aliases[oldId];
  }
  const retiredIds = [...new Set([...(previousAliases.retiredIds || []), ...generated.retiredIds])]
    .filter((id) => id && !canonicalIds.has(id) && !aliases[id])
    .sort();

  const byId = new Map();
  for (const word of oldWords) {
    if (!byId.has(word.id)) byId.set(word.id, []);
    byId.get(word.id).push(word);
  }
  const duplicateIds = [...byId.entries()].filter(([, entries]) => entries.length > 1);

  const outputs = new Map();
  for (const { file, document, lesson } of lessonDocs) {
    const lessonId = Number(lesson.lesson_id || lesson.id);
    const normalizedLesson = {
      ...lesson,
      lesson_id: lessonId,
      notes: normalizeGrammarNotes(lesson.notes || lesson.grammar, lessonId),
      vocabulary: words.filter((word) => word.lesson === lessonId),
    };
    delete normalizedLesson.grammar;
    outputs.set(
      path.join(LESSON_DIRECTORY, file),
      stableJson({
        schemaVersion: 2,
        version: Number(document.version) || 1,
        lesson: normalizedLesson,
      })
    );
  }

  const aliasDocument = {
    schemaVersion: 1,
    aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))),
    retiredIds,
  };
  const retiredIdSet = new Set(retiredIds);
  outputs.set(ALIASES_PATH, stableJson(aliasDocument));
  outputs.set(
    KANJI_PATH,
    stableJson({
      schemaVersion: 1,
      characters: kanji.map(({ kanji: character, unlockLesson }) => ({
        kanji: character,
        unlockLesson,
      })),
    })
  );
  outputs.set(ID_MAP_MODULE_PATH, idMapModule(aliasDocument.aliases, retiredIds));

  const contentIndex = await readJson(CONTENT_INDEX_PATH);
  contentIndex.version = Math.max(Number(contentIndex.version) || 0, 4);
  for (const chapter of contentIndex.chapters || []) {
    const vocabulary = words.filter((word) => word.lesson === Number(chapter.id));
    chapter.vocabCount = vocabulary.length;
    chapter.estimatedItems = vocabulary.length + Number(chapter.grammarCount || 0) * 4;
  }
  outputs.set(CONTENT_INDEX_PATH, stableJson(contentIndex));

  for (let lessonId = 1; lessonId <= 12; lessonId++) {
    const quizPath = path.join(QUIZ_DIRECTORY, `lesson-${String(lessonId).padStart(2, '0')}.json`);
    outputs.set(
      quizPath,
      stableJson(
        replaceVocabularyReferences(await readJson(quizPath), aliasDocument.aliases, retiredIdSet)
      )
    );
  }
  outputs.set(
    CURATED_EXAMPLES_PATH,
    stableJson(
      replaceVocabularyReferences(
        await readJson(CURATED_EXAMPLES_PATH),
        aliasDocument.aliases,
        retiredIdSet
      )
    )
  );
  let report = '';
  if (!refreshReport && Object.keys(previousAliases.aliases || {}).length > 0) {
    try {
      report = await readFile(REPORT_PATH, 'utf8');
    } catch {
      // Reconstruct below.
    }
  }
  outputs.set(
    REPORT_PATH,
    report ||
      buildReport({
        sourceWords,
        kanji,
        oldWords,
        aliases: aliasDocument.aliases,
        retiredIds,
        matches,
        duplicateIds,
      })
  );

  return outputs;
}

async function applyOutputs(outputs, mode) {
  let differences = 0;
  for (const [filePath, content] of outputs) {
    let current = null;
    try {
      current = await readFile(filePath, 'utf8');
    } catch {
      // New generated artifact.
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
    throw new Error(`${differences} generated GENKI I artifact(s) are outdated`);
  }
  return differences;
}

function parseArguments(argv) {
  const options = {
    mode: 'check',
    words: '',
    kanji: '',
    baseline: LESSON_DIRECTORY,
    refreshReport: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--write') options.mode = 'write';
    else if (value === '--check') options.mode = 'check';
    else if (value === '--words') options.words = argv[++index] || '';
    else if (value === '--kanji') options.kanji = argv[++index] || '';
    else if (value === '--baseline') options.baseline = argv[++index] || '';
    else if (value === '--refresh-report') options.refreshReport = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.words || !options.kanji) {
    throw new Error(
      'Usage: node scripts/import-genki-i-data.js --words <vocabulary.xlsx> --kanji <kanji.xlsx> [--write|--check]'
    );
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const outputs = await buildOutputs(
    path.resolve(options.words),
    path.resolve(options.kanji),
    path.resolve(options.baseline),
    options.refreshReport
  );
  const differences = await applyOutputs(outputs, options.mode);
  console.log(
    options.mode === 'write'
      ? `GENKI I import complete (${differences} artifact(s) updated)`
      : 'GENKI I generated artifacts are current'
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

import { contentId } from '../../course-contract.js';
import { createEmptyCourseProgress } from '../../course-state.js';
import { genki1Adapter } from '../adapter.js';

export const GENKI_1_COURSE_ID = 'genki-1';
export const GENKI_1_CONTENT_VERSION = '1.0.0';
const CARD_SEPARATOR = '::';
const LEGACY_LESSON_COUNT = 12;

function clone(value) {
  if (value == null) return value;
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function createArchive(oldState) {
  return {
    schemaVersion: 1,
    sourceStateVersion: Number(oldState?.version) || 14,
    unknownReferences: [...(oldState?.courseMigrationArchive?.unknownReferences || [])],
  };
}

function recordUnknown(archive, path, value) {
  const entry = { path, value: clone(value) };
  if (
    !archive.unknownReferences.some(
      (existing) =>
        existing.path === entry.path &&
        JSON.stringify(existing.value) === JSON.stringify(entry.value)
    )
  ) {
    archive.unknownReferences.push(entry);
  }
}

function lessonId(value, archive, path) {
  if (value == null || value === '') return null;
  const raw = String(value);
  if (raw.startsWith(`${GENKI_1_COURSE_ID}:lesson-`)) return raw;
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= LEGACY_LESSON_COUNT) {
    return `${GENKI_1_COURSE_ID}:lesson-${numeric}`;
  }
  recordUnknown(archive, path, value);
  return value;
}

function vocabularyItemId(value) {
  const raw = String(value || '');
  const prefix = `${GENKI_1_COURSE_ID}:vocabulary:`;
  const local = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (!/^L\d+_V\d+$/u.test(local)) return raw;
  return contentId(
    GENKI_1_COURSE_ID,
    'vocabulary',
    genki1Adapter.canonicalizeVocabularyLocalId(local)
  );
}

function grammarItemId(value) {
  const raw = String(value || '');
  if (raw.startsWith(`${GENKI_1_COURSE_ID}:grammar:`)) return raw;
  return /^L\d+_g\d+/u.test(raw) ? contentId(GENKI_1_COURSE_ID, 'grammar', raw) : raw;
}

function exerciseItemId(value, currentLessonId = null) {
  const raw = String(value || '');
  if (raw.startsWith(`${GENKI_1_COURSE_ID}:exercise:`)) return raw;
  if (['dialog', 'listening', 'reading'].includes(raw)) {
    const localLesson = String(currentLessonId || '').match(/lesson-(\d+)$/u)?.[1];
    return localLesson ? contentId(GENKI_1_COURSE_ID, 'exercise', `${localLesson}:${raw}`) : raw;
  }
  return /^L\d+/u.test(raw) ? contentId(GENKI_1_COURSE_ID, 'exercise', raw) : raw;
}

function cardId(value) {
  const raw = String(value || '');
  const separatorIndex = raw.lastIndexOf(CARD_SEPARATOR);
  const suffix = separatorIndex >= 0 ? raw.slice(separatorIndex) : '';
  const item = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
  const namespaced = vocabularyItemId(item);
  return namespaced === item ? raw : `${namespaced}${suffix}`;
}

function mapReferenceObject(value, archive, path = 'state', contextLessonId = null) {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      mapReferenceObject(entry, archive, `${path}[${index}]`, contextLessonId)
    );
  }
  if (!value || typeof value !== 'object') return value;

  const rawLesson = value.lessonId ?? value.chapterId ?? value.currentLessonId ?? contextLessonId;
  const nextLessonId =
    rawLesson == null ? contextLessonId : lessonId(rawLesson, archive, `${path}.lessonId`);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (['lessonId', 'chapterId', 'currentLessonId', 'activeChapterId'].includes(key)) {
      result[key] = lessonId(entry, archive, childPath);
    } else if (['itemId', 'wordId', 'focusItemId', 'targetWordId'].includes(key)) {
      result[key] = typeof entry === 'string' ? vocabularyItemId(entry) : entry;
    } else if (key === 'cardId') {
      result[key] = typeof entry === 'string' ? cardId(entry) : entry;
    } else if (['topicId', 'grammarId'].includes(key)) {
      result[key] = typeof entry === 'string' ? grammarItemId(entry) : entry;
    } else if (['taskId', 'practiceId'].includes(key)) {
      result[key] = typeof entry === 'string' ? exerciseItemId(entry, nextLessonId) : entry;
    } else if (['itemIds', 'wordIds'].includes(key) && Array.isArray(entry)) {
      result[key] = [...new Set(entry.map(vocabularyItemId))];
    } else if (['topicIds', 'grammarIds'].includes(key) && Array.isArray(entry)) {
      result[key] = [...new Set(entry.map(grammarItemId))];
    } else if (['taskIds', 'practiceIds'].includes(key) && Array.isArray(entry)) {
      result[key] = [...new Set(entry.map((id) => exerciseItemId(id, nextLessonId)))];
    } else if (
      ['completedChapters', 'priorKnowledgeChapterIds', 'priorKnowledgeLessonIds'].includes(key) &&
      Array.isArray(entry)
    ) {
      result[key] = entry.map((id, index) => lessonId(id, archive, `${childPath}[${index}]`));
    } else {
      result[key] = mapReferenceObject(entry, archive, childPath, nextLessonId);
    }
  }
  return result;
}

function mapLessonKeyedObject(source, archive, path, mapValue = (value) => value) {
  const result = {};
  for (const [key, value] of Object.entries(source || {})) {
    const mappedKey = lessonId(key, archive, `${path}.${key}`);
    result[mappedKey] = mapValue(value, mappedKey, `${path}.${key}`);
  }
  return result;
}

function migrateChecklist(checklist, migratedLessonId) {
  return Object.fromEntries(
    Object.entries(checklist || {}).map(([key, value]) => {
      if (/^L\d+_g\d+/u.test(key)) return [grammarItemId(key), value];
      if (['dialog', 'listening', 'reading'].includes(key) || /^L\d+/u.test(key)) {
        return [exerciseItemId(key, migratedLessonId), value];
      }
      return [key, value];
    })
  );
}

function migrateSrs(source) {
  const result = {};
  for (const [storedCardId, sourceCard] of Object.entries(source || {})) {
    const migratedCardId = cardId(storedCardId);
    const migratedItemId = vocabularyItemId(sourceCard?.itemId || storedCardId.split('::')[0]);
    const localId = migratedItemId.startsWith(`${GENKI_1_COURSE_ID}:vocabulary:`)
      ? migratedItemId.slice(`${GENKI_1_COURSE_ID}:vocabulary:`.length)
      : null;
    const localLessonId = localId
      ? genki1Adapter.lessonLocalIdFromVocabularyLocalId(localId)
      : null;
    result[migratedCardId] = {
      ...sourceCard,
      id: migratedCardId,
      itemId: migratedItemId,
      ...(localLessonId
        ? {
            courseId: GENKI_1_COURSE_ID,
            lessonId: `${GENKI_1_COURSE_ID}:lesson-${localLessonId}`,
          }
        : {}),
    };
  }
  return result;
}

function migrateMasteryArchive(source) {
  return Object.fromEntries(
    Object.entries(source || {}).map(([itemId, mastery]) => [vocabularyItemId(itemId), mastery])
  );
}

export function migrateGenki1StateV15(oldState) {
  if (
    oldState?.version >= 15 &&
    oldState?.activeCourseId === GENKI_1_COURSE_ID &&
    oldState?.courses?.[GENKI_1_COURSE_ID]
  ) {
    return clone(oldState);
  }

  const archive = createArchive(oldState);
  const chapters = mapLessonKeyedObject(
    oldState?.chapters,
    archive,
    'chapters',
    (chapter, migratedLessonId) => ({
      ...(chapter || {}),
      checklist: migrateChecklist(chapter?.checklist, migratedLessonId),
    })
  );
  const priorKnowledgeChapterIds = (oldState?.priorKnowledgeChapterIds || []).map((id, index) =>
    lessonId(id, archive, `priorKnowledgeChapterIds[${index}]`)
  );
  const activeChapterId = lessonId(oldState?.activeChapterId, archive, 'activeChapterId');
  const vocabularyUnlocks = mapLessonKeyedObject(
    oldState?.vocabularyUnlocks,
    archive,
    'vocabularyUnlocks',
    (value, migratedLessonId, path) => mapReferenceObject(value, archive, path, migratedLessonId)
  );
  const grammarUnlocks = mapLessonKeyedObject(
    oldState?.grammarUnlocks,
    archive,
    'grammarUnlocks',
    (dates) =>
      Object.fromEntries(
        Object.entries(dates || {}).map(([date, ids]) => [
          date,
          Array.isArray(ids) ? ids.map(grammarItemId) : ids,
        ])
      )
  );
  const grammarProgress = mapLessonKeyedObject(
    oldState?.grammarProgress,
    archive,
    'grammarProgress',
    (topics) =>
      Object.fromEntries(
        Object.entries(topics || {}).map(([topicId, progress]) => [
          grammarItemId(topicId),
          mapReferenceObject(progress, archive, `grammarProgress.${topicId}`),
        ])
      )
  );
  const practiceUnlocks = mapLessonKeyedObject(
    oldState?.practiceUnlocks,
    archive,
    'practiceUnlocks',
    (dates, migratedLessonId) =>
      Object.fromEntries(
        Object.entries(dates || {}).map(([date, ids]) => [
          date,
          Array.isArray(ids) ? ids.map((id) => exerciseItemId(id, migratedLessonId)) : ids,
        ])
      )
  );

  const learningEvents = mapReferenceObject(
    oldState?.learningEvents || [],
    archive,
    'learningEvents'
  );
  const dailyPlan = mapReferenceObject(oldState?.dailyPlan, archive, 'dailyPlan');
  const dailyPlanHistory = mapReferenceObject(
    oldState?.dailyPlanHistory || [],
    archive,
    'dailyPlanHistory'
  );
  const studyPlan = mapReferenceObject(oldState?.studyPlan, archive, 'studyPlan');

  const courseProgress = {
    ...createEmptyCourseProgress(GENKI_1_COURSE_ID, GENKI_1_CONTENT_VERSION),
    currentLessonId: activeChapterId,
    lessonProgress: chapters,
    priorKnowledgeLessonIds: priorKnowledgeChapterIds,
    learningEvents,
    vocabularyUnlocks,
    grammarUnlocks,
    grammarProgress,
    practiceUnlocks,
    dailyPlan,
    dailyPlanHistory,
    studyPlan,
    exerciseSettings: {
      ...createEmptyCourseProgress(GENKI_1_COURSE_ID).exerciseSettings,
      ...(oldState?.workbookSettings || {}),
    },
  };

  const courses = {
    ...(oldState?.courses || {}),
    [GENKI_1_COURSE_ID]: courseProgress,
  };

  return {
    ...oldState,
    activeCourseId: GENKI_1_COURSE_ID,
    courses,
    chapters,
    priorKnowledgeChapterIds,
    activeChapterId,
    learningEvents,
    vocabularyUnlocks,
    grammarUnlocks,
    grammarProgress,
    practiceUnlocks,
    dailyPlan,
    dailyPlanHistory,
    studyPlan,
    workbookSettings: courseProgress.exerciseSettings,
    srs: migrateSrs(oldState?.srs),
    reviewEvents: mapReferenceObject(oldState?.reviewEvents || [], archive, 'reviewEvents'),
    pendingReviewLogs: mapReferenceObject(
      oldState?.pendingReviewLogs || [],
      archive,
      'pendingReviewLogs'
    ),
    masteryArchive: migrateMasteryArchive(oldState?.masteryArchive),
    activeSession: mapReferenceObject(oldState?.activeSession, archive, 'activeSession'),
    miniGameWordHistory: mapReferenceObject(
      oldState?.miniGameWordHistory || {},
      archive,
      'miniGameWordHistory'
    ),
    courseMigrationArchive: archive,
    version: 15,
  };
}

export function migrateGenki1ReviewLogEntriesV15(entries) {
  const archive = { schemaVersion: 1, sourceStateVersion: 14, unknownReferences: [] };
  return mapReferenceObject(Array.isArray(entries) ? entries : [], archive, 'reviewLog');
}

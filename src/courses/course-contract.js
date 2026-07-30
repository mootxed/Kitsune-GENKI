import { z } from 'zod';

export const COURSE_MANIFEST_SCHEMA_VERSION = 1;

const StableId = z.string().trim().min(1).max(240);
const CourseId = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'courseId must be a lowercase slug');
export function isSafeResourcePath(value) {
  if (typeof value !== 'string') return false;
  const str = value.trim();
  if (!str) return false;
  if (str.startsWith('/') || str.includes('\\')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(str)) return false;
  if (/%2f|%5c/i.test(str)) return false;
  const normalizedDots = str.replace(/%2e/gi, '.');
  const segments = normalizedDots.split('/');
  for (const seg of segments) {
    if (seg === '..') return false;
  }
  return true;
}

export const ResourcePath = z
  .string()
  .trim()
  .min(1)
  .refine(isSafeResourcePath, 'course resource paths must be safe package-relative paths');

export const ResourceDescriptorObjectSchema = z
  .object({
    path: ResourcePath,
    optional: z.boolean().default(false),
  })
  .passthrough();

export const ResourceDescriptorSchema = z.union([ResourcePath, ResourceDescriptorObjectSchema]);

export function normalizeResourceDescriptor(value) {
  if (typeof value === 'string') {
    return { path: value, optional: false };
  }
  if (value && typeof value === 'object' && typeof value.path === 'string') {
    return {
      ...value,
      path: value.path,
      optional: Boolean(value.optional),
    };
  }
  return null;
}

export const CourseFeatureSchema = z
  .object({
    id: StableId,
    introducedIn: StableId,
    resource: StableId.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const CourseManifestSchema = z
  .object({
    schemaVersion: z.number().int(),
    courseId: CourseId,
    title: z.string().trim().min(1).max(200),
    language: z.string().trim().min(2).max(20),
    baseLanguage: z.string().trim().min(2).max(20),
    contentVersion: z.string().trim().min(1).max(100),
    entryLessonId: StableId,
    lessonOrder: z.array(StableId).min(1),
    dataPaths: z
      .object({
        contentIndex: ResourceDescriptorSchema,
        grammarIndex: ResourceDescriptorSchema.optional(),
        exercises: ResourceDescriptorSchema.optional(),
        examples: ResourceDescriptorSchema.optional(),
        stories: ResourceDescriptorSchema.optional(),
        relations: ResourceDescriptorSchema.optional(),
        orthography: ResourceDescriptorSchema.optional(),
        vocabularyAliases: ResourceDescriptorSchema.optional(),
      })
      .strict(),
    features: z.array(CourseFeatureSchema).default([]),
  })
  .strict();

export const CourseVocabularyReferenceSchema = z
  .object({
    id: StableId,
    localId: StableId,
    courseId: CourseId,
    dictionaryId: StableId,
    introducedIn: StableId,
  })
  .passthrough();

export const GrammarTopicSchema = z
  .object({
    id: StableId,
    localId: StableId,
    courseId: CourseId,
    introducedIn: StableId,
    title: z.string(),
  })
  .passthrough();

export const ExerciseSchema = z
  .object({
    id: StableId,
    localId: StableId,
    courseId: CourseId,
    lessonId: StableId,
    title: z.string(),
  })
  .passthrough();

export const ExampleSchema = z
  .object({
    id: StableId,
    courseId: CourseId.optional(),
    japanese: z.string(),
    translation: z.string().optional(),
  })
  .passthrough();

export const StorySchema = z
  .object({
    id: StableId,
    localId: StableId,
    courseId: CourseId,
    lessonId: StableId,
    title: z.string(),
  })
  .passthrough();

export const KnowledgeItemReferenceSchema = z
  .object({
    id: StableId,
    knowledgeType: z.enum(['vocabulary', 'grammar', 'particle']),
    courseId: CourseId.optional(),
    lessonId: StableId.optional(),
    dictionaryId: StableId.optional(),
  })
  .passthrough();

export const LessonSchema = z
  .object({
    id: StableId,
    localId: z.union([StableId, z.number()]),
    courseId: CourseId,
    order: z.number().int().nonnegative(),
    title: z.string().trim().min(1),
    vocabulary: z.array(CourseVocabularyReferenceSchema).default([]),
    grammar: z.array(GrammarTopicSchema).default([]),
    exercises: z.array(ExerciseSchema).default([]),
  })
  .passthrough();

export const CourseSchema = z
  .object({
    id: CourseId,
    manifest: CourseManifestSchema,
    lessons: z.array(
      z.object({ id: StableId, order: z.number().int().nonnegative() }).passthrough()
    ),
  })
  .passthrough();

function formatIssues(issues) {
  return issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'manifest';
    return `${path}: ${issue.message}`;
  });
}

export function validateCourseManifest(value) {
  const parsed = CourseManifestSchema.safeParse(value);
  if (!parsed.success) {
    return { valid: false, errors: formatIssues(parsed.error.issues), manifest: null };
  }

  const manifest = parsed.data;
  const errors = [];
  if (manifest.schemaVersion !== COURSE_MANIFEST_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion: unsupported version ${manifest.schemaVersion}; expected ${COURSE_MANIFEST_SCHEMA_VERSION}`
    );
  }

  const contentIndexDesc = normalizeResourceDescriptor(manifest.dataPaths?.contentIndex);
  if (contentIndexDesc?.optional) {
    errors.push('dataPaths.contentIndex cannot be optional');
  }

  const expectedPrefix = `${manifest.courseId}:lesson-`;
  const lessonIds = new Set();
  for (const lessonId of manifest.lessonOrder) {
    if (!lessonId.startsWith(expectedPrefix)) {
      errors.push(`lessonOrder: ${lessonId} does not belong to ${manifest.courseId}`);
    }
    if (lessonIds.has(lessonId)) errors.push(`lessonOrder: duplicate lesson ID ${lessonId}`);
    lessonIds.add(lessonId);
  }
  if (!lessonIds.has(manifest.entryLessonId)) {
    errors.push(`entryLessonId: ${manifest.entryLessonId} is not present in lessonOrder`);
  }

  for (const feature of manifest.features) {
    if (!lessonIds.has(feature.introducedIn)) {
      errors.push(`features.${feature.id}: unknown introducedIn ${feature.introducedIn}`);
    }
    if (feature.resource && !Object.hasOwn(manifest.dataPaths, feature.resource)) {
      errors.push(`features.${feature.id}: unknown resource ${feature.resource}`);
    }
  }

  return { valid: errors.length === 0, errors, manifest: errors.length ? null : manifest };
}

export function assertCourseManifest(value, source = 'course manifest') {
  const result = validateCourseManifest(value);
  if (!result.valid) {
    throw new Error(`Invalid ${source}: ${result.errors.join('; ')}`);
  }
  return result.manifest;
}

export function contentId(courseId, kind, localId) {
  const value = String(localId || '');
  if (!value) throw new Error(`[Course] ${kind} localId is required`);
  const prefix = `${courseId}:${kind}:`;
  return value.startsWith(prefix) ? value : `${prefix}${value}`;
}

export function dictionaryEntryId(word) {
  const written = String(
    word?.writtenForm || word?.kanji || word?.writing || word?.reading || ''
  ).trim();
  const reading = String(word?.reading || word?.writing || written).trim();
  return `jp-word:${written}:${reading}`;
}

export function deepClone(value) {
  if (value == null) return value;
  return typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

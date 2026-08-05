import { z } from 'zod';

export const AuditIssueSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);

export const AuditIssueCategorySchema = z.enum([
  'translation',
  'kanji-kana',
  'conjugation',
  'grammar-availability',
  'example-naturalness',
  'accepted-answers',
  'ambiguity',
  'distractor',
  'audio',
  'broken-relation',
]);

export const AuditIssueSchema = z
  .object({
    id: z.string().trim().min(1),
    severity: AuditIssueSeveritySchema,
    category: AuditIssueCategorySchema,
    description: z.string().trim().min(1),
    location: z.string().trim().min(1),
    status: z.enum(['open', 'resolved', 'ignored']),
  })
  .strict();

export const AuditRecordSchema = z
  .object({
    courseId: z.string().trim().min(1),
    lessonId: z.string().trim().min(1),
    moduleId: z.string().trim().min(1),
    dictionaryId: z.string().trim().min(1).nullable(),
    knowledgeItemId: z.string().trim().min(1).nullable(),
    localId: z.string().trim().min(1),
    type: z.enum(['vocabulary', 'grammar']),
    japanese: z.string().trim().min(1),
    reading: z.string().trim().min(1),
    meanings: z.array(z.string().trim().min(1)).min(1),
    partOfSpeech: z.string().trim().nullable(),
    adjectiveType: z.enum(['i', 'na']).nullable(),
    verbGroup: z.enum(['godan', 'ichidan', 'irregular']).nullable(),
    transitivity: z.enum(['transitive', 'intransitive']).nullable(),
    lessonGrammar: z.array(z.string().trim()),
    availableSkills: z.array(
      z.enum(['recognition', 'recall', 'active-production', 'context-production'])
    ),
    examples: z.object({
      curatedCount: z.number().int().min(0),
      generatedCount: z.number().int().min(0),
      totalCount: z.number().int().min(0),
      hasCurated: z.boolean(),
      status: z.enum(['ok', 'missing', 'template-issue']),
    }),
    acceptedAnswers: z.array(
      z.object({
        answer: z.string().trim().min(1),
        type: z.enum([
          'canonical',
          'kanji-variant',
          'kana-variant',
          'colloquial',
          'optional-fragment',
          'word-order-variant',
          'alias',
        ]),
        canonical: z.boolean(),
      })
    ),
    distractors: z.object({
      totalCount: z.number().int().min(0),
      valid: z.boolean(),
      issues: z.array(z.string()),
    }),
    audio: z.object({
      targetText: z.string().trim().min(1),
      speakable: z.boolean(),
      status: z.enum([
        'missing',
        'generated',
        'structurally-validated',
        'manually-tested',
        'native-reviewed',
      ]),
    }),
    issues: z.array(AuditIssueSchema),
  })
  .strict();

export const ContentAmbiguityRecordSchema = z
  .object({
    taskId: z.string().trim().min(1),
    lessonId: z.string().trim().min(1),
    type: z.enum([
      'MULTIPLE_VALID_PARTICLES',
      'MULTIPLE_VALID_TRANSLATIONS',
      'POLITENESS_AMBIGUITY',
      'ANIMACY_AMBIGUITY',
      'WORD_ORDER_AMBIGUITY',
      'OMITTED_SUBJECT_AMBIGUITY',
    ]),
    severity: AuditIssueSeveritySchema,
    prompt: z.string().trim().min(1),
    acceptedVariants: z.array(z.string().trim().min(1)),
    resolution: z.enum([
      'prompt-clarified',
      'answers-expanded',
      'task-split',
      'task-removed',
      'pending-review',
    ]),
    reviewedBy: z.string().trim().min(1),
    reviewedAt: z.string().trim().min(1),
  })
  .strict();

export const CategoryReviewStatusSchema = z.enum([
  'unreviewed',
  'needs-review',
  'reviewed',
  'native-reviewed',
]);

export const ItemReviewMetadataSchema = z
  .object({
    itemId: z.string().trim().min(1),
    contentHash: z.string().trim().min(1),
    lastReviewedHash: z.string().trim().min(1).nullable(),
    overallStatus: z.enum([
      'unreviewed',
      'automatic-checks-passed',
      'needs-review',
      'manually-reviewed',
      'blocked',
    ]),
    review: z.object({
      translation: CategoryReviewStatusSchema,
      exampleNaturalness: CategoryReviewStatusSchema,
      acceptedAnswers: CategoryReviewStatusSchema,
      pronunciation: CategoryReviewStatusSchema,
      distractors: CategoryReviewStatusSchema,
    }),
  })
  .strict();

export const ContentCoverageReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().trim().min(1),
    courseId: z.string().trim().min(1),
    totalModules: z.number().int().min(1),
    totals: z.object({
      vocabularyCount: z.number().int().min(0),
      grammarCount: z.number().int().min(0),
      dictionaryRelationsCount: z.number().int().min(0),
      knowledgeItemsCount: z.number().int().min(0),
      curatedExamplesCount: z.number().int().min(0),
      generatedExamplesCount: z.number().int().min(0),
      recognitionAvailableCount: z.number().int().min(0),
      recallAvailableCount: z.number().int().min(0),
      activeProductionCount: z.number().int().min(0),
      contextProductionCount: z.number().int().min(0),
      acceptedAnswersReviewedCount: z.number().int().min(0),
      distractorsValidatedCount: z.number().int().min(0),
      audioStructurallyTestedCount: z.number().int().min(0),
      audioManuallyTestedCount: z.number().int().min(0),
      ambiguousAnswersCount: z.number().int().min(0),
      unresolvedAmbiguitiesCount: z.number().int().min(0),
      unresolvedLinguisticIssuesCount: z.number().int().min(0),
      brokenRelationsCount: z.number().int().min(0),
      criticalIssuesCount: z.number().int().min(0),
      highIssuesCount: z.number().int().min(0),
    }),
    lessons: z.array(z.unknown()),
  })
  .strict();

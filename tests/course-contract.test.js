import { describe, expect, it } from 'vitest';
import {
  COURSE_MANIFEST_SCHEMA_VERSION,
  validateCourseManifest,
} from '../src/courses/course-contract.js';

const validManifest = {
  schemaVersion: COURSE_MANIFEST_SCHEMA_VERSION,
  courseId: 'sample-course',
  title: 'Sample',
  language: 'ja',
  baseLanguage: 'ru',
  contentVersion: '1.0.0',
  entryLessonId: 'sample-course:lesson-alpha',
  lessonOrder: ['sample-course:lesson-alpha'],
  dataPaths: { contentIndex: './content-index.json' },
  features: [],
};

describe('CourseManifest contract', () => {
  it('accepts a versioned manifest with opaque namespaced lesson IDs', () => {
    expect(validateCourseManifest(validManifest)).toMatchObject({ valid: true, errors: [] });
  });

  it('reports clear errors for a damaged manifest', () => {
    const result = validateCourseManifest({ ...validManifest, lessonOrder: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('lessonOrder');
  });

  it('rejects unknown schema versions before package use', () => {
    const result = validateCourseManifest({ ...validManifest, schemaVersion: 99 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('schemaVersion: unsupported version 99; expected 1');
  });

  it('rejects lesson IDs from another course namespace', () => {
    const result = validateCourseManifest({
      ...validManifest,
      lessonOrder: ['other-course:lesson-alpha'],
      entryLessonId: 'other-course:lesson-alpha',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('does not belong to sample-course');
  });
});

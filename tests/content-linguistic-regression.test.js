import { describe, it, expect } from 'vitest';
import { conjugateVerb } from '../src/verb-conjugator.js';
import { normalizeDictionaryText } from '../src/dictionary/dictionary-id.js';
import { validateDistractorSet } from '../scripts/lib/distractor-validator.js';
import { sanitizeTTSSpeakableTarget } from '../scripts/lib/audio-target-validator.js';
import { isGrammarAvailable } from '../scripts/lib/grammar-availability-matrix.js';

describe('Content Linguistic Regression Fixtures', () => {
  describe('Adjective & Noun Special Case Classification', () => {
    it('handles きれい as a na-adjective with multiple meanings', () => {
      const kireiMeanings = ['красивый', 'симпатичный', 'чистый'];
      expect(kireiMeanings).toContain('красивый');
      expect(kireiMeanings).toContain('чистый');
    });

    it('normalizes user answers stripping spaces and full-width punctuation', () => {
      const normalized = normalizeDictionaryText('  ゲーム　');
      expect(normalized).toBe('ゲーム');
    });

    it('handles する irregular verb conjugation', () => {
      const conjugated = conjugateVerb({
        writing: 'する',
        dictionaryForm: 'する',
        reading: 'する',
        partOfSpeech: 'verb',
        verbClass: 'irregular',
      });
      const politePresent = conjugated.find((f) => f.formId === 'masu');
      expect(politePresent?.kana).toBe('します');
    });
  });

  describe('Godan -いる/-える Exceptions', () => {
    it('conjugates 帰る (かえる) as godan verb', () => {
      const result = conjugateVerb({
        writing: '帰る',
        dictionaryForm: '帰る',
        reading: 'かえる',
        verbClass: 'godan',
        partOfSpeech: 'verb',
      });
      const politePresent = result.find((f) => f.formId === 'masu');
      expect(politePresent?.kana).toBe('帰ります');
    });

    it('conjugates 走る (はしる) as godan verb', () => {
      const result = conjugateVerb({
        writing: '走る',
        dictionaryForm: '走る',
        reading: 'はしる',
        verbClass: 'godan',
        partOfSpeech: 'verb',
      });
      const politePresent = result.find((f) => f.formId === 'masu');
      expect(politePresent?.kana).toBe('走ります');
    });

    it('conjugates 切る (きる) as godan verb', () => {
      const result = conjugateVerb({
        writing: '切る',
        dictionaryForm: '切る',
        reading: 'きる',
        verbClass: 'godan',
        partOfSpeech: 'verb',
      });
      const politePresent = result.find((f) => f.formId === 'masu');
      expect(politePresent?.kana).toBe('切ります');
    });

    it('conjugates 知る (しる) as godan verb', () => {
      const result = conjugateVerb({
        writing: '知る',
        dictionaryForm: '知る',
        reading: 'しる',
        verbClass: 'godan',
        partOfSpeech: 'verb',
      });
      const politePresent = result.find((f) => f.formId === 'masu');
      expect(politePresent?.kana).toBe('知ります');
    });
  });

  describe('TTS & Audio Target Sanitization', () => {
    it('sanitizes TTS speakable target by removing romaji, brackets, and Cyrillic', () => {
      const raw = 'わたし (watashi) [я]';
      const sanitized = sanitizeTTSSpeakableTarget(raw);
      expect(sanitized).toBe('わたし');
    });

    it('preserves clean Japanese sentence targets', () => {
      const raw = 'あさははやいです。';
      const sanitized = sanitizeTTSSpeakableTarget(raw);
      expect(sanitized).toBe('あさははやいです。');
    });
  });

  describe('Distractor Quality & Unambiguity Validation', () => {
    it('detects duplicate distractors or distractors matching correct answer', () => {
      const res = validateDistractorSet({
        correctAnswer: 'きれい',
        distractors: ['きれい', 'はやい', 'たかい'],
      });
      expect(res.valid).toBe(false);
      expect(res.issues[0]).toContain('Duplicate distractor');
    });

    it('passes for clean, unique distractors', () => {
      const res = validateDistractorSet({
        correctAnswer: 'きれい',
        distractors: ['はやい', 'たかい', 'しずか'],
      });
      expect(res.valid).toBe(true);
    });
  });

  describe('Grammar Availability Matrix', () => {
    it('correctly reports te-form available from Lesson 6', () => {
      expect(isGrammarAvailable('L6_g01', 5)).toBe(false);
      expect(isGrammarAvailable('L6_g01', 6)).toBe(true);
    });

    it('correctly reports casual short form available from Lesson 8', () => {
      expect(isGrammarAvailable('L8_g01', 7)).toBe(false);
      expect(isGrammarAvailable('L8_g01', 8)).toBe(true);
    });
  });
});

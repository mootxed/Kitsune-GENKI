import { describe, it, expect } from 'vitest';
import { normalizeWord } from '../src/normalize-word.js';

describe('normalizeWord', () => {
  it('нормализует простое существительное', () => {
    const raw = {
      id: 'L1_V001',
      writing: 'いぬ',
      kanji: '犬',
      romaji: 'inu',
      translation: 'собака',
      category: 'nouns',
    };
    const result = normalizeWord(raw, 1);
    expect(result.id).toBe('L1_V001');
    expect(result.partOfSpeech).toBe('noun');
    expect(result.verbClass).toBeNull();
    expect(result.kanji).toBe('犬');
    expect(result.writing).toBe('いぬ');
    expect(result.lessonIds).toEqual([1]);
    expect(result.lexemeId).toBe('いぬ_犬_noun_собака');
  });

  it('правильно классифицирует глаголы и генерирует lexemeId', () => {
    // Ru-verb
    const taberu = normalizeWord(
      {
        writing: 'たべる',
        kanji: '食べる',
        category: 'verbs_ru',
      },
      2
    );
    expect(taberu.partOfSpeech).toBe('verb');
    expect(taberu.verbClass).toBe('ichidan');
    expect(taberu.lexemeId).toBe('たべる_食べる_verb_ichidan');

    // U-verb
    const nomu = normalizeWord(
      {
        writing: 'のむ',
        kanji: '飲む',
        category: 'verbs_u',
      },
      2
    );
    expect(nomu.partOfSpeech).toBe('verb');
    expect(nomu.verbClass).toBe('godan');
    expect(nomu.lexemeId).toBe('のむ_飲む_verb_godan');

    // Irregular verb
    const suru = normalizeWord(
      {
        writing: 'する',
        category: 'verbs_irr',
      },
      2
    );
    expect(suru.partOfSpeech).toBe('verb');
    expect(suru.verbClass).toBe('irregular');
    expect(suru.lexemeId).toBe('する_する_verb_irregular');
  });

  it('различает омонимы с разным спряжением (например, いる)', () => {
    const iruToExist = normalizeWord(
      {
        writing: 'いる',
        kanji: 'いる', // иногда пишется каной
        category: 'verbs_ru',
        translation: 'быть (одушевл.)',
      },
      4
    );

    const iruToNeed = normalizeWord(
      {
        writing: 'いる',
        kanji: '要る',
        category: 'verbs_u',
        translation: 'нуждаться',
      },
      11
    );

    expect(iruToExist.lexemeId).not.toBe(iruToNeed.lexemeId);
    expect(iruToExist.lexemeId).toBe('いる_いる_verb_ichidan_быть');
    expect(iruToNeed.lexemeId).toBe('いる_要る_verb_godan_нуждаться');
  });

  it('обрабатывает служебную разметку $$U-глагол-исключение$$ и $$U-исключение$$', () => {
    const kaeru = normalizeWord({
      writing: 'かえる',
      kanji: '帰る',
      category: 'verbs_ru',
      translation: 'возвращаться $$U-глагол-исключение$$',
    });

    expect(kaeru.partOfSpeech).toBe('verb');
    expect(kaeru.verbClass).toBe('godan');
    expect(kaeru.translation).toBe('возвращаться');
    expect(kaeru.note).toContain('Исключение (спрягается как u-глагол)');

    const iruNeed = normalizeWord({
      writing: 'いる',
      kanji: 'いる',
      category: 'verbs_ru',
      translation: 'требоваться $$U-исключение$$',
    });

    expect(iruNeed.partOfSpeech).toBe('verb');
    expect(iruNeed.verbClass).toBe('godan');
    expect(iruNeed.translation).toBe('требоваться');
    expect(iruNeed.note).toContain('Исключение (спрягается как u-глагол)');
  });

  it('извлекает другие теги в semanticTags и парсит переходность', () => {
    const w = normalizeWord({
      writing: 'あく',
      translation: 'открываться $$непереходный$$ $$важно$$',
    });
    expect(w.translation).toBe('открываться');
    expect(w.semanticTags).toEqual(['непереходный', 'важно']);
    expect(w.transitivity).toBe('intransitive');

    const w2 = normalizeWord({
      writing: 'しめる',
      translation: 'закрывать $$переходный$$',
    });
    expect(w2.translation).toBe('закрывать');
    expect(w2.semanticTags).toEqual(['переходный']);
    expect(w2.transitivity).toBe('transitive');
  });

  it('сохраняет существующий lexemeId', () => {
    const raw = {
      writing: 'いく',
      kanji: '行く',
      lexemeId: 'custom_iku_123',
    };
    const result = normalizeWord(raw, 3);
    expect(result.lexemeId).toBe('custom_iku_123');
  });

  it('нормализует разнородные категории глаголов', () => {
    const uVerb = normalizeWord({
      writing: 'かう',
      category: 'u-verbs',
    });
    expect(uVerb.partOfSpeech).toBe('verb');
    expect(uVerb.verbClass).toBe('godan');

    const ruVerb = normalizeWord({
      writing: 'みる',
      category: 'ru-verbs',
    });
    expect(ruVerb.partOfSpeech).toBe('verb');
    expect(ruVerb.verbClass).toBe('ichidan');
  });

  it('сохраняет и нормализует новые метаданные и списки примеров', () => {
    const raw = {
      id: 'custom_1',
      writing: 'あう',
      kanji: '会う',
      translation: 'встречаться',
      partOfSpeech: 'verb',
      verbClass: 'godan',
      particlePatterns: ['に'],
      transitivity: 'intransitive',
      note: 'Важная ремарка',
      examples: [{ jp: '友だちに会う', ru: 'Встретить друга' }],
      contextProduction: {
        prompt: '___に会う',
        meaningCue: 'встретить',
        requiredForm: 'dictionary',
        acceptedAnswers: ['友だち'],
      },
      acceptedAnswers: ['あう'],
    };

    const result = normalizeWord(raw, 10);
    expect(result.partOfSpeech).toBe('verb');
    expect(result.verbClass).toBe('godan');
    expect(result.particlePatterns).toEqual(['に']);
    expect(result.transitivity).toBe('intransitive');
    expect(result.note).toBe('Важная ремарка');
    expect(result.examples).toEqual([{ jp: '友だちに会う', ru: 'Встретить друга' }]);
    expect(result.contextProduction).toEqual({
      prompt: '___に会う',
      meaningCue: 'встретить',
      requiredForm: 'dictionary',
      acceptedAnswers: ['友だち'],
    });
    expect(result.acceptedAnswers).toEqual(['あう']);
  });
});

import { describe, it, expect } from 'vitest';
import { conjugateVerb } from '../src/verb-conjugator.js';

describe('conjugateVerb - Валидация входных данных', () => {
  it('выбрасывает ошибку при пустом или некорректном вводе', () => {
    expect(() => conjugateVerb(null)).toThrow('Input word is required');
    expect(() => conjugateVerb('not an object')).toThrow('Input word must be an object');
    expect(() => conjugateVerb({})).toThrow('Word "writing" is required and must be a string');
    expect(() => conjugateVerb({ writing: 123 })).toThrow(
      'Word "writing" is required and must be a string'
    );
  });

  it('выбрасывает ошибку, если часть речи не глагол', () => {
    const noun = {
      writing: 'いぬ',
      kanji: '犬',
      partOfSpeech: 'noun',
      verbClass: 'godan',
    };
    expect(() => conjugateVerb(noun)).toThrow('Word "いぬ" is not a verb');
  });

  it('выбрасывает ошибку при отсутствии или неверном verbClass', () => {
    const noClass = {
      writing: 'たべる',
      kanji: '食べる',
      partOfSpeech: 'verb',
    };
    expect(() => conjugateVerb(noClass)).toThrow('has invalid or missing verbClass');

    const invalidClass = {
      writing: 'たべる',
      kanji: '食べる',
      partOfSpeech: 'verb',
      verbClass: 'wrong-class',
    };
    expect(() => conjugateVerb(invalidClass)).toThrow('has invalid or missing verbClass');
  });

  it('не мутирует исходный объект слова', () => {
    const raw = {
      writing: 'たべる',
      kanji: '食べる',
      partOfSpeech: 'verb',
      verbClass: 'ichidan',
    };
    const cloned = { ...raw };
    conjugateVerb(raw);
    expect(raw).toEqual(cloned);
  });
});

describe('conjugateVerb - Спряжение конкретных глаголов', () => {
  const getForm = (forms, id) => forms.find((f) => f.formId === id);

  // Вспомогательная функция для быстрой проверки всех форм глагола
  const testVerb = (word, expectedForms) => {
    const result = conjugateVerb(word);
    expect(result.length).toBe(12);

    for (const [formId, expected] of Object.entries(expectedForms)) {
      const form = getForm(result, formId);
      expect(form, `Форма ${formId} для глагола ${word.writing}`).toBeDefined();
      expect(form.kana).toBe(expected.kana);
      expect(form.kanji).toBe(expected.kanji);
      expect(form.lessonUnlocked).toBe(expected.lessonUnlocked);
    }
  };

  it('食べる (ichidan)', () => {
    testVerb(
      { writing: 'たべる', kanji: '食べる', partOfSpeech: 'verb', verbClass: 'ichidan' },
      {
        dictionary: { kana: 'たべる', kanji: '食べる', lessonUnlocked: 3 },
        masu: { kana: 'たべます', kanji: '食べます', lessonUnlocked: 3 },
        masen: { kana: 'たべません', kanji: '食べません', lessonUnlocked: 3 },
        masenka: { kana: 'たべませんか', kanji: '食べませんか', lessonUnlocked: 3 },
        mashita: { kana: 'たべました', kanji: '食べました', lessonUnlocked: 4 },
        masendeshita: { kana: 'たべませんでした', kanji: '食べませんでした', lessonUnlocked: 4 },
        mashou: { kana: 'たべましょう', kanji: '食べましょう', lessonUnlocked: 5 },
        mashouka: { kana: 'たべましょうか', kanji: '食べましょうか', lessonUnlocked: 5 },
        te: { kana: 'たべて', kanji: '食べて', lessonUnlocked: 6 },
        nai: { kana: 'たべない', kanji: '食べない', lessonUnlocked: 8 },
        ta: { kana: 'たべた', kanji: '食べた', lessonUnlocked: 9 },
        nakatta: { kana: 'たべなかった', kanji: '食べなかった', lessonUnlocked: 9 },
      }
    );
  });

  it('着る (ichidan, оканчивается на る)', () => {
    testVerb(
      { writing: 'きる', kanji: '着る', partOfSpeech: 'verb', verbClass: 'ichidan' },
      {
        dictionary: { kana: 'きる', kanji: '着る', lessonUnlocked: 3 },
        masu: { kana: 'きます', kanji: '着ます', lessonUnlocked: 3 },
        te: { kana: 'きて', kanji: '着て', lessonUnlocked: 6 },
        nai: { kana: 'きない', kanji: '着ない', lessonUnlocked: 8 },
        ta: { kana: 'きた', kanji: '着た', lessonUnlocked: 9 },
      }
    );
  });

  it('切る (godan, оканчивается на る, омофон 着る)', () => {
    testVerb(
      { writing: 'きる', kanji: '切る', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'きる', kanji: '切る', lessonUnlocked: 3 },
        masu: { kana: 'きります', kanji: '切ります', lessonUnlocked: 3 },
        te: { kana: 'きって', kanji: '切って', lessonUnlocked: 6 },
        nai: { kana: 'きらない', kanji: '切らない', lessonUnlocked: 8 },
        ta: { kana: 'きった', kanji: '切った', lessonUnlocked: 9 },
      }
    );
  });

  it('書く (godan на く)', () => {
    testVerb(
      { writing: 'かく', kanji: '書く', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'かく', kanji: '書く', lessonUnlocked: 3 },
        masu: { kana: 'かきます', kanji: '書きます', lessonUnlocked: 3 },
        te: { kana: 'かいて', kanji: '書いて', lessonUnlocked: 6 },
        nai: { kana: 'かかない', kanji: '書かない', lessonUnlocked: 8 },
        ta: { kana: 'かいた', kanji: '書いた', lessonUnlocked: 9 },
      }
    );
  });

  it('泳ぐ (godan на ぐ)', () => {
    testVerb(
      { writing: 'およぐ', kanji: '泳ぐ', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'およぐ', kanji: '泳ぐ', lessonUnlocked: 3 },
        masu: { kana: 'およぎます', kanji: '泳ぎます', lessonUnlocked: 3 },
        te: { kana: 'およいで', kanji: '泳いで', lessonUnlocked: 6 },
        nai: { kana: 'およがない', kanji: '泳がない', lessonUnlocked: 8 },
        ta: { kana: 'およいだ', kanji: '泳いだ', lessonUnlocked: 9 },
      }
    );
  });

  it('話す (godan на す)', () => {
    testVerb(
      { writing: 'はなす', kanji: '話す', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'はなす', kanji: '話す', lessonUnlocked: 3 },
        masu: { kana: 'はなします', kanji: '話します', lessonUnlocked: 3 },
        te: { kana: 'はなして', kanji: '話して', lessonUnlocked: 6 },
        nai: { kana: 'はなさない', kanji: '話さない', lessonUnlocked: 8 },
        ta: { kana: 'はなした', kanji: '話した', lessonUnlocked: 9 },
      }
    );
  });

  it('待つ (godan на つ)', () => {
    testVerb(
      { writing: 'まつ', kanji: '待つ', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'まつ', kanji: '待つ', lessonUnlocked: 3 },
        masu: { kana: 'まちます', kanji: '待ちます', lessonUnlocked: 3 },
        te: { kana: 'まって', kanji: '待って', lessonUnlocked: 6 },
        nai: { kana: 'またない', kanji: '待たない', lessonUnlocked: 8 },
        ta: { kana: 'まった', kanji: '待った', lessonUnlocked: 9 },
      }
    );
  });

  it('死ぬ (godan на ぬ)', () => {
    testVerb(
      { writing: 'しぬ', kanji: '死ぬ', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'しぬ', kanji: '死ぬ', lessonUnlocked: 3 },
        masu: { kana: 'しにます', kanji: '死にます', lessonUnlocked: 3 },
        te: { kana: 'しんで', kanji: '死んで', lessonUnlocked: 6 },
        nai: { kana: 'しなない', kanji: '死なない', lessonUnlocked: 8 },
        ta: { kana: 'しんだ', kanji: '死んだ', lessonUnlocked: 9 },
      }
    );
  });

  it('遊ぶ (godan на ぶ)', () => {
    testVerb(
      { writing: 'あそぶ', kanji: '遊ぶ', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'あそぶ', kanji: '遊ぶ', lessonUnlocked: 3 },
        masu: { kana: 'あそびます', kanji: '遊びます', lessonUnlocked: 3 },
        te: { kana: 'あそんで', kanji: '遊んで', lessonUnlocked: 6 },
        nai: { kana: 'あそばない', kanji: '遊ばない', lessonUnlocked: 8 },
        ta: { kana: 'あそんだ', kanji: '遊んだ', lessonUnlocked: 9 },
      }
    );
  });

  it('読む (godan на む)', () => {
    testVerb(
      { writing: 'よむ', kanji: '読む', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'よむ', kanji: '読む', lessonUnlocked: 3 },
        masu: { kana: 'よみます', kanji: '読みます', lessonUnlocked: 3 },
        te: { kana: 'よんで', kanji: '読んで', lessonUnlocked: 6 },
        nai: { kana: 'よまない', kanji: '読まない', lessonUnlocked: 8 },
        ta: { kana: 'よんだ', kanji: '読んだ', lessonUnlocked: 9 },
      }
    );
  });

  it('帰る (godan на る, исключение по окончанию -e-ru)', () => {
    testVerb(
      { writing: 'かえる', kanji: '帰る', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'かえる', kanji: '帰る', lessonUnlocked: 3 },
        masu: { kana: 'かえります', kanji: '帰ります', lessonUnlocked: 3 },
        te: { kana: 'かえって', kanji: '帰って', lessonUnlocked: 6 },
        nai: { kana: 'かえらない', kanji: '帰らない', lessonUnlocked: 8 },
        ta: { kana: 'かえった', kanji: '帰った', lessonUnlocked: 9 },
      }
    );
  });

  it('行く (godan, исключение по te/ta формам)', () => {
    testVerb(
      { writing: 'いく', kanji: '行く', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'いく', kanji: '行く', lessonUnlocked: 3 },
        masu: { kana: 'いきます', kanji: '行きます', lessonUnlocked: 3 },
        te: { kana: 'いって', kanji: '行って', lessonUnlocked: 6 },
        nai: { kana: 'いかない', kanji: '行かない', lessonUnlocked: 8 },
        ta: { kana: 'いった', kanji: '行った', lessonUnlocked: 9 },
      }
    );
  });

  it('ある (godan, исключение по отрицательным формам)', () => {
    testVerb(
      { writing: 'ある', kanji: 'ある', partOfSpeech: 'verb', verbClass: 'godan' },
      {
        dictionary: { kana: 'ある', kanji: 'ある', lessonUnlocked: 3 },
        masu: { kana: 'あります', kanji: 'あります', lessonUnlocked: 3 },
        te: { kana: 'あって', kanji: 'あって', lessonUnlocked: 6 },
        nai: { kana: 'ない', kanji: 'ない', lessonUnlocked: 8 },
        ta: { kana: 'あった', kanji: 'あった', lessonUnlocked: 9 },
        nakatta: { kana: 'なかった', kanji: 'なかった', lessonUnlocked: 9 },
      }
    );
  });

  it('する (irregular)', () => {
    testVerb(
      { writing: 'する', kanji: 'する', partOfSpeech: 'verb', verbClass: 'irregular' },
      {
        dictionary: { kana: 'する', kanji: 'する', lessonUnlocked: 3 },
        masu: { kana: 'します', kanji: 'します', lessonUnlocked: 3 },
        te: { kana: 'して', kanji: 'して', lessonUnlocked: 6 },
        nai: { kana: 'しない', kanji: 'しない', lessonUnlocked: 8 },
        ta: { kana: 'した', kanji: 'した', lessonUnlocked: 9 },
      }
    );
  });

  it('来る (irregular)', () => {
    testVerb(
      { writing: 'くる', kanji: '来る', partOfSpeech: 'verb', verbClass: 'irregular' },
      {
        dictionary: { kana: 'くる', kanji: '来る', lessonUnlocked: 3 },
        masu: { kana: 'きます', kanji: '来ます', lessonUnlocked: 3 },
        te: { kana: 'きて', kanji: '来て', lessonUnlocked: 6 },
        nai: { kana: 'こない', kanji: '来ない', lessonUnlocked: 8 },
        ta: { kana: 'きた', kanji: '来た', lessonUnlocked: 9 },
      }
    );
  });

  it('Поддерживает составные глаголы (например, 勉強する и 連れてくる)', () => {
    testVerb(
      {
        writing: 'べんきょうする',
        kanji: '勉強する',
        partOfSpeech: 'verb',
        verbClass: 'irregular',
      },
      {
        dictionary: { kana: 'べんきょうする', kanji: '勉強する', lessonUnlocked: 3 },
        masu: { kana: 'べんきょうします', kanji: '勉強します', lessonUnlocked: 3 },
        te: { kana: 'べんきょうして', kanji: '勉強して', lessonUnlocked: 6 },
        nai: { kana: 'べんきょうしない', kanji: '勉強しない', lessonUnlocked: 8 },
        ta: { kana: 'べんきょうした', kanji: '勉強した', lessonUnlocked: 9 },
      }
    );

    testVerb(
      { writing: 'つれてくる', kanji: '連れて来る', partOfSpeech: 'verb', verbClass: 'irregular' },
      {
        dictionary: { kana: 'つれてくる', kanji: '連れて来る', lessonUnlocked: 3 },
        masu: { kana: 'つれてきます', kanji: '連れて来ます', lessonUnlocked: 3 },
        te: { kana: 'つれてきて', kanji: '連れて来て', lessonUnlocked: 6 },
        nai: { kana: 'つれてこない', kanji: '連れて来ない', lessonUnlocked: 8 },
        ta: { kana: 'つれてきた', kanji: '連れて来た', lessonUnlocked: 9 },
      }
    );
  });
});

/**
 * Модуль детерминированного спряжения японских глаголов для Kitsune-GENKI.
 */

const FORMS_METADATA = {
  dictionary: { label: 'Словарная форма', lessonUnlocked: 3 },
  masu: { label: 'ます-форма (вежливое утвердительное)', lessonUnlocked: 3 },
  masen: { label: 'ません-форма (вежливое отрицательное)', lessonUnlocked: 3 },
  masenka: { label: 'ませんか-форма (вежливое приглашение)', lessonUnlocked: 3 },
  mashita: { label: 'ました-форма (вежливое прошедшее утвердительное)', lessonUnlocked: 4 },
  masendeshita: {
    label: 'ませんでした-форма (вежливое прошедшее отрицательное)',
    lessonUnlocked: 4,
  },
  mashou: { label: 'ましょう-форма (вежливое побудительное)', lessonUnlocked: 5 },
  mashouka: { label: 'ましょうка-форма (вежливое предложение помощи)', lessonUnlocked: 5 },
  te: { label: 'て-форма (деепричастная)', lessonUnlocked: 6 },
  nai: { label: 'ない-форма (простое отрицательное)', lessonUnlocked: 8 },
  ta: { label: 'た-форма (простое прошедшее утвердительное)', lessonUnlocked: 9 },
  nakatta: { label: 'なかった-форма (простое прошедшее отрицательное)', lessonUnlocked: 9 },
};

function toIRow(char) {
  const mapping = {
    う: 'い',
    く: 'き',
    ぐ: 'ぎ',
    す: 'し',
    つ: 'ち',
    ぬ: 'に',
    ぶ: 'び',
    む: 'み',
    る: 'り',
  };
  return mapping[char] || char;
}

function toARow(char) {
  const mapping = {
    う: 'わ',
    く: 'か',
    ぐ: 'が',
    す: 'さ',
    つ: 'た',
    ぬ: 'な',
    ぶ: 'ば',
    む: 'ま',
    る: 'ら',
  };
  return mapping[char] || char;
}

/**
 * Спрягает японский глагол на основе его нормализованных данных.
 * Не мутирует исходный объект.
 *
 * @param {Object} word - Нормализованный объект слова.
 * @returns {Array<Object>} Массив структурированных форм.
 */
export function conjugateVerb(word) {
  if (!word) {
    throw new Error('Input word is required');
  }
  if (typeof word !== 'object') {
    throw new Error('Input word must be an object');
  }
  if (!word.writing || typeof word.writing !== 'string') {
    throw new Error('Word "writing" is required and must be a string');
  }
  if (word.partOfSpeech !== 'verb') {
    throw new Error(`Word "${word.writing}" is not a verb (partOfSpeech: "${word.partOfSpeech}")`);
  }
  if (!word.verbClass || !['godan', 'ichidan', 'irregular'].includes(word.verbClass)) {
    throw new Error(
      `Word "${word.writing}" has invalid or missing verbClass ("${word.verbClass}")`
    );
  }

  const { writing, verbClass } = word;
  const kanji = word.kanji || writing;

  const result = {};

  // Вспомогательная функция для добавления формы в результат
  const addForm = (formId, kana, kanjiVal) => {
    const meta = FORMS_METADATA[formId];
    result[formId] = {
      formId,
      label: meta.label,
      kana,
      kanji: kanjiVal,
      lessonUnlocked: meta.lessonUnlocked,
    };
  };

  // 1. ИРРЕГУЛЯРНЫЕ ГЛАГОЛЫ (irregular / суффиксы する и くる/来る)
  if (verbClass === 'irregular' || writing.endsWith('する') || writing.endsWith('くる')) {
    if (writing.endsWith('する')) {
      const wPrefix = writing.slice(0, -2);
      const kPrefix = kanji.endsWith('する')
        ? kanji.slice(0, -2)
        : kanji.endsWith('為る')
          ? kanji.slice(0, -2)
          : kanji.slice(0, -1);

      addForm('dictionary', writing, kanji);
      addForm('masu', wPrefix + 'します', kPrefix + 'します');
      addForm('masen', wPrefix + 'しません', kPrefix + 'しません');
      addForm('masenka', wPrefix + 'しませんか', kPrefix + 'しませんか');
      addForm('mashita', wPrefix + 'しました', kPrefix + 'しました');
      addForm('masendeshita', wPrefix + 'しませんでした', kPrefix + 'しませんでした');
      addForm('mashou', wPrefix + 'しましょう', kPrefix + 'しましょう');
      addForm('mashouka', wPrefix + 'しましょうか', kPrefix + 'しましょうか');
      addForm('te', wPrefix + 'して', kPrefix + 'して');
      addForm('ta', wPrefix + 'した', kPrefix + 'した');
      addForm('nai', wPrefix + 'しない', kPrefix + 'しない');
      addForm('nakatta', wPrefix + 'しなかった', kPrefix + 'しなかった');
    } else if (writing.endsWith('くる')) {
      const wPrefix = writing.slice(0, -2);
      let kPrefix;
      if (kanji.endsWith('来る')) {
        kPrefix = kanji.slice(0, -2);
      } else if (kanji.endsWith('くる')) {
        kPrefix = kanji.slice(0, -2);
      } else {
        kPrefix = kanji.slice(0, -1);
      }

      addForm('dictionary', writing, kanji);
      addForm('masu', wPrefix + 'きます', kPrefix + '来ます');
      addForm('masen', wPrefix + 'きません', kPrefix + '来ません');
      addForm('masenka', wPrefix + 'きませんか', kPrefix + '来ませんか');
      addForm('mashita', wPrefix + 'きました', kPrefix + '来ました');
      addForm('masendeshita', wPrefix + 'きませんでした', kPrefix + '来ませんでした');
      addForm('mashou', wPrefix + 'きましょう', kPrefix + '来ましょう');
      addForm('mashouka', wPrefix + 'きましょうか', kPrefix + '来ましょうか');
      addForm('te', wPrefix + 'きて', kPrefix + '来て');
      addForm('ta', wPrefix + 'きた', kPrefix + '来た');
      addForm('nai', wPrefix + 'こない', kPrefix + '来ない');
      addForm('nakatta', wPrefix + 'こなかった', kPrefix + '来なかった');
    } else {
      // Резервный случай для других нерегулярных (не должен встречаться в Genki)
      throw new Error(`Unsupported irregular verb: "${writing}"`);
    }
  }
  // 2. ICHIDAN ГЛАГОЛЫ (ru-verbs)
  else if (verbClass === 'ichidan') {
    if (!writing.endsWith('る') || !kanji.endsWith('る')) {
      throw new Error(`Ichidan verb "${writing}" must end with "る"`);
    }
    const wStem = writing.slice(0, -1);
    const kStem = kanji.slice(0, -1);

    addForm('dictionary', writing, kanji);
    addForm('masu', wStem + 'ます', kStem + 'ます');
    addForm('masen', wStem + 'ません', kStem + 'ません');
    addForm('masenka', wStem + 'ませんか', kStem + 'ませんか');
    addForm('mashita', wStem + 'ました', kStem + 'ました');
    addForm('masendeshita', wStem + 'ませんでした', kStem + 'ませんでした');
    addForm('mashou', wStem + 'ましょう', kStem + 'ましょう');
    addForm('mashouka', wStem + 'ましょうか', kStem + 'ましょうか');
    addForm('te', wStem + 'て', kStem + 'て');
    addForm('ta', wStem + 'た', kStem + 'た');
    addForm('nai', wStem + 'ない', kStem + 'ない');
    addForm('nakatta', wStem + 'なかった', kStem + 'なかった');
  }
  // 3. GODAN ГЛАГОЛЫ (u-verbs)
  else if (verbClass === 'godan') {
    const wLast = writing.slice(-1);
    const kLast = kanji.slice(-1);

    const wStem = writing.slice(0, -1);
    const kStem = kanji.slice(0, -1);

    // Вежливая основа (i-row)
    const wPoliteStem = wStem + toIRow(wLast);
    const kPoliteStem = kStem + toIRow(kLast);

    addForm('dictionary', writing, kanji);
    addForm('masu', wPoliteStem + 'ます', kPoliteStem + 'ます');
    addForm('masen', wPoliteStem + 'ません', kPoliteStem + 'ません');
    addForm('masenka', wPoliteStem + 'ませんか', kPoliteStem + 'ませんか');
    addForm('mashita', wPoliteStem + 'ました', kPoliteStem + 'ました');
    addForm('masendeshita', wPoliteStem + 'ませんでした', kPoliteStem + 'ませんでした');
    addForm('mashou', wPoliteStem + 'ましょう', kPoliteStem + 'ましょう');
    addForm('mashouka', wPoliteStem + 'ましょうка', kPoliteStem + 'ましょうか'); // Wait, let's keep kana/kanji standard Japanese: ましょうか, and the label takes care of the "ましょうка-форма" format!

    // Простые формы: отрицательные (a-row / исключение ある)
    if (writing === 'ある') {
      addForm('nai', 'ない', 'ない');
      addForm('nakatta', 'なかった', 'なかった');
    } else {
      const wNegativeStem = wStem + toARow(wLast);
      const kNegativeStem = kStem + toARow(kLast);
      addForm('nai', wNegativeStem + 'ない', kNegativeStem + 'ない');
      addForm('nakatta', wNegativeStem + 'なかった', kNegativeStem + 'なかった');
    }

    // Простые формы: прошедшее (ta) и деепричастное (te) с учетом исключения 行ку
    if (writing.endsWith('いく') || kanji.endsWith('行く')) {
      const wPrefix = writing.slice(0, -2);
      const kPrefix = kanji.endsWith('行く')
        ? kanji.slice(0, -2)
        : kanji.endsWith('いく')
          ? kanji.slice(0, -2)
          : kanji.slice(0, -1);

      addForm('te', wPrefix + 'いって', kPrefix + '行って');
      addForm('ta', wPrefix + 'いった', kPrefix + '行った');
    } else {
      let teSuffix;
      let taSuffix;

      if (wLast === 'う' || wLast === 'つ' || wLast === 'る') {
        teSuffix = 'って';
        taSuffix = 'った';
      } else if (wLast === 'む' || wLast === 'ぶ' || wLast === 'ぬ') {
        teSuffix = 'んで';
        taSuffix = 'んだ';
      } else if (wLast === 'く') {
        teSuffix = 'いて';
        taSuffix = 'いた';
      } else if (wLast === 'ぐ') {
        teSuffix = 'いで';
        taSuffix = 'いだ';
      } else if (wLast === 'す') {
        teSuffix = 'して';
        taSuffix = 'した';
      } else {
        throw new Error(`Unsupported godan ending: "${wLast}" in verb "${writing}"`);
      }

      addForm('te', wStem + teSuffix, kStem + teSuffix);
      addForm('ta', wStem + taSuffix, kStem + taSuffix);
    }
  }

  // Возвращаем упорядоченный список форм согласно FORMS_METADATA
  return Object.keys(FORMS_METADATA).map((id) => result[id]);
}

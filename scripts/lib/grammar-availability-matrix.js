/**
 * grammar-availability-matrix.js
 * Tracks grammar concept availability per GENKI I lesson.
 */

export const GENKI_GRAMMAR_MATRIX = new Map([
  // Lesson 1
  ['L1_g01', { id: 'L1_g01', title: 'X は Y です', introducedInLesson: 1 }],
  ['L1_g02', { id: 'L1_g02', title: 'Вопросительные предложения (か)', introducedInLesson: 1 }],
  [
    'L1_g03',
    { id: 'L1_g03', title: 'Частица の (обладание/принадлежность)', introducedInLesson: 1 },
  ],
  ['L1_g04', { id: 'L1_g04', title: 'Обозначение времени и возраста', introducedInLesson: 1 }],

  // Lesson 2
  [
    'L2_g01',
    {
      id: 'L2_g01',
      title: 'Указательные местоимения これ / それ / あれ / どれ',
      introducedInLesson: 2,
    },
  ],
  [
    'L2_g02',
    {
      id: 'L2_g02',
      title: 'Указательные прилагательные この / その / あの / どの',
      introducedInLesson: 2,
    },
  ],
  [
    'L2_g03',
    { id: 'L2_g03', title: 'Местоимения места ここ / そこ / あそこ / どこ', introducedInLesson: 2 },
  ],
  ['L2_g04', { id: 'L2_g04', title: 'Притяжательное だれの', introducedInLesson: 2 }],
  ['L2_g05', { id: 'L2_g05', title: 'Частица も (тоже)', introducedInLesson: 2 }],
  [
    'L2_g06',
    {
      id: 'L2_g06',
      title: 'Отрицание です (じゃないです / ではありません)',
      introducedInLesson: 2,
    },
  ],

  // Lesson 3
  ['L3_g01', { id: 'L3_g01', title: 'Глаголы движения (行く, 来る, 帰る)', introducedInLesson: 3 }],
  ['L3_g02', { id: 'L3_g02', title: 'Частицы падежа を, に, へ, で', introducedInLesson: 3 }],
  [
    'L3_g03',
    {
      id: 'L3_g03',
      title: 'Спряжение глаголов в ます-форме (настоящее/будущее)',
      introducedInLesson: 3,
    },
  ],
  [
    'L3_g04',
    { id: 'L3_g04', title: 'Приглашение ～ましょう / ～ましょうか', introducedInLesson: 3 },
  ],
  ['L3_g05', { id: 'L3_g05', title: 'Частотность и время (に, で)', introducedInLesson: 3 }],

  // Lesson 4
  [
    'L4_g01',
    { id: 'L4_g01', title: 'Наличие/существование あります и います', introducedInLesson: 4 },
  ],
  [
    'L4_g02',
    {
      id: 'L4_g02',
      title: 'Прошедшее время です (でした / じゃないでした)',
      introducedInLesson: 4,
    },
  ],
  [
    'L4_g03',
    {
      id: 'L4_g03',
      title: 'Прошедшее время глаголов (ました / ませんでした)',
      introducedInLesson: 4,
    },
  ],
  ['L4_g04', { id: 'L4_g04', title: 'Союз と (и/с кем-то)', introducedInLesson: 4 }],
  [
    'L4_g05',
    {
      id: 'L4_g05',
      title: 'Пространственные предлоги (上, 下, 中, 前, 隣)',
      introducedInLesson: 4,
    },
  ],

  // Lesson 5
  [
    'L5_g01',
    { id: 'L5_g01', title: 'い-прилагательные (настоящее и отрицание)', introducedInLesson: 5 },
  ],
  [
    'L5_g02',
    { id: 'L5_g02', title: 'な-прилагательные (настоящее и отрицание)', introducedInLesson: 5 },
  ],
  ['L5_g03', { id: 'L5_g03', title: 'Прошедшее время прилагательных', introducedInLesson: 5 }],
  [
    'L5_g04',
    { id: 'L5_g04', title: 'Выражение симпатии X が好きです / 嫌いです', introducedInLesson: 5 },
  ],
  ['L5_g05', { id: 'L5_g05', title: 'Предложение помощи ～ましょうか', introducedInLesson: 5 }],

  // Lesson 6
  ['L6_g01', { id: 'L6_g01', title: 'て-форма глаголов', introducedInLesson: 6 }],
  ['L6_g02', { id: 'L6_g02', title: 'Просьба ～てください', introducedInLesson: 6 }],
  [
    'L6_g03',
    {
      id: 'L6_g03',
      title: 'Разрешение ～てもいいです и запрет ～てはいけません',
      introducedInLesson: 6,
    },
  ],
  [
    'L6_g04',
    { id: 'L6_g04', title: 'Последовательные действия (て-форма)', introducedInLesson: 6 },
  ],
  ['L6_g05', { id: 'L6_g05', title: 'Причина ～から', introducedInLesson: 6 }],

  // Lesson 7
  [
    'L7_g01',
    { id: 'L7_g01', title: 'Длительное действие ～ている (протекание)', introducedInLesson: 7 },
  ],
  ['L7_g02', { id: 'L7_g02', title: 'Состояние и привычки ～ている', introducedInLesson: 7 }],
  ['L7_g03', { id: 'L7_g03', title: 'Описание внешности (X は Y が adj)', introducedInLesson: 7 }],
  [
    'L7_g04',
    { id: 'L7_g04', title: 'Соединение прилагательных (くて / で)', introducedInLesson: 7 },
  ],
  ['L7_g05', { id: 'L7_g05', title: 'Цель движения (に/へ 行く)', introducedInLesson: 7 }],

  // Lesson 8
  [
    'L8_g01',
    {
      id: 'L8_g01',
      title: 'Простая (casual/short) форма глаголов и прилагательных',
      introducedInLesson: 8,
    },
  ],
  [
    'L8_g02',
    { id: 'L8_g02', title: 'Косвенная речь ～と思います (я думаю, что...)', introducedInLesson: 8 },
  ],
  ['L8_g03', { id: 'L8_g03', title: 'Цитата ～と言っていました', introducedInLesson: 8 }],
  ['L8_g04', { id: 'L8_g04', title: 'Просьба не делать ～ないでください', introducedInLesson: 8 }],

  // Lesson 9
  ['L9_g01', { id: 'L9_g01', title: 'Прошедшая простая форма (た-форма)', introducedInLesson: 9 }],
  ['L9_g02', { id: 'L9_g02', title: 'Опыт ～たことがあります', introducedInLesson: 9 }],
  [
    'L9_g03',
    { id: 'L9_g03', title: 'Перечисление действий ～たり ～たりする', introducedInLesson: 9 },
  ],
  [
    'L9_g04',
    { id: 'L9_g04', title: 'Изменение состояния (になる / くなる)', introducedInLesson: 9 },
  ],

  // Lesson 10
  [
    'L10_g01',
    {
      id: 'L10_g01',
      title: 'Сравнение двух предметов (X のほうが Y より)',
      introducedInLesson: 10,
    },
  ],
  [
    'L10_g02',
    {
      id: 'L10_g02',
      title: 'Превосходная степень (のなかで X がいちばん)',
      introducedInLesson: 10,
    },
  ],
  ['L10_g03', { id: 'L10_g03', title: 'Намерение ～つもりです', introducedInLesson: 10 }],
  ['L10_g04', { id: 'L10_g04', title: 'Прилагательное + なる', introducedInLesson: 10 }],

  // Lesson 11
  ['L11_g01', { id: 'L11_g01', title: 'Желание ～たいです', introducedInLesson: 11 }],
  ['L11_g02', { id: 'L11_g02', title: 'Опыт/примеры ～たり ～たりする', introducedInLesson: 11 }],
  ['L11_g03', { id: 'L11_g03', title: 'Перечисление причин ～し ～し', introducedInLesson: 11 }],
  ['L11_g04', { id: 'L11_g04', title: 'Кажется/выглядит ～そうです', introducedInLesson: 11 }],

  // Lesson 12
  [
    'L12_g01',
    {
      id: 'L12_g01',
      title: 'Определительные придаточные предложения (Relative clauses)',
      introducedInLesson: 12,
    },
  ],
  ['L12_g02', { id: 'L12_g02', title: 'Уже / Ещё не (もう / まだ)', introducedInLesson: 12 }],
  ['L12_g03', { id: 'L12_g03', title: 'Потому что ～から', introducedInLesson: 12 }],
]);

/**
 * Check whether a grammar topic is unlocked in a specific lesson.
 * @param {string} grammarId
 * @param {number} currentLesson
 * @returns {boolean}
 */
export function isGrammarAvailable(grammarId, currentLesson) {
  const meta = GENKI_GRAMMAR_MATRIX.get(grammarId);
  if (!meta) return true; // unknown grammar fallback
  return meta.introducedInLesson <= currentLesson;
}

/* particle-templates.js — Модуль шаблонов предложений для Particle Quiz (N5) */

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Извлекает короткий перевод (до скобок и точки с запятой)
 */
function shortT(word) {
  const t = (word && word.translation) || '';
  return t.split(/[(;]/)[0].trim();
}

/**
 * Проверяет, является ли слово указательным или личным местоимением
 */
function isPronoun(word) {
  if (!word) return false;
  const pronouns = ['私', 'あなた', '彼', '彼女', 'これ', 'それ', 'あれ', 'どれ'];
  return pronouns.includes(word.kanji) || word.category === 'pronoun';
}

/**
 * Проверяет, является ли слово указательным местоимением места
 */
function isLocationPronoun(word) {
  if (!word) return false;
  const locationPronouns = ['ここ', 'そこ', 'あそこ', 'どこ'];
  return locationPronouns.includes(word.kanji) || locationPronouns.includes(word.writing);
}

/**
 * Умная генерация подсказок с учетом местоимений
 * Избегает дублирования переводов местоимений в подсказке
 */
function smartHint(word1, word2, grammarQuestion, particleType) {
  const t1 = shortT(word1);
  const t2 = shortT(word2);

  // Специальные случаи для частиц は и も с местоимениями
  if ((particleType === 'は' || particleType === 'も') && isPronoun(word1)) {
    // "私 は 学生 です" → "я — студент" (не "я — это студент")
    // "これ は 本 です" → "это — книга" (не "это — это книга")
    if (particleType === 'は') {
      return `${t1} — ${t2}`;
    } else if (particleType === 'も') {
      return `${t1} — тоже ${t2}`;
    }
  }

  // Для の с местоимениями используем родительный падеж
  if (particleType === 'の' && isPronoun(word1)) {
    const genitiveMap = {
      я: 'моя/мой/моё',
      ты: 'твоя/твой/твоё',
      он: 'его',
      она: 'её',
      это: 'этого',
      то: 'того',
    };
    const genitive = genitiveMap[t1] || t1;
    return `${t2} (чья/чей/чьё? — ${genitive})`;
  }

  // Для мест-местоимений (ここ, そこ) убираем дублирование "здесь"
  if (isLocationPronoun(word1) && grammarQuestion) {
    return `${t2} (${grammarQuestion})`;
  }

  // Стандартный формат: перевод + грамматический вопрос
  if (grammarQuestion) {
    return `${t2} (${grammarQuestion} — ${t1})`;
  }

  return `${t1} — ${t2}`;
}

/**
 * Проверяет запрещенные комбинации слов для шаблонов
 */
function isProhibitedCombination(word1, word2, particleType) {
  // Запрет: местоимение + местоимение (кроме の)
  if (particleType !== 'の' && isPronoun(word1) && isPronoun(word2)) {
    return true;
  }

  // Запрет: указательное место + указательное место
  if (isLocationPronoun(word1) && isLocationPronoun(word2)) {
    return true;
  }

  // Запрет: одинаковые слова
  if (word1.id === word2.id) {
    return true;
  }

  return false;
}

// ============================================================================
// БАЗА ГОТОВЫХ ПРЕДЛОЖЕНИЙ (CURATED SENTENCES)
// ============================================================================

/**
 * Тщательно подобранные предложения для каждой частицы N5.
 * Приоритет использования: сначала эти, потом шаблоны.
 */
export const CURATED_PARTICLE_SENTENCES = {
  // ───────────────────────────────────────────────────────────────────────
  // は (тема предложения)
  // ───────────────────────────────────────────────────────────────────────
  は: [
    { sentence: '田中さん [ _ ] 学生 です', hint: 'Танака-сан — студент', correct: 'は' },
    { sentence: '東京 [ _ ] 大きい です', hint: 'Токио — большой (город)', correct: 'は' },
    { sentence: '母 [ _ ] 先生 です', hint: 'мама — учитель', correct: 'は' },
    { sentence: '日本語 [ _ ] 難しい です', hint: 'японский язык — сложный', correct: 'は' },
    { sentence: '今日 [ _ ] 月曜日 です', hint: 'сегодня — понедельник', correct: 'は' },
    { sentence: '図書館 [ _ ] 静か です', hint: 'библиотека — тихая', correct: 'は' },
    { sentence: '猫 [ _ ] 可愛い です', hint: 'кошка — милая', correct: 'は' },
    { sentence: 'コーヒー [ _ ] 好き です', hint: 'кофе — нравится', correct: 'は' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // の (принадлежность, связь)
  // ───────────────────────────────────────────────────────────────────────
  の: [
    { sentence: '先生 [ _ ] 本', hint: 'книга (чья? — учителя)', correct: 'の' },
    { sentence: '友達 [ _ ] 家', hint: 'дом (чей? — друга)', correct: 'の' },
    { sentence: '日本 [ _ ] 大学', hint: 'университет (какой? — японский)', correct: 'の' },
    { sentence: '母 [ _ ] 仕事', hint: 'работа (чья? — мамы)', correct: 'の' },
    { sentence: '東京 [ _ ] 駅', hint: 'станция (какая? — токийская)', correct: 'の' },
    { sentence: '学生 [ _ ] 部屋', hint: 'комната (чья? — студента)', correct: 'の' },
    { sentence: '父 [ _ ] 会社', hint: 'компания (чья? — папы)', correct: 'の' },
    { sentence: '図書館 [ _ ] 本', hint: 'книга (чья/откуда? — библиотечная)', correct: 'の' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // を (прямой объект действия)
  // ───────────────────────────────────────────────────────────────────────
  を: [
    { sentence: 'コーヒー [ _ ] 飲みます', hint: 'пить (что? — кофе)', correct: 'を' },
    { sentence: '本 [ _ ] 読みます', hint: 'читать (что? — книгу)', correct: 'を' },
    { sentence: '映画 [ _ ] 見ます', hint: 'смотреть (что? — фильм)', correct: 'を' },
    { sentence: 'パン [ _ ] 食べます', hint: 'есть (что? — хлеб)', correct: 'を' },
    { sentence: '音楽 [ _ ] 聞きます', hint: 'слушать (что? — музыку)', correct: 'を' },
    { sentence: '宿題 [ _ ] します', hint: 'делать (что? — домашку)', correct: 'を' },
    { sentence: '手紙 [ _ ] 書きます', hint: 'писать (что? — письмо)', correct: 'を' },
    { sentence: '写真 [ _ ] 撮ります', hint: 'фотографировать (что? — фото)', correct: 'を' },
    { sentence: '日本語 [ _ ] 勉強します', hint: 'учить (что? — японский)', correct: 'を' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // に (направление, время, местонахождение)
  // ───────────────────────────────────────────────────────────────────────
  に: [
    { sentence: '学校 [ _ ] 行きます', hint: 'идти (куда? — в школу)', correct: 'に' },
    { sentence: '七時 [ _ ] 起きます', hint: 'вставать (когда? — в 7 часов)', correct: 'に' },
    { sentence: '日本 [ _ ] 住んでいます', hint: 'жить (где? — в Японии)', correct: 'に' },
    { sentence: '図書館 [ _ ] います', hint: 'находиться (где? — в библиотеке)', correct: 'に' },
    { sentence: '友達 [ _ ] 会います', hint: 'встречаться (с кем? — с другом)', correct: 'に' },
    { sentence: '机 [ _ ] あります', hint: 'быть/находиться (где? — на столе)', correct: 'に' },
    { sentence: '駅 [ _ ] 着きます', hint: 'прибывать (куда? — на станцию)', correct: 'に' },
    { sentence: '月曜日 [ _ ] 行きます', hint: 'идти (когда? — в понедельник)', correct: 'に' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // で (место действия, средство)
  // ───────────────────────────────────────────────────────────────────────
  で: [
    { sentence: '学校 [ _ ] 勉強します', hint: 'учиться (где? — в школе)', correct: 'で' },
    { sentence: '図書館 [ _ ] 本を読みます', hint: 'читать (где? — в библиотеке)', correct: 'で' },
    { sentence: 'レストラン [ _ ] 食べます', hint: 'есть (где? — в ресторане)', correct: 'で' },
    { sentence: 'バス [ _ ] 行きます', hint: 'ехать (на чём? — на автобусе)', correct: 'で' },
    { sentence: '日本語 [ _ ] 話します', hint: 'говорить (на чём? — на японском)', correct: 'で' },
    { sentence: '家 [ _ ] 映画を見ます', hint: 'смотреть (где? — дома)', correct: 'で' },
    { sentence: '鉛筆 [ _ ] 書きます', hint: 'писать (чем? — карандашом)', correct: 'で' },
    { sentence: '公園 [ _ ] 遊びます', hint: 'играть (где? — в парке)', correct: 'で' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // が (субъект, объект желания/способности)
  // ───────────────────────────────────────────────────────────────────────
  が: [
    { sentence: '猫 [ _ ] います', hint: 'кошка — есть/находится', correct: 'が' },
    { sentence: '水 [ _ ] 欲しい です', hint: 'вода — хочется', correct: 'が' },
    { sentence: '日本語 [ _ ] 分かります', hint: 'японский — понимаю', correct: 'が' },
    { sentence: '音楽 [ _ ] 好き です', hint: 'музыка — нравится', correct: 'が' },
    { sentence: '犬 [ _ ] います', hint: 'собака — есть/находится', correct: 'が' },
    { sentence: 'コーヒー [ _ ] 飲みたい です', hint: 'кофе — хочу выпить', correct: 'が' },
    {
      sentence: '漢字 [ _ ] 難しい です',
      hint: 'кандзи — сложные (субъект оценки)',
      correct: 'が',
    },
    { sentence: '誰 [ _ ] 来ますか', hint: 'кто — придёт?', correct: 'が' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // と (совместность, перечисление)
  // ───────────────────────────────────────────────────────────────────────
  と: [
    { sentence: '友達 [ _ ] 話します', hint: 'говорить (с кем? — с другом)', correct: 'と' },
    { sentence: '先生 [ _ ] 勉強します', hint: 'учиться (с кем? — с учителем)', correct: 'と' },
    { sentence: '家族 [ _ ] 食べます', hint: 'есть (с кем? — с семьёй)', correct: 'と' },
    {
      sentence: '母 [ _ ] 買い物します',
      hint: 'ходить за покупками (с кем? — с мамой)',
      correct: 'と',
    },
    { sentence: '彼 [ _ ] 映画を見ます', hint: 'смотреть фильм (с кем? — с ним)', correct: 'と' },
    { sentence: '犬 [ _ ] 散歩します', hint: 'гулять (с кем? — с собакой)', correct: 'と' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // へ (направление, более формальное чем に)
  // ───────────────────────────────────────────────────────────────────────
  へ: [
    { sentence: '学校 [ _ ] 行きます', hint: 'идти (куда? — в школу)', correct: 'へ' },
    { sentence: '家 [ _ ] 帰ります', hint: 'возвращаться (куда? — домой)', correct: 'へ' },
    { sentence: '東京 [ _ ] 行きます', hint: 'ехать (куда? — в Токио)', correct: 'へ' },
    { sentence: '北 [ _ ] 行きます', hint: 'идти (куда? — на север)', correct: 'へ' },
    { sentence: '駅 [ _ ] 走ります', hint: 'бежать (куда? — к станции)', correct: 'へ' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // から (исходная точка: места, времени)
  // ───────────────────────────────────────────────────────────────────────
  から: [
    { sentence: '学校 [ _ ] 帰ります', hint: 'возвращаться (откуда? — из школы)', correct: 'から' },
    {
      sentence: '朝 [ _ ] 勉強します',
      hint: 'учиться (с какого времени? — с утра)',
      correct: 'から',
    },
    { sentence: '東京 [ _ ] 来ました', hint: 'приехать (откуда? — из Токио)', correct: 'から' },
    {
      sentence: '九時 [ _ ] 始まります',
      hint: 'начинаться (с какого времени? — с 9 часов)',
      correct: 'から',
    },
    { sentence: '日本 [ _ ] 来ました', hint: 'приехать (откуда? — из Японии)', correct: 'から' },
    { sentence: '家 [ _ ] 出ます', hint: 'выходить (откуда? — из дома)', correct: 'から' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // まで (конечная точка: места, времени)
  // ───────────────────────────────────────────────────────────────────────
  まで: [
    { sentence: '学校 [ _ ] 歩きます', hint: 'идти пешком (докуда? — до школы)', correct: 'まで' },
    {
      sentence: '夜 [ _ ] 勉強します',
      hint: 'учиться (до какого времени? — до вечера)',
      correct: 'まで',
    },
    { sentence: '駅 [ _ ] 行きます', hint: 'идти (докуда? — до станции)', correct: 'まで' },
    {
      sentence: '五時 [ _ ] 働きます',
      hint: 'работать (до какого времени? — до 5 часов)',
      correct: 'まで',
    },
    {
      sentence: '図書館 [ _ ] 走ります',
      hint: 'бежать (докуда? — до библиотеки)',
      correct: 'まで',
    },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // も (тоже, также)
  // ───────────────────────────────────────────────────────────────────────
  も: [
    { sentence: '田中さん [ _ ] 学生 です', hint: 'Танака-сан — тоже студент', correct: 'も' },
    { sentence: '東京 [ _ ] 大きい です', hint: 'Токио — тоже большой', correct: 'も' },
    { sentence: '母 [ _ ] 先生 です', hint: 'мама — тоже учитель', correct: 'も' },
    { sentence: '犬 [ _ ] います', hint: 'собака — тоже есть', correct: 'も' },
    { sentence: '日本語 [ _ ] 勉強します', hint: 'японский — тоже учу', correct: 'も' },
    { sentence: 'コーヒー [ _ ] 好き です', hint: 'кофе — тоже нравится', correct: 'も' },
  ],

  // ───────────────────────────────────────────────────────────────────────
  // か (вопросительная частица)
  // ───────────────────────────────────────────────────────────────────────
  か: [
    { sentence: '学生 です [ _ ]', hint: 'студент — это студент?', correct: 'か' },
    { sentence: '日本人 です [ _ ]', hint: 'японец — это японец?', correct: 'か' },
    { sentence: '分かります [ _ ]', hint: 'понимаете?', correct: 'か' },
    { sentence: '行きます [ _ ]', hint: 'пойдёте?', correct: 'か' },
    { sentence: '好き です [ _ ]', hint: 'нравится?', correct: 'か' },
    { sentence: '美味しい です [ _ ]', hint: 'вкусно?', correct: 'か' },
  ],
};

// ============================================================================
// УМНЫЕ ШАБЛОНЫ (SMART TEMPLATES)
// ============================================================================

/**
 * Улучшенные шаблоны с интеллектуальной генерацией подсказок.
 * Используются когда готовые предложения не подходят.
 */
export const SMART_PARTICLE_TEMPLATES = {
  の: {
    slots: [['person', 'country', 'place'], ['noun']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'чей? чья? чьё?', 'の'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'の'),
  },

  を: {
    slots: [['noun'], ['verb']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'что?', 'を'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'を'),
  },

  で: {
    slots: [['place'], ['verb']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'где? на чём? чем?', 'で'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'で'),
  },

  に: {
    slots: [['place', 'time'], ['verb']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'куда? когда? где?', 'に'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'に'),
  },

  へ: {
    slots: [['place'], ['verb']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'куда?', 'へ'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'へ'),
  },

  と: {
    slots: [['person'], ['verb']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'с кем?', 'と'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'と'),
  },

  が: {
    slots: [['noun'], ['adjective', 'verb']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, null, 'が'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'が'),
  },

  は: {
    slots: [
      ['noun', 'person'],
      ['noun', 'adjective'],
    ],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing} です`,
    hint: (w1, w2) => smartHint(w1, w2, null, 'は'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'は'),
  },

  も: {
    slots: [
      ['noun', 'person'],
      ['noun', 'adjective'],
    ],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing} です`,
    hint: (w1, w2) => smartHint(w1, w2, null, 'も'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'も'),
  },

  から: {
    slots: [['place', 'time'], ['verb']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'откуда? с какого времени?', 'から'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'から'),
  },

  まで: {
    slots: [['place', 'time'], ['verb']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'докуда? до какого времени?', 'まで'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'まで'),
  },

  より: {
    slots: [['noun'], ['adjective']],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => smartHint(w1, w2, 'чем?', 'より'),
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'より'),
  },

  か: {
    slots: [
      ['noun', 'person'],
      ['noun', 'adjective'],
    ],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing} ですか`,
    hint: (w1, w2) => {
      const t1 = shortT(w1);
      const t2 = shortT(w2);
      if (isPronoun(w1)) {
        return `${t1} — ${t2}?`;
      }
      return `${t1} — это ${t2}?`;
    },
    prohibitedCombinations: (w1, w2) => isProhibitedCombination(w1, w2, 'か'),
  },
};

// ============================================================================
// КАТЕГОРИИ СЛОВ ДЛЯ СЛОТОВ
// ============================================================================

export const SLOT_CATEGORIES = {
  noun: ['nouns', 'things', 'food', 'objects', 'entertainment', 'activities'],
  person: ['people', 'occupation', 'family', 'person'],
  place: ['places', 'location_words'],
  country: ['countries'],
  time: ['time'],
  verb: ['verbs_u', 'verbs_ru', 'verbs_irr', 'u-verbs', 'ru-verbs', 'irregular-verbs'],
  adjective: ['i-adjectives', 'na-adjectives', 'adjectives'],
};

export const FORBIDDEN_CATEGORIES = [
  'greetings',
  'expressions',
  'suffixes',
  'numbers',
  'particles',
  'phrases',
];

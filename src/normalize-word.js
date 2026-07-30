export function normalizeWord(raw, lessonId) {
  if (!raw) return null;

  // 1. Извлекаем существующие/переданные поля
  let partOfSpeech = raw.partOfSpeech || null;
  let verbClass = raw.verbClass || null;
  let note = raw.note || null;
  let transitivity = raw.transitivity || null;
  const semanticTags = Array.isArray(raw.semanticTags) ? [...raw.semanticTags] : [];

  // 2. Обработка перевода и служебных пометок $$...$$
  let translation = (raw.meaning || raw.translation || '').trim();
  translation = translation
    .replace(/\$\$(.*?)\$\$/g, (match, tag) => {
      const t = tag.trim();
      const tLower = t.toLowerCase();
      if (tLower === 'u-глагол-исключение' || tLower === 'u-исключение') {
        verbClass = 'godan';
        const exceptionNote = 'Исключение (спрягается как u-глагол)';
        if (!note) {
          note = exceptionNote;
        } else if (!note.includes(exceptionNote)) {
          note = `${note} | ${exceptionNote}`;
        }
      } else if (tLower === 'непереходный') {
        transitivity = 'intransitive';
        if (!semanticTags.includes(t)) {
          semanticTags.push(t);
        }
      } else if (tLower === 'переходный') {
        transitivity = 'transitive';
        if (!semanticTags.includes(t)) {
          semanticTags.push(t);
        }
      } else {
        if (!semanticTags.includes(t)) {
          semanticTags.push(t);
        }
      }
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Категоризация и извлечение тем
  const cat = (raw.category || '').toLowerCase();
  let topic = raw.topic || null;

  const TOPIC_MAP = {
    food: 'food',
    time: 'time',
    numbers: 'numbers',
    things: 'things',
    places: 'places',
    people: 'people',
    person: 'people',
    family: 'family',
    greetings: 'greetings',
    pointing_words: 'pointing_words',
    location_words: 'location_words',
    entertainment: 'entertainment',
    countries: 'countries',
    majors: 'majors',
    occupation: 'occupation',
    money: 'money',
    activities: 'activities',
    phone: 'phone',
  };

  const POS_MAP = {
    nouns: 'noun',
    noun: 'noun',
    verbs_u: 'verb',
    'u-verbs': 'verb',
    'u-verb': 'verb',
    verbs_ru: 'verb',
    'ru-verbs': 'verb',
    'ru-verb': 'verb',
    verbs_irr: 'verb',
    'irregular-verbs': 'verb',
    irregular: 'verb',
    verb: 'verb',
    verbs: 'verb',
    'i-adjectives': 'adjective',
    'na-adjectives': 'adjective',
    adjectives: 'adjective',
    adjective: 'adjective',
    adj: 'adjective',
    adverbs: 'adverb',
    adverb: 'adverb',
    adv: 'adverb',
    particles: 'particle',
    particle: 'particle',
    expressions: 'expression',
    expression: 'expression',
  };

  if (TOPIC_MAP[cat] && !topic) {
    topic = TOPIC_MAP[cat];
  }

  if (!partOfSpeech) {
    if (POS_MAP[cat]) {
      partOfSpeech = POS_MAP[cat];
    } else if (TOPIC_MAP[cat]) {
      partOfSpeech = 'noun'; // By default, topic categories like 'food', 'time' consist of nouns
    } else if (cat) {
      partOfSpeech = 'other';
    }
  }

  if (partOfSpeech === 'verb' && !verbClass) {
    if (cat === 'verbs_ru' || cat === 'ru-verbs' || cat === 'ru-verb') {
      verbClass = 'ichidan';
    } else if (cat === 'verbs_u' || cat === 'u-verbs' || cat === 'u-verb') {
      verbClass = 'godan';
    } else if (cat === 'verbs_irr' || cat === 'irregular-verbs' || cat === 'irregular') {
      verbClass = 'irregular';
    }
  }

  // Если часть речи не глагол, то verbClass должен быть null
  if (partOfSpeech !== 'verb') {
    verbClass = null;
  }

  // Извлечение частиц из перевода
  let particlePatterns = Array.isArray(raw.particlePatterns) ? [...raw.particlePatterns] : [];
  translation = translation
    .replace(
      /\(?[〜~～]([はのをにでへとがもか](?:\/[はのをにでへとがもか])*)\)?/g,
      (match, particlesStr) => {
        const parts = particlesStr.split('/');
        parts.forEach((p) => {
          if (!particlePatterns.includes(p)) particlePatterns.push(p);
        });
        return '';
      }
    )
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (particlePatterns.length === 0) particlePatterns = null;

  // 4. Формирование базовых полей
  const writing = raw.reading || raw.writing || '';
  const kanji = raw.writtenForm || raw.kanji || writing;
  const lesson = raw.lesson || raw.lessonId || lessonId || null;

  // 4a. Извлечение типа прилагательного
  let adjectiveClass = raw.adjectiveClass || null;
  if (partOfSpeech === 'adjective' && !adjectiveClass) {
    if (cat === 'i-adjectives') adjectiveClass = 'i';
    else if (cat === 'na-adjectives') adjectiveClass = 'na';
    else {
      // Явное сопоставление для слов из общих категорий
      const w = raw.reading || raw.writing || raw.writtenForm || raw.kanji || '';
      if (w === 'いい' || w === 'はやい' || w === '新しい') {
        adjectiveClass = 'i';
      } else if (w.includes('きれい') || w.includes('げんき') || w.includes('しずか')) {
        adjectiveClass = 'na';
      }
    }
  }
  if (partOfSpeech !== 'adjective') {
    adjectiveClass = null;
  }

  // 5. Генерация устойчивого lexemeId
  let lexemeId = raw.lexemeId || raw.lexeme_id;
  if (!lexemeId) {
    const vc = verbClass ? `_${verbClass}` : '';
    const baseMeaning = getBaseMeaning(translation);
    const meaningPart = baseMeaning ? `_${baseMeaning}` : '';
    lexemeId = `${writing}_${kanji}_${partOfSpeech || 'none'}${vc}${meaningPart}`;
  }

  // 6. Сбор всех остальных полей
  const examples = Array.isArray(raw.examples) ? raw.examples : null;
  const lessonIds = Array.isArray(raw.lessonIds) ? [...raw.lessonIds] : lesson ? [lesson] : [];

  return {
    id: raw.id,
    localId: raw.localId || raw.id,
    courseId: raw.courseId || null,
    dictionaryId: raw.dictionaryId || null,
    introducedIn: raw.introducedIn || lesson,
    lesson,
    writtenForm: kanji,
    reading: writing,
    meaning: translation,
    // Runtime compatibility adapter for UI code that still consumes the
    // former lesson schema. Raw GENKI JSON no longer stores these aliases.
    kanji,
    writing,
    romaji: raw.romaji || '',
    translation,
    category: raw.category || '',
    topic,
    partOfSpeech,
    verbClass,
    adjectiveClass,
    lexemeId,
    lessonIds,
    semanticTags,
    particlePatterns,
    transitivity,
    note,
    examples,
    contextProduction: raw.contextProduction || raw.context_production || null,
    acceptedAnswers: raw.acceptedAnswers || raw.accepted_answers || null,
  };
}

function getBaseMeaning(translation) {
  if (!translation) return '';
  // Удаляем пояснения в скобках
  let text = translation
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/（.*?）/g, '');
  // Разделяем по союзам "или", запятым, точкам с запятой, косой черте
  const parts = text.split(/[;,/]| или /);
  const cleanedParts = parts
    .map((p) =>
      p
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, '')
        .trim()
    )
    .filter(Boolean);

  if (cleanedParts.length === 0) return '';
  cleanedParts.sort();
  return cleanedParts[0];
}

export function normalizeWord(raw, lessonId) {
  if (!raw) return null;

  // 1. Извлекаем существующие/переданные поля
  let partOfSpeech = raw.partOfSpeech || null;
  let verbClass = raw.verbClass || null;
  let note = raw.note || null;
  let transitivity = raw.transitivity || null;
  const semanticTags = Array.isArray(raw.semanticTags) ? [...raw.semanticTags] : [];

  // 2. Обработка перевода и служебных пометок $$...$$
  let translation = (raw.translation || '').trim();
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

  if (!partOfSpeech) {
    if (cat === 'adverbs' || cat === 'adverb' || cat === 'adv') {
      partOfSpeech = 'adverb';
    } else if (
      cat === 'verbs_u' ||
      cat === 'u-verbs' ||
      cat === 'u-verb' ||
      cat === 'verbs_ru' ||
      cat === 'ru-verbs' ||
      cat === 'ru-verb' ||
      cat === 'verbs_irr' ||
      cat === 'irregular-verbs' ||
      cat === 'irregular' ||
      cat === 'verb' ||
      cat === 'verbs'
    ) {
      partOfSpeech = 'verb';
    } else if (cat === 'nouns' || cat === 'noun') {
      partOfSpeech = 'noun';
    } else if (
      cat === 'i-adjectives' ||
      cat === 'na-adjectives' ||
      cat === 'adjectives' ||
      cat === 'adjective' ||
      cat === 'adj'
    ) {
      partOfSpeech = 'adjective';
    } else if (cat === 'particles' || cat === 'particle') {
      partOfSpeech = 'particle';
    } else if (cat === 'expressions' || cat === 'expression') {
      partOfSpeech = 'expression';
    } else if (cat) {
      partOfSpeech = 'other';
      topic = cat; // Если это не часть речи, то это тема
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

  // 4. Формирование базовых полей
  const writing = raw.writing || '';
  const kanji = raw.kanji || writing;

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
  const lessonIds = Array.isArray(raw.lessonIds) ? [...raw.lessonIds] : lessonId ? [lessonId] : [];

  return {
    id: raw.id,
    kanji,
    writing,
    romaji: raw.romaji || '',
    translation,
    topic,
    partOfSpeech,
    verbClass,
    lexemeId,
    lessonIds,
    semanticTags,
    particlePatterns: raw.particlePatterns || raw.particle_patterns || null,
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

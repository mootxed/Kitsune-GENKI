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

  // 3. Категоризация, если partOfSpeech / verbClass еще не определены
  const cat = (raw.category || '').toLowerCase();
  if (!partOfSpeech) {
    if (
      cat.includes('verbs_u') ||
      cat.includes('u-verbs') ||
      cat.includes('u-verb') ||
      cat.includes('verbs_ru') ||
      cat.includes('ru-verbs') ||
      cat.includes('ru-verb') ||
      cat.includes('verbs_irr') ||
      cat.includes('irregular') ||
      cat.includes('verb')
    ) {
      partOfSpeech = 'verb';
    } else if (cat.includes('noun')) {
      partOfSpeech = 'noun';
    } else if (cat.includes('adjective') || cat === 'adj' || cat.includes('adj')) {
      partOfSpeech = 'adjective';
    } else if (cat.includes('adverb') || cat === 'adv') {
      partOfSpeech = 'adverb';
    } else if (cat === 'particles' || cat === 'particle') {
      partOfSpeech = 'particle';
    } else if (cat === 'expressions' || cat === 'expression') {
      partOfSpeech = 'expression';
    } else if (cat) {
      partOfSpeech = cat; // Fallback
    }
  }

  if (partOfSpeech === 'verb' && !verbClass) {
    if (cat.includes('verbs_ru') || cat.includes('ru-verbs') || cat.includes('ru-verb')) {
      verbClass = 'ichidan';
    } else if (cat.includes('verbs_u') || cat.includes('u-verbs') || cat.includes('u-verb')) {
      verbClass = 'godan';
    } else if (cat.includes('verbs_irr') || cat.includes('irregular')) {
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
    category: raw.category || null,
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

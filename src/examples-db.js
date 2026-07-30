/**
 * ExamplesDB — Надежный слой данных для примеров употребления слов.
 */

import { conjugateVerb } from './verb-conjugator.js';
import { canonicalLessonId, compareLessonIds } from './courses/course-context.js';

// Список стандартных N5 частиц для быстрого поиска/определения grammarIds
const KNOWN_PARTICLES = new Set([
  'は',
  'の',
  'を',
  'に',
  'で',
  'が',
  'と',
  'も',
  'へ',
  'から',
  'まで',
  'か',
  'ね',
  'よ',
]);

export class ExamplesDBClass {
  constructor() {
    this.vocabulary = new Map(); // id -> normalized word
    this.rawSentences = []; // List of all registered raw sentences
    this.examples = []; // Compiled unique Example objects
    this.lexemeIndex = new Map(); // lexemeId -> Array<Example>
  }

  /**
   * Сбросить все накопленные данные
   */
  clear() {
    this.vocabulary.clear();
    this.rawSentences = [];
    this.examples = [];
    this.lexemeIndex.clear();
  }

  /**
   * Зарегистрировать список слов в словаре
   */
  registerVocabulary(words) {
    if (!words) return;
    const arr = Array.isArray(words) ? words : [words];
    for (const w of arr) {
      if (w && w.id) {
        this.vocabulary.set(w.id, w);
      }
    }
  }

  /**
   * Добавить одно сырое предложение для последующего индексирования
   */
  addRawSentence({
    japanese,
    reading = '',
    translation = '',
    sourceLessonId = null,
    source = 'unknown',
    acceptedAnswers = null,
    requiredForm = null,
    targetLexemeIds = null,
    id = null,
  }) {
    if (!japanese || !japanese.trim()) return;
    const trimmedJp = japanese.trim();
    const existing = this.rawSentences.find((s) => s.japanese === trimmedJp);
    if (existing) {
      if (targetLexemeIds && targetLexemeIds.length > 0) {
        existing.targetLexemeIds = Array.from(
          new Set([...(existing.targetLexemeIds || []), ...targetLexemeIds])
        );
      }
      if (id && !existing.id) existing.id = id;
      return;
    }
    this.rawSentences.push({
      id: id || null,
      japanese: trimmedJp,
      reading: reading.trim(),
      translation: translation.trim(),
      sourceLessonId: canonicalLessonId(sourceLessonId),
      source,
      acceptedAnswers,
      requiredForm,
      targetLexemeIds: Array.isArray(targetLexemeIds) ? targetLexemeIds : null,
    });
  }

  /**
   * Извлечь предложения из уроков (lesson.notes и vocabulary.contextProduction)
   */
  registerLesson(lessonData) {
    if (!lessonData) return;
    const lesson = lessonData.lesson || lessonData;
    const lessonId = canonicalLessonId(lesson.id || lesson.lesson_id);

    // 1. Зарегистрировать лексику урока
    const words = lesson.words || lesson.vocabulary;
    if (words) {
      this.registerVocabulary(words);

      // Проверить наличие вручную подготовленных contextProduction
      for (const word of words) {
        const cp = word.contextProduction || word.context_production;
        if (cp && cp.prompt && cp.meaningCue && cp.requiredForm) {
          const accepted = Array.isArray(cp.acceptedAnswers)
            ? cp.acceptedAnswers
            : cp.acceptedAnswers
              ? [cp.acceptedAnswers]
              : [];
          if (accepted.length > 0) {
            // Реконструируем предложение: подставляем первый принятый ответ вместо пропуска
            const answer = accepted[0];
            const sentenceJp = cp.prompt.replace(/\[\s*_\s*\]|___|_/g, answer);

            this.addRawSentence({
              japanese: sentenceJp,
              reading: word.writing || '',
              translation: `${cp.meaningCue} (${word.translation || ''})`,
              sourceLessonId: lessonId,
              source: 'contextProduction',
              acceptedAnswers: accepted,
              requiredForm: cp.requiredForm,
              targetLexemeIds: [word.lexemeId || word.id],
            });
          }
        }
      }
    }

    // 2. Парсинг предложений из заметок урока
    const notes = lesson.grammar || lesson.notes;
    if (notes) {
      const noteList = Array.isArray(notes) ? notes : Object.values(notes);

      for (const note of noteList) {
        if (!note.content) continue;
        this.extractSentencesFromText(note.content, lessonId, 'note');
      }
    }

    // 3. Парсинг предложений из культурных заметок
    const culturalNotes = lesson.cultural || lesson.cultural_notes;
    if (culturalNotes) {
      const culturalList = Array.isArray(culturalNotes)
        ? culturalNotes
        : Object.values(culturalNotes);

      for (const note of culturalList) {
        if (!note.content) continue;
        this.extractSentencesFromText(note.content, lessonId, 'note');
      }
    }
  }

  /**
   * Извлечь предложения из истории
   */
  registerStory(storyData) {
    if (!storyData || !storyData.content) return;
    const lessonId = canonicalLessonId(storyData.lessonId || storyData.lesson_id || storyData.id);

    for (const item of storyData.content) {
      if (!item.tokens) continue;

      // Сборка предложения из токенов
      const japanese = item.tokens.map((t) => t.kanji || t.writing || '').join('');
      const reading = item.tokens.map((t) => t.writing || t.kanji || '').join('');
      const translation = item.translation || '';
      const tokenLexemes = item.tokens.map((t) => t.lexemeId || t.wordId).filter(Boolean);

      this.addRawSentence({
        japanese,
        reading,
        translation,
        sourceLessonId: lessonId,
        source: 'story',
        targetLexemeIds: tokenLexemes.length > 0 ? tokenLexemes : null,
      });
    }
  }

  /**
   * Зарегистрировать примеры из словаря частиц
   */
  registerParticlesDictionary(particlesData) {
    if (!particlesData) return;
    const particles = particlesData.particles
      ? Object.values(particlesData.particles)
      : Array.isArray(particlesData)
        ? particlesData
        : Object.values(particlesData);

    for (const p of particles) {
      if (!p.usage_examples) continue;
      const lessonId = canonicalLessonId(p.introducedInLesson || p.introduced_in_lesson);

      for (const line of p.usage_examples) {
        // Парсим: "私は田中です (Watashi wa Tanaka desu) — Я Танака"
        const match = line.match(
          /^([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F\s]+)\s*\(([^)]+)\)\s*(?:—|-)\s*(.+)$/
        );
        if (match) {
          this.addRawSentence({
            japanese: match[1].trim(),
            reading: match[2].trim(),
            translation: match[3].trim(),
            sourceLessonId: lessonId,
            source: 'particles',
          });
        } else {
          // Альтернативный парсинг без транскрипции
          const parts = line.split(/(?:—|-)/);
          if (parts.length >= 2) {
            this.addRawSentence({
              japanese: parts[0].trim(),
              reading: '',
              translation: parts[1].trim(),
              sourceLessonId: lessonId,
              source: 'particles',
            });
          }
        }
      }
    }
  }

  /**
   * Зарегистрировать curated примеры слов из отдельного JSON-файла
   */
  registerCuratedWordExamples(curatedData) {
    if (!curatedData) return;
    const list = Array.isArray(curatedData)
      ? curatedData
      : Array.isArray(curatedData.examples)
        ? curatedData.examples
        : [];

    for (const ex of list) {
      if (!ex || !ex.japanese) continue;
      const targetId = ex.targetWordId || ex.targetLexemeId || ex.lexemeId || ex.wordId;
      if (!targetId) continue;

      let resolvedLexemeId = targetId;
      const vocabWord = this.vocabulary.get(targetId);
      if (vocabWord) {
        resolvedLexemeId = vocabWord.lexemeId || vocabWord.id;
      } else {
        const found = Array.from(this.vocabulary.values()).find(
          (w) => w.lexemeId === targetId || w.id === targetId
        );
        if (found) {
          resolvedLexemeId = found.lexemeId || found.id;
        } else if (!/^L\d+_/i.test(targetId)) {
          console.warn(
            `[ExamplesDB] Warning: Unknown targetWordId/targetLexemeId in curated examples: ${targetId}`
          );
        }
      }

      this.addRawSentence({
        id: ex.id || null,
        japanese: ex.japanese,
        reading: ex.reading || '',
        translation: ex.translation || '',
        sourceLessonId: ex.minLesson || ex.lessonRequired || 1,
        source: 'curated-word',
        targetLexemeIds: [resolvedLexemeId],
      });
    }

    this.rebuildIndex();
  }

  /**
   * Зарегистрировать готовые задания (CURATED_PARTICLE_SENTENCES)
   */
  registerCuratedParticleSentences(curatedData) {
    if (!curatedData) return;

    // Определяем уровни ввода частиц
    const particleLessons = {
      は: 1,
      の: 1,
      か: 1,
      を: 3,
      де: 3,
      に: 3,
      へ: 3,
      も: 4,
      と: 4,
      が: 5,
    };

    for (const [particle, list] of Object.entries(curatedData)) {
      if (!Array.isArray(list)) continue;
      const lessonId = particleLessons[particle] || 1;

      for (const ex of list) {
        if (!ex.sentence || !ex.correct) continue;

        // Подставляем верную частицу вместо [ _ ]
        const sentenceJp = ex.sentence.replace(/\[\s*_\s*\]|___|_/g, ex.correct);

        this.addRawSentence({
          japanese: sentenceJp,
          reading: '',
          translation: ex.hint || '',
          sourceLessonId: lessonId,
          source: 'curated',
        });
      }
    }
  }

  /**
   * Вспомогательный парсер предложений из markdown заметок
   */
  extractSentencesFromText(text, lessonId, source) {
    const lines = text.split(/\n/);

    // Pattern 1: JP (romaji) — RU
    const regex1 =
      /([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F]+(?:\s+[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F]+)*)\s*\(([\w\s-'’，,?!/]+)\)\s*(?:=|—|-)\s*([^（\n()]+)/g;

    // Pattern 2: JP — RU (no romaji)
    const regex2 =
      /([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F]{2,}(?:\s+[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F]+)*)\s*(?:=|—)\s*([^（\n()a-zA-Z]+)/g;

    // Pattern 3: JP (RU)
    const regex3 =
      /([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F]{3,}(?:\s+[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3000-\u303F]+)*)\s*\(([\u0400-\u04FF\s,.\-!?;:()]+)\)/g;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      let matched = false;
      let match;

      regex1.lastIndex = 0;
      regex2.lastIndex = 0;
      regex3.lastIndex = 0;

      while ((match = regex1.exec(line)) !== null) {
        this.addRawSentence({
          japanese: match[1],
          reading: match[2],
          translation: match[3].replace(/['"().;]+$/, '').trim(),
          sourceLessonId: lessonId,
          source,
        });
        matched = true;
      }
      if (matched) continue;

      while ((match = regex3.exec(line)) !== null) {
        this.addRawSentence({
          japanese: match[1],
          reading: '',
          translation: match[2],
          sourceLessonId: lessonId,
          source,
        });
        matched = true;
      }
      if (matched) continue;

      while ((match = regex2.exec(line)) !== null) {
        this.addRawSentence({
          japanese: match[1],
          reading: '',
          translation: match[2].replace(/['"().;]+$/, '').trim(),
          sourceLessonId: lessonId,
          source,
        });
      }
    }
  }

  /**
   * Собрать и проиндексировать все сырые предложения
   */
  rebuildIndex() {
    this.examples = [];
    this.lexemeIndex.clear();

    const allVocab = Array.from(this.vocabulary.values());
    const seen = new Set();

    let idCounter = 1;

    for (const raw of this.rawSentences) {
      let matchedWords = [];
      if (raw.targetLexemeIds && raw.targetLexemeIds.length > 0) {
        matchedWords = allVocab.filter((w) => raw.targetLexemeIds.includes(w.lexemeId || w.id));
      } else {
        matchedWords = allVocab.filter((w) => isWordInSentence(w, raw.japanese));
      }

      // Ищем частицы в предложении
      const matchedParticles = [];
      for (const p of KNOWN_PARTICLES) {
        if (raw.japanese.includes(p)) {
          matchedParticles.push(p);
        }
      }

      const vocabularyIds = matchedWords.map((w) => w.id);

      // Расчет требуемого урока на основе грамматики и всей лексики предложения
      const maxVocabLesson = matchedWords.reduce((latest, word) => {
        const introducedIn =
          word.lessonIds && word.lessonIds.length > 0
            ? [...word.lessonIds].sort(compareLessonIds)[0]
            : canonicalLessonId(1);
        return latest == null || compareLessonIds(introducedIn, latest) > 0 ? introducedIn : latest;
      }, null);

      const sourceLessonId = canonicalLessonId(raw.sourceLessonId || 1);
      const lessonRequired =
        maxVocabLesson != null && compareLessonIds(maxVocabLesson, sourceLessonId) > 0
          ? maxVocabLesson
          : sourceLessonId;

      // Для каждого подходящего слова создаем нормализованную модель примера
      for (const word of matchedWords) {
        const lexemeId = word.lexemeId || word.id;
        if (!lexemeId) continue;

        // Дедупликация: целевое слово + текст предложения
        const dupKey = `${lexemeId}_${raw.japanese.replace(/[\s、。？！・]/g, '')}`;
        if (seen.has(dupKey)) continue;
        seen.add(dupKey);

        const example = {
          id: raw.id || `ex-${idCounter++}`,
          targetLexemeId: lexemeId,
          japanese: raw.japanese,
          reading: raw.reading,
          translation: raw.translation,
          lessonRequired,
          grammarIds: matchedParticles,
          vocabularyIds,
          source: raw.source,
          acceptedAnswers: raw.acceptedAnswers,
          requiredForm: raw.requiredForm,
        };

        this.examples.push(example);

        if (!this.lexemeIndex.has(lexemeId)) {
          this.lexemeIndex.set(lexemeId, []);
        }
        this.lexemeIndex.get(lexemeId).push(example);
      }
    }
  }

  /**
   * Получить список примеров для лексемы с фильтрацией по открытым урокам
   */
  getExamplesForLexeme(lexemeId, userMaxLesson = 12) {
    const list = this.lexemeIndex.get(lexemeId);
    if (!list) return [];

    // Фильтруем, чтобы не использовать лексику и грамматику будущих уроков
    return list.filter((ex) => compareLessonIds(ex.lessonRequired, userMaxLesson) <= 0);
  }

  /**
   * Получить все зарегистрированные слова, доступные для текущего урока.
   * Используется генератором шаблонных предложений для выбора компаньонов.
   *
   * @param {string[]} [requiredTags] - если задано, фильтровать по семантическим тегам (category)
   * @param {number} [userMaxLesson=12] - максимальный урок пользователя
   * @returns {object[]} массив нормализованных слов
   */
  getCompatibleVocab(requiredTags = [], userMaxLesson = 12) {
    const result = [];
    for (const word of this.vocabulary.values()) {
      // Проверить, что слово открыто
      const introLesson =
        Array.isArray(word.lessonIds) && word.lessonIds.length > 0
          ? [...word.lessonIds].sort(compareLessonIds)[0]
          : canonicalLessonId(1);
      if (compareLessonIds(introLesson, userMaxLesson) > 0) continue;

      // Если теги не указаны — берём все слова
      if (requiredTags && requiredTags.length > 0) {
        const wordTags = [
          ...(Array.isArray(word.semanticTags) ? word.semanticTags : []),
          (word.category || '').toLowerCase(),
          word.partOfSpeech || '',
        ];
        const hasTag = requiredTags.some((t) => wordTags.includes(t));
        if (!hasTag) continue;
      }

      result.push(word);
    }
    return result;
  }
}

/**
 * Проверка границ кана-формы для исключения ложных совпадений типа いく → いくら, 暖かいくなる
 */
function hasCleanKanaBoundary(sentence, form, idx) {
  const prev = idx > 0 ? sentence[idx - 1] : '';
  const next = idx + form.length < sentence.length ? sentence[idx + form.length] : '';

  if (form === 'いく') {
    if (['ら', 'つ', 'く', 'ち', 'じ', '分'].includes(next)) return false;
    if (['暖か', '寒'].some((p) => sentence.slice(Math.max(0, idx - 2), idx).includes(p))) {
      return false;
    }
  }

  if (form.length <= 2) {
    if (
      prev &&
      /[\u3040-\u309F]/.test(prev) &&
      !['て', 'で', 'に', 'を', 'は', 'が', 'と'].includes(prev)
    ) {
      if (!['です', 'ます'].includes(form)) {
        // если перед короткой каной стоит другая кана не частица
      }
    }
  }

  return true;
}

/**
 * Проверка вхождения слова в японское предложение (с учетом спряжений глаголов/прилагательных)
 */
export function isWordInSentence(word, sentenceJp) {
  if (!sentenceJp || !word) return false;

  const kanji = (word.kanji || '').replace(/～/g, '').trim();
  const writing = (word.writing || '').replace(/～/g, '').trim();
  const hasKanji = kanji && kanji !== writing && /[\u4E00-\u9FAF]/.test(kanji);

  const pos =
    word.partOfSpeech ||
    (writing.endsWith('る') ||
    kanji.endsWith('む') ||
    kanji.endsWith('く') ||
    kanji.endsWith('つ') ||
    kanji.endsWith('う')
      ? 'verb'
      : writing.endsWith('い')
        ? 'adjective'
        : 'noun');

  // 1. Поиск по кандзи и его спряжениям (наиболее надежно)
  if (hasKanji) {
    if (sentenceJp.includes(kanji)) return true;

    if (pos === 'verb') {
      try {
        const forms = conjugateVerb(word);
        for (const f of forms) {
          if (f && f.kanji && f.kanji.length > 1 && sentenceJp.includes(f.kanji)) {
            return true;
          }
        }
      } catch {
        // ignore
      }
    }

    if (pos === 'adjective' && (writing.endsWith('い') || kanji.endsWith('い'))) {
      const kanjiStem = kanji.replace(/い$/, '');
      const writingStem = writing.replace(/い$/, '');
      if (kanjiStem && kanjiStem.length > 0 && sentenceJp.includes(kanjiStem)) return true;
      if (writingStem && writingStem.length >= 2 && sentenceJp.includes(writingStem)) return true;
    }

    // Если у слова есть кандзи, кана-поиск выполняется для точных спряжённых кана-форм с проверкой границ
    if (pos === 'verb') {
      try {
        const forms = conjugateVerb(word);
        for (const f of forms) {
          if (f && f.kana && f.kana.length >= 2) {
            let idx = sentenceJp.indexOf(f.kana);
            while (idx !== -1) {
              if (hasCleanKanaBoundary(sentenceJp, f.kana, idx)) {
                return true;
              }
              idx = sentenceJp.indexOf(f.kana, idx + 1);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return false;
  }

  // 2. Для слов без кандзи (кана-слово, напр. いくら, そこ)
  if (writing && writing.length > 0) {
    if (pos === 'adjective' && writing.endsWith('い')) {
      const writingStem = writing.replace(/い$/, '');
      if (writingStem && writingStem.length >= 2 && sentenceJp.includes(writingStem)) {
        return true;
      }
    }

    if (pos === 'verb') {
      try {
        const forms = conjugateVerb(word);
        for (const f of forms) {
          if (f && f.kana && f.kana.length >= 2) {
            let idx = sentenceJp.indexOf(f.kana);
            while (idx !== -1) {
              if (hasCleanKanaBoundary(sentenceJp, f.kana, idx)) {
                return true;
              }
              idx = sentenceJp.indexOf(f.kana, idx + 1);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    let idx = sentenceJp.indexOf(writing);
    while (idx !== -1) {
      if (hasCleanKanaBoundary(sentenceJp, writing, idx)) {
        return true;
      }
      idx = sentenceJp.indexOf(writing, idx + 1);
    }
  }

  return false;
}

export const ExamplesDB = new ExamplesDBClass();

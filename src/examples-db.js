/**
 * ExamplesDB — Надежный слой данных для примеров употребления слов в Kitsune-GENKI.
 */

import { conjugateVerb } from './verb-conjugator.js';

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
    sourceLessonId = 1,
    source = 'unknown',
    acceptedAnswers = null,
    requiredForm = null,
  }) {
    if (!japanese || !japanese.trim()) return;
    this.rawSentences.push({
      japanese: japanese.trim(),
      reading: reading.trim(),
      translation: translation.trim(),
      sourceLessonId: Number(sourceLessonId) || 1,
      source,
      acceptedAnswers,
      requiredForm,
    });
  }

  /**
   * Извлечь предложения из уроков (lesson.notes и vocabulary.contextProduction)
   */
  registerLesson(lessonData) {
    if (!lessonData) return;
    const lesson = lessonData.lesson || lessonData;
    const lessonId = Number(lesson.lesson_id) || 1;

    // 1. Зарегистрировать лексику урока
    if (lesson.vocabulary) {
      this.registerVocabulary(lesson.vocabulary);

      // Проверить наличие вручную подготовленных contextProduction
      for (const word of lesson.vocabulary) {
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
            });
          }
        }
      }
    }

    // 2. Парсинг предложений из заметок урока (lesson.notes)
    if (lesson.notes) {
      const noteList = Array.isArray(lesson.notes) ? lesson.notes : Object.values(lesson.notes);

      for (const note of noteList) {
        if (!note.content) continue;
        this.extractSentencesFromText(note.content, lessonId, 'note');
      }
    }

    // 3. Парсинг предложений из культурных заметок
    if (lesson.cultural_notes) {
      const culturalList = Array.isArray(lesson.cultural_notes)
        ? lesson.cultural_notes
        : Object.values(lesson.cultural_notes);

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
    const lessonId = Number(storyData.lesson_id) || Number(storyData.id) || 1;

    for (const item of storyData.content) {
      if (!item.tokens) continue;

      // Сборка предложения из токенов
      const japanese = item.tokens.map((t) => t.kanji || t.writing || '').join('');
      const reading = item.tokens.map((t) => t.writing || t.kanji || '').join('');
      const translation = item.translation || '';

      this.addRawSentence({
        japanese,
        reading,
        translation,
        sourceLessonId: lessonId,
        source: 'story',
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
      const lessonId = Number(p.introduced_in_lesson) || 1;

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
      // Ищем все подходящие слова в предложении
      const matchedWords = allVocab.filter((w) => isWordInSentence(w, raw.japanese));

      // Ищем частицы в предложении
      const matchedParticles = [];
      for (const p of KNOWN_PARTICLES) {
        if (raw.japanese.includes(p)) {
          matchedParticles.push(p);
        }
      }

      const vocabularyIds = matchedWords.map((w) => w.id);

      // Расчет требуемого урока на основе грамматики и всей лексики предложения
      const maxVocabLesson = matchedWords.reduce((max, w) => {
        const introL = w.lessonIds && w.lessonIds.length > 0 ? Math.min(...w.lessonIds) : 1;
        return Math.max(max, introL);
      }, 1);

      const lessonRequired = Math.max(raw.sourceLessonId, maxVocabLesson);

      // Для каждого подходящего слова создаем нормализованную модель примера
      for (const word of matchedWords) {
        const lexemeId = word.lexemeId;
        if (!lexemeId) continue;

        // Дедупликация: целевое слово + текст предложения
        const dupKey = `${lexemeId}_${raw.japanese.replace(/[\s、。？！・]/g, '')}`;
        if (seen.has(dupKey)) continue;
        seen.add(dupKey);

        const example = {
          id: `ex-${idCounter++}`,
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
    return list.filter((ex) => ex.lessonRequired <= userMaxLesson);
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
          ? Math.min(...word.lessonIds)
          : 1;
      if (introLesson > userMaxLesson) continue;

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
 * Проверка вхождения слова в японское предложение (с учетом спряжений глаголов/прилагательных)
 */
export function isWordInSentence(word, sentenceJp) {
  if (!sentenceJp || !word) return false;

  const kanji = (word.kanji || '').trim();
  const writing = (word.writing || '').trim();

  // 1. Прямое совпадение кандзи (если оно есть)
  if (kanji && kanji !== '～' && sentenceJp.includes(kanji)) {
    return true;
  }

  // 2. Прямое совпадение каны
  if (writing && writing !== '～' && sentenceJp.includes(writing)) {
    return true;
  }

  // 3. Проверка спряжений глаголов
  if (word.partOfSpeech === 'verb') {
    try {
      const forms = conjugateVerb(word);
      for (const form of forms) {
        if (form.kanji && sentenceJp.includes(form.kanji)) {
          return true;
        }
        if (form.kana && sentenceJp.includes(form.kana)) {
          return true;
        }
      }
    } catch (e) {
      // Игнорируем ошибки спряжения для некорректно заполненных mock-слов
    }
  }

  // 4. Проверка основ i-прилагательных
  if (word.partOfSpeech === 'adjective' && writing.endsWith('い')) {
    const kanjiStem = kanji.endsWith('い') ? kanji.slice(0, -1) : kanji;
    const writingStem = writing.slice(0, -1);

    if (kanjiStem && sentenceJp.includes(kanjiStem)) return true;
    if (writingStem && sentenceJp.includes(writingStem)) return true;
  }

  return false;
}

export const ExamplesDB = new ExamplesDBClass();

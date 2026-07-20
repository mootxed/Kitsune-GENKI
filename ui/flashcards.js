// ui/flashcards.js - Модуль для работы с карточками SRS и словарём

import { $, $$ } from '../src/utils.js';
import { wordById, cardChapter, isWordUnlocked, getUnlockedParticles } from '../src/srs-helpers.js';
import { allCards } from '../src/srs-helpers.js';
import { SRS } from '../srs.js';
import { speakJapanese } from '../src/audio-helper.js';

// Локальный контекст зависимостей
let deps = null;

// Глобальные переменные модуля
let flashQueue = [];
let flashIdx = 0;
let flashRevealed = false;
let flashCtx = null;
let sessionManager = null;

// Глобальная переменная для HanziWriter
let currentWriter = null;
let drawingMistakes = 0;
let totalDrawingMistakes = 0;

// Переменные для последовательного рисования
let kanjiSequence = [];
let currentKanjiIndex = 0;

// Константы вероятности режимов карточек
const DRAWING_MODE_PROBABILITY = 0.25;
const TYPING_MODE_PROBABILITY = 0.25;
const MULTIPLE_CHOICE_PROBABILITY = 0.5;
// Оставшиеся 50% — режим множественного выбора

// Типы режимов карточек
const CARD_MODES = {
  DRAWING: 'drawing',
  TYPING: 'typing',
  MULTIPLE_CHOICE: 'multiple-choice',
  PARTICLE_QUIZ: 'particle-quiz',
};

// Шаблоны для генерации particle quiz
const PARTICLE_TEMPLATES = {
  の: {
    slots: ['noun', 'noun'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (чей?: ${w1.translation})`,
  },
  を: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (что?: ${w1.translation})`,
  },
  で: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (где?: ${w1.translation})`,
  },
  に: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (когда/куда?: ${w1.translation})`,
  },
  へ: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (куда?: ${w1.translation})`,
  },
  と: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (вместе с: ${w1.translation})`,
  },
  が: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (кто/что?: ${w1.translation})`,
  },
  は: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (тема: ${w1.translation})`,
  },
  も: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (тоже: ${w1.translation})`,
  },
  から: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (откуда?: ${w1.translation})`,
  },
  まで: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (до куда?: ${w1.translation})`,
  },
  より: {
    slots: ['noun', 'adjective'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (чем: ${w1.translation})`,
  },
  か: {
    slots: ['noun', 'verb'],
    template: (w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} (вопрос о: ${w1.translation})`,
  },
  // Fallback для неизвестных частиц
  default: {
    slots: ['noun', 'verb'],
    template: (particle, w1, w2) => `${w1.writing} [ _ ] ${w2.writing}`,
    hint: (w1, w2) => `${w2.translation} / ${w1.translation}`,
  },
};

// Конвертер Хирагана → Катакана (переиспользование из кроссвордов)
const HIRAGANA_TO_KATAKANA = {
  あ: 'ア',
  い: 'イ',
  う: 'ウ',
  え: 'エ',
  お: 'オ',
  か: 'カ',
  き: 'キ',
  く: 'ク',
  け: 'ケ',
  こ: 'コ',
  さ: 'サ',
  し: 'シ',
  す: 'ス',
  せ: 'セ',
  そ: 'ソ',
  た: 'タ',
  ち: 'チ',
  つ: 'ツ',
  て: 'テ',
  と: 'ト',
  な: 'ナ',
  に: 'ニ',
  ぬ: 'ヌ',
  ね: 'ネ',
  の: 'ノ',
  は: 'ハ',
  ひ: 'ヒ',
  ふ: 'フ',
  へ: 'ヘ',
  ほ: 'ホ',
  ま: 'マ',
  み: 'ミ',
  む: 'ム',
  め: 'メ',
  も: 'モ',
  や: 'ヤ',
  ゆ: 'ユ',
  よ: 'ヨ',
  ら: 'ラ',
  り: 'リ',
  る: 'ル',
  れ: 'レ',
  ろ: 'ロ',
  わ: 'ワ',
  を: 'ヲ',
  ん: 'ン',
  が: 'ガ',
  ぎ: 'ギ',
  ぐ: 'グ',
  げ: 'ゲ',
  ご: 'ゴ',
  ざ: 'ザ',
  じ: 'ジ',
  ず: 'ズ',
  ぜ: 'ゼ',
  ぞ: 'ゾ',
  だ: 'ダ',
  ぢ: 'ヂ',
  づ: 'ヅ',
  で: 'デ',
  ど: 'ド',
  ば: 'バ',
  び: 'ビ',
  ぶ: 'ブ',
  べ: 'ベ',
  ぼ: 'ボ',
  ぱ: 'パ',
  ぴ: 'ピ',
  ぷ: 'プ',
  ぺ: 'ペ',
  ぽ: 'ポ',
  ゃ: 'ャ',
  ゅ: 'ュ',
  ょ: 'ョ',
  っ: 'ッ',
  ー: 'ー',
};

// Вспомогательная функция перемешивания массива
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Функция генерации particle quiz
function generateParticleQuiz(particle, lessonData, state, LESSONS) {
  // Получаем шаблон для данной частицы
  const templateDef = PARTICLE_TEMPLATES[particle] || PARTICLE_TEMPLATES.default;
  if (!templateDef) {
    console.warn(`Нет шаблона для частицы: ${particle}`);
    return null;
  }

  const { slots, template, hint } = templateDef;

  // Собираем все разблокированные слова из всех уроков
  const allWords = LESSONS.flatMap((l) => l.words || []).filter((w) =>
    isWordUnlocked(w.id, state.chapters)
  );

  // Маппинг категорий слов на слоты
  const categoryMap = {
    noun: ['nouns', 'people', 'countries', 'occupation', 'time', 'places', 'food', 'objects'],
    verb: ['u-verbs', 'ru-verbs', 'irregular-verbs', 'verbs'],
    adjective: ['i-adjectives', 'na-adjectives', 'adjectives'],
    time: ['time', 'nouns'],
  };

  // Функция подбора слова для слота
  const findWordForSlot = (slotType) => {
    const categories = categoryMap[slotType] || ['nouns'];
    const candidates = allWords.filter((w) => categories.includes(w.category));

    if (candidates.length === 0) {
      // Fallback на любое слово с переводом
      return allWords.find((w) => w.translation);
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  // Подбираем слова для каждого слота
  const selectedWords = slots.map((slot) => findWordForSlot(slot));

  // Проверяем, что все слова найдены
  if (selectedWords.some((w) => !w)) {
    console.warn(`Не удалось подобрать слова для частицы: ${particle}`);
    return null;
  }

  // Генерируем предложение (шаблоны теперь принимают объекты слов)
  let sentence;
  if (PARTICLE_TEMPLATES[particle]) {
    sentence = template(...selectedWords);
  } else {
    // Fallback шаблон с частицей в качестве первого аргумента
    sentence = template(particle, ...selectedWords);
  }

  // Генерируем русскую подсказку
  const russianHint = hint(...selectedWords);

  // Получаем разблокированные частицы из уроков (импорт уже есть в начале файла)
  let unlockedParticles = getUnlockedParticles(state.chapters, LESSONS);

  // Убираем текущую частицу из пула
  unlockedParticles = unlockedParticles.filter((p) => p !== particle);

  // Если разблокированных частиц мало, используем базовый набор
  if (unlockedParticles.length < 3) {
    const basicParticles = ['は', 'の', 'に', 'で', 'を', 'が', 'と'];
    unlockedParticles = basicParticles.filter((p) => p !== particle);
  }

  // Генерируем 3 дистрактора
  const distractors = shuffleArray(unlockedParticles).slice(0, 3);

  // Формируем 4 варианта ответа
  const options = shuffleArray([particle, ...distractors]);

  return {
    sentence,
    correctParticle: particle,
    options,
    russianHint,
    words: selectedWords,
  };
}

// Функция генерации виртуальной клавиатуры для SRS
function generateSrsKeyboard(acceptedAnswers) {
  const allKana = Object.keys(HIRAGANA_TO_KATAKANA);

  // Собираем уникальные символы из ВСЕХ вариантов правильных ответов
  const correctLetters = [
    ...new Set(
      acceptedAnswers.flatMap((answer) => answer.split('')).filter((char) => allKana.includes(char))
    ),
  ];

  // Ограничиваем до максимум 8 символов
  const limitedCorrect = correctLetters.slice(0, 8);

  // Добавляем отвлекающие символы до ровно 8
  const distractors = [];
  const targetTotal = 8;
  const distractorCount = targetTotal - limitedCorrect.length;

  while (distractors.length < distractorCount) {
    const randomKana = allKana[Math.floor(Math.random() * allKana.length)];
    if (!correctLetters.includes(randomKana) && !distractors.includes(randomKana)) {
      distractors.push(randomKana);
    }
  }

  // Перемешиваем и гарантируем ровно 8 символов
  return shuffleArray([...limitedCorrect, ...distractors]).slice(0, 8);
}

// Функция определения режима карточки
function determineCardMode(word) {
  const rand = Math.random();
  const hasKanji = getAllKanji(word.kanji || word.writing).length > 0;

  // Режимы рисования и ввода доступны только для слов с кандзи
  if (hasKanji && rand < DRAWING_MODE_PROBABILITY) {
    return CARD_MODES.DRAWING;
  } else if (hasKanji && rand < DRAWING_MODE_PROBABILITY + TYPING_MODE_PROBABILITY) {
    return CARD_MODES.TYPING;
  } else {
    return CARD_MODES.MULTIPLE_CHOICE;
  }
}

// Функция проверки, является ли строка одиночным кандзи
function isSingleKanji(text) {
  if (!text || text.length === 0) return false;
  const code = text.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df)
  );
}

// Функция извлекает первый кандзи из текста
function getFirstKanji(text) {
  if (!text) return null;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      return text[i];
    }
  }
  return null;
}

// Функция извлечения всех кандзи из строки
function getAllKanji(text) {
  if (!text) return [];
  const kanji = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      kanji.push(text[i]);
    }
  }
  return kanji;
}

// Отрисовка ячеек прогресса
function renderKanjiProgressCells() {
  const container = document.getElementById('kanji-progress-cells');
  if (!container || kanjiSequence.length === 0) {
    if (container) container.innerHTML = '';
    return;
  }

  container.innerHTML = kanjiSequence
    .map((k, idx) => {
      const classes = ['kanji-cell'];
      if (idx < currentKanjiIndex) classes.push('completed');
      if (idx === currentKanjiIndex) classes.push('current');

      const displayChar = idx < currentKanjiIndex ? k.kanji : '';
      return `<div class="${classes.join(' ')}">${displayChar}</div>`;
    })
    .join('');
}

// Функция инициализации режима рисования с HanziWriter
function initDrawingMode(
  kanji,
  writing,
  translation,
  category,
  hideRomaji,
  romaji,
  state,
  dependencies
) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    toast,
  } = dependencies;

  const target = document.getElementById('kanji-writer-target');
  if (!target || !kanji || typeof HanziWriter === 'undefined') {
    toast('⚠️ HanziWriter не загружен');
    return;
  }

  // Инициализация последовательности, если это первый кандзи
  if (kanjiSequence.length === 0) {
    const kanjiChars = getAllKanji(kanji);
    kanjiSequence = kanjiChars.map((k) => ({
      kanji: k,
      writing: writing,
      translation: translation,
      category: category,
      hideRomaji: hideRomaji,
      romaji: romaji,
    }));
    currentKanjiIndex = 0;
    totalDrawingMistakes = 0;
  }

  renderKanjiProgressCells();
  drawingMistakes = 0;

  const currentKanji = kanjiSequence[currentKanjiIndex].kanji;

  function startQuiz() {
    drawingMistakes = 0;
    if (!currentWriter) return;

    currentWriter.quiz({
      leniency: 1.2,
      onMistake: (strokeData) => {
        drawingMistakes++;
        totalDrawingMistakes++;
        if (drawingMistakes >= 3) {
          currentWriter.updateColor('outlineColor', '#bbbbbb');
          currentWriter.showOutline();
          toast('💡 Слишком много ошибок. Дорисуйте по контуру');
        }
      },
      onComplete: (summaryData) => {
        currentKanjiIndex++;

        if (currentKanjiIndex < kanjiSequence.length) {
          const nextKanji = kanjiSequence[currentKanjiIndex];
          renderKanjiProgressCells();

          const target = document.getElementById('kanji-writer-target');
          if (target) target.innerHTML = '';
          currentWriter = null;
          drawingMistakes = 0;

          initDrawingMode(
            nextKanji.kanji,
            nextKanji.writing,
            nextKanji.translation,
            nextKanji.category,
            nextKanji.hideRomaji,
            nextKanji.romaji,
            state,
            dependencies
          );
          return;
        }

        // Все кандзи нарисованы
        const quality = totalDrawingMistakes >= 3 ? 0 : 5;
        const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

        const resultText =
          quality === 5 ? '✅ Отлично! Нарисовано без подсказок' : '📝 Нарисовано с подсказками';
        toast(resultText);

        if (window.QuestsManager && sessionManager) {
          const cardState = sessionManager.getCardState(card.id);
          const isFirstAttempt = cardState.sessionLapses === 0;

          if (quality >= 4 && isFirstAttempt) {
            window.QuestsManager.incrementStreakCorrect(state);
          } else if (quality < 3) {
            window.QuestsManager.resetStreakCorrect(state);
          }
        }

        if (sessionManager) {
          sessionManager.answerCard(card.id, quality, state.srs);
        } else {
          SRS.review(state.srs[card.id], quality);
          flashIdx += 1;
        }

        appAddXP(XP_CARD);
        save(true);
        markActivity(toast);
        flashRevealed = false;

        kanjiSequence = [];
        currentKanjiIndex = 0;

        setTimeout(() => {
          renderFlash(state, dependencies);
          updateSrsBadge();
        }, 300);
      },
    });
  }

  // Функция загрузки данных кандзи с fallback на традиционную форму
  const loadKanjiData = async (char) => {
    try {
      const response = await fetch(
        `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`
      );

      if (response.ok) {
        return await response.json();
      }

      // Fallback на традиционную форму для японских упрощённых иероглифов
      if (response.status === 404 && kanjiSimplifiedToTraditional[char]) {
        const traditionalChar = kanjiSimplifiedToTraditional[char];
        const fallbackResponse = await fetch(
          `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${traditionalChar}.json`
        );

        if (fallbackResponse.ok) {
          console.log(`✅ Используется традиционная форма ${traditionalChar} для ${char}`);
          return await fallbackResponse.json();
        }
      }

      throw new Error(`Данные для символа "${char}" недоступны`);
    } catch (error) {
      throw error;
    }
  };

  try {
    target.innerHTML = '';

    currentWriter = HanziWriter.create(target, currentKanji, {
      width: 280,
      height: 280,
      padding: 10,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 200,
      showOutline: false,
      showCharacter: false,

      strokeColor: '#1e293b',
      drawingColor: '#1e293b',
      radicalColor: '#168F16',
      outlineColor: '#f2f2f2',

      drawingWidth: 16,
      drawingFadeDuration: 150,
      strokeFadeDuration: 200,
      strokeMismatchThreshold: 0.85,
      leniency: 1.6,

      charDataLoader: loadKanjiData,
      onLoadCharDataError: (error) => {
        console.warn(`Не удалось загрузить данные для "${currentKanji}":`, error);
        toast(`⚠️ Данные для отрисовки "${currentKanji}" недоступны. Пропускаем режим рисования.`);

        // Пропускаем режим рисования и переходим к следующей карточке
        flashRevealed = true;
        kanjiSequence = [];
        currentKanjiIndex = 0;
        renderFlash(state, dependencies);
      },
    });

    const undoBtn = document.getElementById('drawing-undo');
    if (undoBtn) {
      undoBtn.onclick = () => {
        if (currentWriter) {
          currentWriter.updateColor('outlineColor', '#f2f2f2');
          startQuiz();
        }
      };
    }

    startQuiz();
  } catch (error) {
    console.error('Ошибка инициализации HanziWriter:', error);
    toast('⚠️ Ошибка загрузки кандзи: ' + error.message);
    flashRevealed = true;
    renderFlash(state, dependencies);
  }
}

// Функция показа карточки после завершения рисования
function showCardAfterDrawing(
  kanji,
  writing,
  translation,
  category,
  hideRomaji,
  romaji,
  state,
  dependencies
) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, nav, markActivity } =
    dependencies;

  const body = $('#srs-body');

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${flashIdx + 1} / ${flashQueue.length}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="flash-card-3d" id="flash-card" data-testid="flash-card">
        <div class="flash-inner flipped">
          <div class="flash-front">
            <button class="flash-speak" id="flash-speak" aria-label="Озвучить">🔊</button>
            <div class="flash-cat">${category}</div>
            <p class="flash-jp">${kanji}</p>
            <p class="flash-tap-hint">Нажмите, чтобы показать ответ</p>
          </div>
          <div class="flash-back">
            <p class="flash-tr">${translation}</p>
            ${kanji !== writing ? `<p class="flash-reading">${writing}</p>` : ''}
            ${hideRomaji ? '' : `<p class="flash-romaji">${romaji}</p>`}
          </div>
        </div>
      </div>
      <div id="rate" class="">
        <div class="rate-row">
          <button class="rate-btn rate-again" data-q="0" data-testid="rate-again">Снова</button>
          <button class="rate-btn rate-hard" data-q="3" data-testid="rate-hard">Трудно</button>
          <button class="rate-btn rate-good" data-q="4" data-testid="rate-good">Хорошо</button>
          <button class="rate-btn rate-easy" data-q="5" data-testid="rate-easy">Легко</button>
        </div>
      </div>
    </div>`;

  speakJapanese(writing);
  const speakBtn = $('#flash-speak');
  if (speakBtn)
    speakBtn.onclick = (e) => {
      e.stopPropagation();
      speakJapanese(writing);
    };

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }

  $$('#rate .rate-btn').forEach((b) => {
    b.onclick = () => {
      const quality = parseInt(b.dataset.q, 10);
      const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

      const srsCard = state.srs[card.id];
      if (srsCard) {
        if (srsCard.progress === undefined) srsCard.progress = 0;

        if (quality === 0) srsCard.progress = Math.max(0, srsCard.progress - 5);
        else if (quality === 3) srsCard.progress = Math.max(0, srsCard.progress - 3);
        else if (quality === 4) srsCard.progress = Math.min(100, srsCard.progress + 5);
        else if (quality === 5) srsCard.progress = Math.min(100, srsCard.progress + 10);
      }

      if (window.QuestsManager && sessionManager) {
        const cardState = sessionManager.getCardState(card.id);
        const isFirstAttempt = cardState.sessionLapses === 0;

        if (quality >= 4 && isFirstAttempt) {
          window.QuestsManager.incrementStreakCorrect(state);
        } else if (quality < 3) {
          window.QuestsManager.resetStreakCorrect(state);
        }
      }

      if (sessionManager) {
        sessionManager.answerCard(card.id, quality, state.srs);
      } else {
        SRS.review(state.srs[card.id], quality);
        flashIdx += 1;
      }

      appAddXP(XP_CARD);
      save(true);
      markActivity();
      flashRevealed = false;
      renderFlash(state, dependencies);
      updateSrsBadge();
    };
  });
}

// Функция парсинга допустимых вариантов чтения (для слов с несколькими чтениями)
function parseAcceptedAnswers(writingStr) {
  if (!writingStr) return [''];
  return writingStr
    .split(/[/,、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Функция рендеринга режима ввода с клавиатуры
function renderTypingMode(word, state, dependencies) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, nav, markActivity } =
    dependencies;

  const body = $('#srs-body');
  const displayKanji = word.kanji || word.writing;
  const displayWriting = word.writing;
  const displayTranslation = word.translation;
  const displayCategory = word.category || 'Слово';

  let isChecked = false;
  let typingMistakes = 0;

  // Парсим допустимые варианты чтения
  const acceptedAnswers = parseAcceptedAnswers(displayWriting);

  // Скрываем tabbar во время SRS-сессии
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  // Генерируем виртуальную клавиатуру из ВСЕХ вариантов
  const keyboardLetters = generateSrsKeyboard(acceptedAnswers);

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${flashIdx + 1} / ${flashQueue.length}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="typing-mode-container">
        <div class="typing-prompt">
          <div class="flash-cat">${displayCategory}</div>
          <p class="typing-kanji">${displayKanji}</p>
          <p class="typing-hint">Введите чтение на хирагане</p>
        </div>
        <input 
          type="text" 
          class="typing-input" 
          id="typing-input"
          autocomplete="off"
          placeholder="например: だいがく"
          readonly
        />
        <div class="srs-keyboard-container" id="srs-keyboard">
          ${keyboardLetters
            .map(
              (letter) => `
            <button class="srs-kana-key" data-letter="${letter}">
              <span class="key-hira">${letter}</span>
              <span class="key-kata">${HIRAGANA_TO_KATAKANA[letter] || letter}</span>
            </button>
          `
            )
            .join('')}
        </div>
        <div class="srs-keyboard-actions">
          <button class="srs-keyboard-backspace" id="srs-backspace">⌫ Стереть</button>
          <button class="btn-primary typing-check" id="typing-check">Проверить</button>
        </div>
        <div id="typing-hint-message" class="typing-hint hidden" style="color: var(--orange); font-weight: 700; margin-top: 8px;"></div>
      </div>
    </div>`;

  const input = $('#typing-input');
  const checkBtn = $('#typing-check');
  const hintMessage = $('#typing-hint-message');
  const backspaceBtn = $('#srs-backspace');

  // Обработчики виртуальной клавиатуры
  $$('.srs-kana-key').forEach((btn) => {
    btn.onclick = () => {
      if (isChecked) return;
      const letter = btn.dataset.letter;
      input.value += letter;
    };
  });

  // Обработчик backspace
  if (backspaceBtn) {
    backspaceBtn.onclick = () => {
      if (isChecked) return;
      input.value = input.value.slice(0, -1);
    };
  }

  const handleCheck = () => {
    if (isChecked) return;

    const userAnswer = input.value.trim();

    // Проверяем, соответствует ли ввод ЛЮБОМУ из допустимых вариантов
    const isCorrect = acceptedAnswers.some((answer) => answer === userAnswer);

    if (isCorrect) {
      input.classList.add('correct');
      input.classList.remove('incorrect', 'shake-error');

      const quality = typingMistakes === 0 ? 5 : 3;

      setTimeout(() => {
        handleRating(quality);
      }, 500);
    } else {
      typingMistakes++;

      if (typingMistakes === 1) {
        input.classList.add('shake-error', 'incorrect');
        input.classList.remove('correct');

        setTimeout(() => {
          input.classList.remove('shake-error');
        }, 500);

        // Подсказка: первый символ первого варианта
        hintMessage.textContent = `Подсказка: начинается на "${acceptedAnswers[0][0]}"`;
        hintMessage.classList.remove('hidden');

        isChecked = false;
      } else {
        input.classList.add('incorrect');
        input.classList.remove('correct', 'shake-error');
        input.disabled = true;
        checkBtn.disabled = true;

        // Показываем ВСЕ допустимые варианты через " или "
        const allAnswers = acceptedAnswers.join(' или ');
        hintMessage.innerHTML = `<p style="color: var(--danger); margin: 8px 0;">❌ Неправильно</p><p style="margin: 4px 0;">Правильный ответ: <strong style="color: var(--primary);">${allAnswers}</strong></p>`;
        hintMessage.classList.remove('hidden');

        setTimeout(() => {
          handleRating(0);
        }, 1000);
      }
    }

    isChecked = typingMistakes >= 2 || isCorrect;
  };

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    const srsCard = state.srs[card.id];
    if (srsCard) {
      if (srsCard.progress === undefined) srsCard.progress = 0;

      if (quality === 0) srsCard.progress = Math.max(0, srsCard.progress - 5);
      else if (quality === 3) srsCard.progress = Math.max(0, srsCard.progress - 3);
      else if (quality === 4) srsCard.progress = Math.min(100, srsCard.progress + 5);
      else if (quality === 5) srsCard.progress = Math.min(100, srsCard.progress + 10);
    }

    if (window.QuestsManager && sessionManager) {
      const cardState = sessionManager.getCardState(card.id);
      const isFirstAttempt = cardState.sessionLapses === 0;

      if (quality >= 4 && isFirstAttempt) {
        window.QuestsManager.incrementStreakCorrect(state);
      } else if (quality < 3) {
        window.QuestsManager.resetStreakCorrect(state);
      }
    }

    if (sessionManager) {
      sessionManager.answerCard(card.id, quality, state.srs);
    } else {
      SRS.review(state.srs[card.id], quality);
      flashIdx += 1;
    }

    appAddXP(XP_CARD);
    save(true);
    markActivity();
    flashRevealed = false;
    renderFlash(state, dependencies);
    updateSrsBadge();
  };

  if (checkBtn) {
    checkBtn.onclick = handleCheck;
  }

  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleCheck();
      }
    });
  }

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Восстанавливаем tabbar
      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

// Функция рендеринга режима множественного выбора (4 варианта)
function renderMultipleChoiceMode(word, state, dependencies) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    LESSONS,
  } = dependencies;

  const body = $('#srs-body');
  const displayKanji = word.kanji || word.writing;
  const displayTranslation = word.translation;
  const displayCategory = word.category || 'Слово';

  let mistakeCount = 0;

  // Скрываем tabbar во время SRS-сессии
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  // Генерируем 3 отвлекающих варианта
  const distractors = [];
  const allWords = LESSONS.flatMap((l) => l.words || []);

  const candidates = allWords
    .filter((w) => w.id !== word.id)
    .filter((w) => w.category === word.category)
    .filter((w) => isWordUnlocked(w.id, state.chapters));

  const shuffled = shuffleArray(candidates);
  for (let i = 0; i < Math.min(3, shuffled.length); i++) {
    distractors.push(shuffled[i]);
  }

  // Если не хватает отвлекающих вариантов, берём случайные слова
  while (distractors.length < 3 && allWords.length >= 4) {
    const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
    if (randomWord.id !== word.id && !distractors.find((d) => d.id === randomWord.id)) {
      distractors.push(randomWord);
    }
  }

  // Составляем массив из 4 вариантов и перемешиваем
  const options = shuffleArray([word, ...distractors.slice(0, 3)]);

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${flashIdx + 1} / ${flashQueue.length}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="quiz-mode-container">
        <div class="quiz-prompt">
          <div class="flash-cat">${displayCategory}</div>
          <p class="quiz-question">${displayTranslation}</p>
          <p class="quiz-hint">Выберите правильное слово</p>
        </div>
        <div class="quiz-options-grid">
          ${options
            .map(
              (opt) => `
            <button class="quiz-option-btn" data-word-id="${opt.id}">
              ${opt.kanji || opt.writing}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    </div>`;

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    const srsCard = state.srs[card.id];
    if (srsCard) {
      if (srsCard.progress === undefined) srsCard.progress = 0;

      if (quality === 0) srsCard.progress = Math.max(0, srsCard.progress - 5);
      else if (quality === 3) srsCard.progress = Math.max(0, srsCard.progress - 3);
      else if (quality === 4) srsCard.progress = Math.min(100, srsCard.progress + 5);
      else if (quality === 5) srsCard.progress = Math.min(100, srsCard.progress + 10);
    }

    if (window.QuestsManager && sessionManager) {
      const cardState = sessionManager.getCardState(card.id);
      const isFirstAttempt = cardState.sessionLapses === 0;

      if (quality >= 4 && isFirstAttempt) {
        window.QuestsManager.incrementStreakCorrect(state);
      } else if (quality < 3) {
        window.QuestsManager.resetStreakCorrect(state);
      }
    }

    if (sessionManager) {
      sessionManager.answerCard(card.id, quality, state.srs);
    } else {
      SRS.review(state.srs[card.id], quality);
      flashIdx += 1;
    }

    appAddXP(XP_CARD);
    save(true);
    markActivity();
    flashRevealed = false;
    renderFlash(state, dependencies);
    updateSrsBadge();
  };

  $$('.quiz-option-btn').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;

      const selectedWordId = btn.dataset.wordId;
      const isCorrect = selectedWordId === word.id;

      if (isCorrect) {
        btn.classList.add('correct');
        btn.disabled = true;

        // Вычисляем качество на основе ошибок
        let quality;
        if (mistakeCount === 0) {
          quality = 5; // Easy
        } else if (mistakeCount === 1) {
          quality = 3; // Hard
        } else {
          quality = 0; // Again
        }

        setTimeout(() => {
          handleRating(quality);
        }, 600);
      } else {
        btn.classList.add('incorrect');
        btn.disabled = true;
        mistakeCount++;

        // Если 2+ ошибки, автоматически завершаем с quality=0
        if (mistakeCount >= 2) {
          $$('.quiz-option-btn').forEach((b) => (b.disabled = true));

          // Подсвечиваем правильный ответ зелёным
          $$('.quiz-option-btn').forEach((b) => {
            if (b.dataset.wordId === word.id) {
              b.classList.add('correct');
            }
          });

          setTimeout(() => {
            handleRating(0);
          }, 1000);
        }
      }
    };
  });

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Восстанавливаем tabbar
      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

// Функция рендеринга режима particle quiz
function renderParticleQuizMode(particleCard, state, dependencies) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    markActivity,
    LESSONS,
  } = dependencies;

  const body = $('#srs-body');
  let mistakeCount = 0;

  // Скрываем tabbar во время SRS-сессии
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  // Генерируем quiz данные
  const lessonData = LESSONS.find((l) => l.id === particleCard.lessonId);
  if (!lessonData || !lessonData.particles || lessonData.particles.length === 0) {
    console.warn(`Нет частиц для урока ${particleCard.lessonId}`);
    flashIdx += 1;
    renderFlash(state, dependencies);
    return;
  }

  const particle = lessonData.particles[Math.floor(Math.random() * lessonData.particles.length)];
  const quizData = generateParticleQuiz(particle, lessonData, state, LESSONS);

  if (!quizData) {
    console.warn('Не удалось сгенерировать particle quiz');
    flashIdx += 1;
    renderFlash(state, dependencies);
    return;
  }

  const { sentence, correctParticle, options, russianHint } = quizData;

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${flashIdx + 1} / ${flashQueue.length}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="particle-quiz-container">
        <div class="particle-quiz-prompt">
          <div class="flash-cat">Частица</div>
          <p class="particle-quiz-sentence">${sentence}</p>
          <p class="particle-quiz-hint">${russianHint}</p>
        </div>
        <div class="particle-quiz-options">
          ${options
            .map(
              (opt) => `
            <button class="quiz-option-btn" data-particle="${opt}">
              ${opt}
            </button>
          `
            )
            .join('')}
        </div>
      </div>
    </div>`;

  const handleRating = (quality) => {
    const card = sessionManager ? sessionManager.getNextCard() : flashQueue[flashIdx];

    const srsCard = state.srs[card.id];
    if (srsCard) {
      if (srsCard.progress === undefined) srsCard.progress = 0;

      if (quality === 0) srsCard.progress = Math.max(0, srsCard.progress - 5);
      else if (quality === 3) srsCard.progress = Math.max(0, srsCard.progress - 3);
      else if (quality === 4) srsCard.progress = Math.min(100, srsCard.progress + 5);
      else if (quality === 5) srsCard.progress = Math.min(100, srsCard.progress + 10);
    }

    if (window.QuestsManager && sessionManager) {
      const cardState = sessionManager.getCardState(card.id);
      const isFirstAttempt = cardState.sessionLapses === 0;

      if (quality >= 4 && isFirstAttempt) {
        window.QuestsManager.incrementStreakCorrect(state);
      } else if (quality < 3) {
        window.QuestsManager.resetStreakCorrect(state);
      }
    }

    if (sessionManager) {
      sessionManager.answerCard(card.id, quality, state.srs);
    } else {
      SRS.review(state.srs[card.id], quality);
      flashIdx += 1;
    }

    appAddXP(XP_CARD);
    save(true);
    markActivity();
    flashRevealed = false;
    renderFlash(state, dependencies);
    updateSrsBadge();
  };

  $$('.quiz-option-btn').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) return;

      const selectedParticle = btn.dataset.particle;
      const isCorrect = selectedParticle === correctParticle;

      if (isCorrect) {
        btn.classList.add('correct');
        btn.disabled = true;

        // Вычисляем качество на основе ошибок
        let quality;
        if (mistakeCount === 0) {
          quality = 5; // Easy
        } else if (mistakeCount === 1) {
          quality = 3; // Hard
        } else {
          quality = 0; // Again
        }

        setTimeout(() => {
          handleRating(quality);
        }, 600);
      } else {
        btn.classList.add('incorrect');
        btn.disabled = true;
        mistakeCount++;

        // Если 2+ ошибки, автоматически завершаем с quality=0
        if (mistakeCount >= 2) {
          $$('.quiz-option-btn').forEach((b) => (b.disabled = true));

          // Подсвечиваем правильный ответ зелёным
          $$('.quiz-option-btn').forEach((b) => {
            if (b.dataset.particle === correctParticle) {
              b.classList.add('correct');
            }
          });

          setTimeout(() => {
            handleRating(0);
          }, 1000);
        }
      }
    };
  });

  const exitBtn = $('#flash-exit');
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Восстанавливаем tabbar
      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.style.display = '';

      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: 'おつかれさま!',
            subtitle: 'Хорошая работа!',
            desc: `Вы повторили часть карточек`,
            theme: 'success',
            rewards: [
              { icon: '📚', label: `${stats.reviewed} карточек` },
              { icon: '✨', label: `${stats.perfect} без ошибок` },
              { icon: '🪙', label: `+${stats.reviewed} XP` },
            ],
            onContinue: () => {
              sessionManager = null;
              flashCtx ? nav('chapter', flashCtx) : nav('srs');
            },
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav('chapter', flashCtx) : nav('srs');
    };
  }
}

// Главная функция рендеринга карточки
export function renderFlash(state, dependencies) {
  const {
    save,
    showCompletionScreen,
    XP_CARD,
    appAddXP,
    updateSrsBadge,
    nav,
    LESSONS,
    markActivity,
  } = dependencies;

  const body = $('#srs-body');
  if (!body) return;

  let card;

  if (sessionManager) {
    card = sessionManager.getNextCard();

    if (!card) {
      const stats = sessionManager.getStats();
      showCompletionScreen({
        title: 'おめでとう！',
        subtitle: 'Сессия завершена!',
        desc: 'Отличная работа! Вы справились со всеми карточками.',
        theme: 'success',
        rewards: [
          { icon: '📚', label: `${stats.reviewed} карточек` },
          { icon: '✨', label: `${stats.perfect} без ошибок` },
          { icon: '🎯', label: `${Math.round(stats.accuracy)}% точность` },
          { icon: '🪙', label: `+${stats.reviewed} XP` },
        ],
        onContinue: () => {
          sessionManager = null;
          flashCtx ? nav('chapter', flashCtx) : nav('srs');
        },
      });
      return;
    }
  } else {
    if (flashIdx >= flashQueue.length) {
      const count = flashQueue.length;
      showCompletionScreen({
        title: 'おめでとう！',
        subtitle: 'Повторение завершено!',
        desc: 'Вы успешно повторили все карточки.',
        theme: 'success',
        rewards: [
          { icon: '📚', label: `${count} карточек` },
          { icon: '🪙', label: `+${count} XP` },
        ],
        onContinue: () => {
          flashCtx ? nav('chapter', flashCtx) : nav('srs');
        },
      });
      return;
    }
    card = flashQueue[flashIdx];
  }

  // Проверяем, является ли карточка particle quiz
  if (card.id && card.id.startsWith('PARTICLE_')) {
    renderParticleQuizMode(card, state, dependencies);
    return;
  }

  const word = wordById(card.id, LESSONS);
  if (!word) {
    flashIdx += 1;
    renderFlash(state, dependencies);
    return;
  }

  const displayKanji = word.kanji || word.writing;
  const displayWriting = word.writing;
  const displayTranslation = word.translation;
  const displayCategory = word.category || 'Слово';
  const hideRomaji = state.settings?.hideRomaji || false;
  const displayRomaji = word.romaji || '';

  // Определяем режим карточки
  const cardMode = determineCardMode(word);

  // Скрываем tabbar во время SRS-сессии
  const tabbar = document.querySelector('.tabbar');
  if (tabbar) tabbar.style.display = 'none';

  // Режим рисования
  if (cardMode === CARD_MODES.DRAWING) {
    body.innerHTML = `
      <div class="flash-wrap">
        <div class="flash-top">
          <span class="flash-count" data-testid="flash-progress">${flashIdx + 1} / ${flashQueue.length}</span>
          <button class="btn-ghost" id="flash-exit">Выйти</button>
        </div>
        <div class="drawing-mode-container">
          <div class="drawing-hint">
            <p class="drawing-translation">${displayTranslation}</p>
            <p class="drawing-category">${displayCategory}</p>
          </div>
          <div id="kanji-progress-cells" class="kanji-progress-cells"></div>
          <div class="kanji-writer-wrap">
            <div id="kanji-writer-target"></div>
          </div>
          <div class="drawing-controls">
            <button class="btn-secondary" id="drawing-undo">↺ Сбросить</button>
          </div>
        </div>
      </div>`;

    const exitBtn = $('#flash-exit');
    if (exitBtn) {
      exitBtn.onclick = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();

        // Восстанавливаем tabbar
        const tabbar = document.querySelector('.tabbar');
        if (tabbar) tabbar.style.display = '';

        if (sessionManager) {
          const stats = sessionManager.getStats();
          if (stats.reviewed > 0) {
            showCompletionScreen({
              title: 'おつかれさま!',
              subtitle: 'Хорошая работа!',
              desc: `Вы повторили часть карточек`,
              theme: 'success',
              rewards: [
                { icon: '📚', label: `${stats.reviewed} карточек` },
                { icon: '✨', label: `${stats.perfect} без ошибок` },
                { icon: '🪙', label: `+${stats.reviewed} XP` },
              ],
              onContinue: () => {
                sessionManager = null;
                flashCtx ? nav('chapter', flashCtx) : nav('srs');
              },
            });
            return;
          }
        }
        sessionManager = null;
        flashCtx ? nav('chapter', flashCtx) : nav('srs');
      };
    }

    initDrawingMode(
      displayKanji,
      displayWriting,
      displayTranslation,
      displayCategory,
      hideRomaji,
      displayRomaji,
      state,
      dependencies
    );
    return;
  }

  // Режим ввода с клавиатуры
  if (cardMode === CARD_MODES.TYPING) {
    renderTypingMode(word, state, dependencies);
    return;
  }

  // Режим множественного выбора (4 варианта)
  if (cardMode === CARD_MODES.MULTIPLE_CHOICE) {
    renderMultipleChoiceMode(word, state, dependencies);
    return;
  }
}

// Функция рендеринга словаря
export async function renderDictionary(state, dependencies) {
  const { CONTENT_INDEX, ensureLesson } = dependencies;

  const content = $('#srs-body');
  if (!content) return;

  // Словарь показывает слова всех глав — догружаем недостающие уроки
  if (CONTENT_INDEX && ensureLesson) {
    await Promise.all(CONTENT_INDEX.map((ch) => ensureLesson(ch.id).catch(() => null)));
  }

  content.innerHTML = `
    <div class="dict-search-wrap">
      <input 
        type="search" 
        id="dict-search" 
        class="dict-search-input" 
        placeholder="🔍 Поиск слов..."
        autocomplete="off"
      />
    </div>
    <div id="dict-lessons-container"></div>
  `;

  renderDictionaryLessons(state, dependencies);

  const searchInput = $('#dict-search');
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filterDictionaryWords(e.target.value, state, dependencies);
      }, 300);
    });
  }
}

// Функция рендеринга списка уроков и слов
function renderDictionaryLessons(state, dependencies, searchQuery = '') {
  const { LESSONS } = dependencies;

  const container = $('#dict-lessons-container');
  if (!container) return;

  const query = searchQuery.toLowerCase().trim();
  let totalVisible = 0;

  container.innerHTML = LESSONS.map((lesson) => {
    const words = lesson.words || [];

    const filteredWords = query
      ? words.filter((word) => {
          return (
            (word.kanji && word.kanji.toLowerCase().includes(query)) ||
            (word.writing && word.writing.toLowerCase().includes(query)) ||
            (word.romaji && word.romaji.toLowerCase().includes(query)) ||
            (word.translation && word.translation.toLowerCase().includes(query))
          );
        })
      : words;

    if (filteredWords.length === 0 && query) {
      return '';
    }

    totalVisible += filteredWords.length;

    const wordsHtml = filteredWords
      .map((word) => {
        const isUnlocked = isWordUnlocked(word.id, state.chapters);
        const chapterId = cardChapter(word.id);

        const srsRecord = state.srs[word.id];
        let progress = 0;
        let progressClass = 'progress-none';

        if (srsRecord) {
          progress = srsRecord.progress || 0;
          if (progress >= 75) progressClass = 'progress-high';
          else if (progress >= 25) progressClass = 'progress-medium';
          else progressClass = 'progress-low';
        }

        if (!isUnlocked) {
          return `
          <div class="dict-word-card word-locked" data-word-id="${word.id}" data-chapter-id="${chapterId}">
            <div class="dict-word-main">
              <div class="dict-word-lock-icon">🔒</div>
              <div class="dict-word-kanji">${word.kanji || word.writing}</div>
              <div class="dict-word-info">
                <div class="dict-word-reading">・・・</div>
                <div class="dict-word-translation">Откроется в Главе ${chapterId}</div>
              </div>
            </div>
            <div class="dict-word-progress">
              <div class="dict-progress-bar">
                <div class="dict-progress-fill progress-none" style="width: 0%"></div>
              </div>
              <span class="dict-progress-text">🔒</span>
            </div>
          </div>
        `;
        }

        return `
        <div class="dict-word-card" data-word-id="${word.id}">
          <div class="dict-word-main">
            <div class="dict-word-kanji">${word.kanji || word.writing}</div>
            <div class="dict-word-info">
              <div class="dict-word-reading">${word.writing}</div>
              <div class="dict-word-translation">${word.translation}</div>
            </div>
          </div>
          <div class="dict-word-progress">
            <div class="dict-progress-bar">
              <div class="dict-progress-fill ${progressClass}" style="width: ${progress}%"></div>
            </div>
            <span class="dict-progress-text">${progress}%</span>
          </div>
        </div>
      `;
      })
      .join('');

    return `
      <div class="dict-lesson">
        <div class="dict-lesson-header">
          <h3 class="dict-lesson-title">Lesson ${lesson.id}: ${lesson.title}</h3>
          <span class="dict-lesson-count">${filteredWords.length} слов</span>
        </div>
        <div class="dict-words-list">
          ${wordsHtml}
        </div>
      </div>
    `;
  }).join('');

  if (query && totalVisible === 0) {
    container.innerHTML = emptyState(
      '🔍',
      'Ничего не найдено',
      `По запросу "${searchQuery}" слова не найдены.`
    );
    return;
  }

  $$('.dict-word-card').forEach((card) => {
    card.onclick = () => {
      const wordId = card.dataset.wordId;

      if (card.classList.contains('word-locked')) {
        const chapterId = card.dataset.chapterId;
        toast(`🔒 Начните Главу ${chapterId}, чтобы разблокировать это слово`);
        return;
      }

      const word = wordById(wordId, LESSONS);
      if (word) openDictionaryModal(word, state, dependencies);
    };
  });
}

// Функция фильтрации слов
function filterDictionaryWords(searchQuery, state, dependencies) {
  renderDictionaryLessons(state, dependencies, searchQuery);
}

// Маппинг упрощенных японских кандзи на традиционные китайские
const kanjiSimplifiedToTraditional = {
  専: '專',
  学: '學',
  図: '圖',
  実: '實',
  医: '醫',
  体: '體',
  国: '國',
  会: '會',
  帰: '歸',
  万: '萬',
  円: '圓',
  亜: '亞',
  仏: '佛',
  単: '單',
  号: '號',
  売: '賣',
  変: '變',
  声: '聲',
  寝: '寢',
  広: '廣',
  従: '從',
  恵: '惠',
  応: '應',
  斎: '齋',
  旧: '舊',
  権: '權',
  楽: '樂',
  気: '氣',
  温: '溫',
  湾: '灣',
  点: '點',
  為: '爲',
  画: '畫',
  祈: '祈',
  禅: '禪',
  糸: '絲',
  経: '經',
  絵: '繪',
  続: '續',
  聴: '聽',
  脳: '腦',
  臓: '臟',
  薬: '藥',
  虫: '蟲',
  覚: '覺',
  観: '觀',
  訳: '譯',
  証: '證',
  読: '讀',
  辞: '辭',
  鉄: '鐵',
  関: '關',
  雑: '雜',
  霊: '靈',
  顔: '顏',
  駅: '驛',
  黄: '黃',
  黒: '黑',
  歯: '齒',
};

// Функция открытия модального окна словаря
function openDictionaryModal(word, state, dependencies) {
  const { nav } = dependencies;

  const body = $('#srs-body');
  if (!body) return;

  const kanjiChars = getAllKanji(word.kanji || word.writing);
  const hasKanji = kanjiChars.length > 0;

  const returnToDict = () => {
    nav('srs');
  };

  let currentKanjiIdx = 0;

  const renderModalContent = () => {
    const selectedKanji = hasKanji ? kanjiChars[currentKanjiIdx] : null;

    const kanjiTabsHtml =
      kanjiChars.length > 1
        ? `
      <div class="dict-kanji-tabs">
        ${kanjiChars
          .map(
            (k, idx) => `
          <button class="dict-kanji-tab ${idx === currentKanjiIdx ? 'active' : ''}" data-kanji-idx="${idx}">
            ${k}
          </button>
        `
          )
          .join('')}
      </div>
    `
        : '';

    body.innerHTML = `
      <div class="dict-modal">
        <div class="dict-modal-header">
          <button class="btn-ghost" id="dict-modal-close">← Назад</button>
          <h2 class="dict-modal-title">${word.kanji || word.writing}</h2>
          <button class="dict-modal-speak" id="dict-modal-speak" aria-label="Озвучить">🔊</button>
        </div>
        
        <div class="dict-modal-content">
          <div class="dict-modal-info">
            <p class="dict-modal-reading">${word.writing}</p>
            <p class="dict-modal-translation">${word.translation}</p>
            ${word.romaji ? `<p class="dict-modal-romaji">${word.romaji}</p>` : ''}
          </div>
          
          ${
            hasKanji
              ? `
            ${kanjiTabsHtml}
            <div class="dict-kanji-writer-container">
              <div id="dict-kanji-writer-target"></div>
            </div>
            <div class="dict-kanji-controls">
              <button class="btn-secondary" id="dict-animate-btn">🎬 Анимация черт</button>
              <button class="btn-secondary" id="dict-quiz-btn">✍️ Пропись</button>
            </div>
          `
              : '<p class="dict-no-kanji">В этом слове нет кандзи для отрисовки</p>'
          }
        </div>
      </div>
    `;

    const closeBtn = $('#dict-modal-close');
    if (closeBtn) closeBtn.onclick = returnToDict;

    const speakBtn = $('#dict-modal-speak');
    if (speakBtn) {
      speakBtn.onclick = (e) => {
        e.stopPropagation();
        speakJapanese(word.writing);
      };
    }

    if (kanjiChars.length > 1) {
      $$('.dict-kanji-tab').forEach((tab) => {
        tab.onclick = () => {
          currentKanjiIdx = parseInt(tab.dataset.kanjiIdx);
          renderModalContent();
        };
      });
    }

    if (hasKanji && selectedKanji) {
      initDictionaryKanjiWriter(selectedKanji);
    }
  };

  renderModalContent();
}

// Функция инициализации HanziWriter для словаря
async function initDictionaryKanjiWriter(kanji) {
  const target = document.getElementById('dict-kanji-writer-target');
  const container = target?.parentElement;
  const controls = document.querySelector('.dict-kanji-controls');

  if (!target || typeof HanziWriter === 'undefined') {
    toast('⚠️ HanziWriter не загружен');
    return;
  }

  target.innerHTML = '';
  target.style.touchAction = 'none';

  const loadKanjiData = async (char) => {
    try {
      const response = await fetch(
        `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`
      );

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 404 && kanjiSimplifiedToTraditional[char]) {
        const traditionalChar = kanjiSimplifiedToTraditional[char];
        const fallbackResponse = await fetch(
          `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${traditionalChar}.json`
        );

        if (fallbackResponse.ok) {
          return await fallbackResponse.json();
        }
      }

      throw new Error(`Данные для символа "${char}" недоступны`);
    } catch (error) {
      throw error;
    }
  };

  try {
    const screenWidth = window.innerWidth;
    let writerSize = 280;
    if (screenWidth <= 400) {
      writerSize = 180;
    } else if (screenWidth <= 768) {
      writerSize = 200;
    }

    const writer = HanziWriter.create(target, kanji, {
      width: writerSize,
      height: writerSize,
      padding: 10,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 200,
      showOutline: true,
      showCharacter: true,

      strokeColor: '#1e293b',
      radicalColor: '#168F16',
      outlineColor: '#DDD',
      drawingColor: '#1e293b',
      drawingWidth: 16,

      charDataLoader: loadKanjiData,
      onLoadCharDataError: (error) => {
        console.warn(`Не удалось загрузить данные для "${kanji}":`, error);
        if (container) container.style.display = 'none';
        if (controls) controls.style.display = 'none';
        if (container && container.parentElement) {
          const message = document.createElement('p');
          message.className = 'dict-no-kanji';
          message.textContent = `Данные для отрисовки символа "${kanji}" недоступны`;
          container.parentElement.insertBefore(message, container);
        }
      },
    });

    const animateBtn = $('#dict-animate-btn');
    if (animateBtn) {
      animateBtn.onclick = () => {
        writer.animateCharacter();
      };
    }

    const quizBtn = $('#dict-quiz-btn');
    if (quizBtn) {
      quizBtn.onclick = () => {
        writer.quiz({
          showOutline: true,
          leniency: 1.2,
          onComplete: () => {
            toast('✅ Отлично!');
          },
        });
      };
    }
  } catch (error) {
    console.error('Ошибка инициализации HanziWriter:', error);
    if (container) container.style.display = 'none';
    if (controls) controls.style.display = 'none';
    if (container && container.parentElement) {
      const message = document.createElement('p');
      message.className = 'dict-no-kanji';
      message.textContent = `Данные для отрисовки символа "${kanji}" недоступны`;
      container.parentElement.insertBefore(message, container);
    }
  }
}

// Функция запуска дополнительного повторения
export function startExtraReview(state, dependencies) {
  const { save, updateSrsBadge, toast } = dependencies;

  const all = allCards(state.srs);
  if (all.length === 0) {
    toast('Нет изученных карточек. Сначала начните главу.');
    return;
  }

  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected = shuffled.slice(0, Math.min(10, shuffled.length));
  selected.forEach((card) => {
    card.due = Date.now();
  });

  save();
  toast(`🍀 ${selected.length} старых карточек добавлены к повторению!`);
  updateSrsBadge();

  // Чистый старт сессии доп. повторения (без несуществующего startFlash)
  document.getElementById('completion-overlay')?.classList.add('hidden');

  // Скрываем табы SRS во время доп. повторения
  const tabsContainer = document.getElementById('srs-tabs-container');
  if (tabsContainer) tabsContainer.classList.add('hidden');

  sessionManager = null;
  flashCtx = null;
  flashRevealed = false;
  flashIdx = 0;
  flashQueue = selected;
  renderFlash(state, dependencies);
}

// Экспорт функций для установки глобальных переменных из app.js
export function setFlashQueue(queue) {
  flashQueue = queue;
}

export function setFlashIdx(idx) {
  flashIdx = idx;
}

export function setFlashRevealed(revealed) {
  flashRevealed = revealed;
}

export function setFlashCtx(ctx) {
  flashCtx = ctx;
}

export function setSessionManager(manager) {
  sessionManager = manager;
}

export function getFlashQueue() {
  return flashQueue;
}

export function getFlashIdx() {
  return flashIdx;
}

export function getFlashRevealed() {
  return flashRevealed;
}

export function getFlashCtx() {
  return flashCtx;
}

export function getSessionManager() {
  return sessionManager;
}

// ui/flashcards/dictionary-modal.js - Модальное окно деталей слова, пропись HanziWriter, примеры и спряжения

import { $, $$ } from '../../src/utils.js';
import { speakJapanese } from '../../src/audio-helper.js';
import { SRS } from '../../srs.js';
import { cardsForItem, vocabularySkills } from '../../src/knowledge-model.js';
import { calculateMastery } from '../../src/mastery.js';
import { conjugateVerb } from '../../src/verb-conjugator.js';
import { getExampleCandidates } from '../../src/example-generator.js';
import HanziWriter from 'hanzi-writer';
import { localCharDataLoader } from '../../src/kanji-loader.js';
import { getAllKanji } from './mode-selector.js';
import { cleanKanjiChar } from './drawing-mode.js';
import {
  getPartOfSpeechLabel,
  getVerbClassLabel,
  getTopicLabel,
  getLessonsLabel,
  renderSkillRow,
} from './dictionary.js';

export function openDictionaryModal(word, state, dependencies) {
  const { nav } = dependencies;

  const body = $('#srs-body');
  if (!body) return;

  const kanjiChars = getAllKanji(word.kanji || word.writing);
  const hasKanji = kanjiChars.length > 0;

  const returnToDict = () => {
    nav('srs');
  };

  let currentKanjiIdx = 0;
  let isKanjiOpen = false;
  let isProgressOpen = false;

  const exampleCandidates = getExampleCandidates(word, {
    userMaxLesson: state.maxUnlockedLesson || 12,
  });
  let exampleIndex = 0;

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

    const itemCards = cardsForItem(state.srs, word.id);
    const appSkills = vocabularySkills(word);
    const mastery = calculateMastery({
      itemId: word.id,
      cards: itemCards,
      events: state.reviewEvents || [],
      archive: state.masteryArchive?.[word.id],
      applicableSkills: appSkills,
      getRetrievability: (card, now) => SRS.getRetrievability(card, now),
    });

    const activeLessonId = state.activeChapterId || 1;
    let conjugationHtml = '';

    function getRussianMeaning(formId, translation) {
      const clean = (translation || '')
        .toLowerCase()
        .trim()
        .replace(/^то\s+/i, '');
      switch (formId) {
        case 'masu':
          return `${clean} (вежл.)`;
        case 'masen':
          return `не ${clean} (вежл.)`;
        case 'masenka':
          return `не хотите ли ${clean}?`;
        case 'mashita':
          return `${clean} (прош., вежл.)`;
        case 'masendeshita':
          return `не ${clean} (прош., вежл.)`;
        case 'mashou':
          return `давайте ${clean}!`;
        case 'mashouka':
          return `давайте я ${clean}?`;
        case 'dictionary':
          return `${clean} (непрошедшее время)`;
        case 'nai':
          return `не ${clean} (непрошедшее время)`;
        case 'ta':
          return `${clean} (прош. время)`;
        case 'nakatta':
          return `не ${clean} (прош. время)`;
        case 'te':
          return `деепричастный оборот`;
        case 'てください':
          return `пожалуйста, ${clean}`;
        case 'てもいいです':
          return `можно ${clean}`;
        case 'てはいけません':
          return `нельзя ${clean}`;
        case 'последовательность 〜て、〜':
          return `${clean} и затем...`;
        case 'ています':
          return `в процессе ${clean} / состояние`;
        case 'основа + に行く/来る/帰る':
          return `идти/приходить/возвращаться, чтобы ${clean}`;
        case 'ないдеください':
        case 'ないде-форма':
        case 'ないでください':
          return `пожалуйста, не ${clean}`;
        case 'と思います':
          return `думаю, что ${clean}`;
        case 'говорил':
        case 'говорила':
        case 'говорили':
        case 'сказал':
        case 'сказала':
        case 'сказали':
        case 'сказал(а), что':
        case 'сказал(а)':
        case 'говорят':
        case 'говорил(а), что':
        case 'сказали, что':
        case 'говорили, что':
        case 'сказано':
        case 'сказанное':
        case 'сказание':
        case 'говорить':
        case 'сказать':
        case 'скажет':
        case 'скажут':
        case 'говорит':
        case 'говорят, что':
        case 'говорили-говорили':
        case 'сказал-сделал':
        case 'рассказывал':
        case 'рассказывала':
        case 'рассказали':
        case 'рассказывает':
        case 'рассказывают':
        case 'рассказать':
        case 'рассказывать':
        case 'передавал':
        case 'передавала':
        case 'передавали':
        case 'передает':
        case 'передают':
        case 'передать':
        case 'передавать':
        case 'упоминал':
        case 'упоминала':
        case 'упомянул':
        case 'упомянула':
        case 'упомянули':
        case 'упоминает':
        case 'упомянет':
        case 'упоминают':
        case 'упомянуть':
        case 'упоминать':
        case 'сообщал':
        case 'сообщала':
        case 'сообщил':
        case 'сообщила':
        case 'сообщили':
        case 'сообщает':
        case 'сообщит':
        case 'сообщают':
        case 'сообщить':
        case 'сообщать':
        case 'заявлял':
        case 'заявляла':
        case 'заявил':
        case 'заявила':
        case 'заявили':
        case 'заявляет':
        case 'заявит':
        case 'заявляют':
        case 'заявить':
        case 'заявлять':
        case 'утверждал':
        case 'утверждала':
        case 'утвердил':
        case 'утвердила':
        case 'утвердили':
        case 'утверждает':
        case 'утвердит':
        case 'утверждают':
        case 'утвердить':
        case 'утверждать':
        case 'говорил(а)':
          return `говорил(а), что ${clean}`;
        case 'のが好きです':
          return `нравится ${clean}`;
        case 'つもりです':
          return `собираюсь ${clean}`;
        case 'たことがあります':
          return `доводилось ${clean}`;
        case 'たり〜たりします':
          return `то ${clean}, то делать другие вещи`;
        case 'たい':
          return `хочу ${clean}`;
        default:
          return clean;
      }
    }

    if (word.partOfSpeech === 'verb') {
      try {
        const baseForms = conjugateVerb(word);

        const masuForm = baseForms.find((f) => f.formId === 'masu');
        const stemKanji = masuForm ? masuForm.kanji.slice(0, -2) : '';
        const stemKana = masuForm ? masuForm.kana.slice(0, -2) : '';

        const isLocked = (lessonUnlocked) => {
          return lessonUnlocked > activeLessonId;
        };

        const formatJp = (kanjiVal, kanaVal) => {
          if (kanjiVal === kanaVal) return kanjiVal;
          return `${kanjiVal} (${kanaVal})`;
        };

        const politeGroup = [
          {
            name: 'Непрошедшее время (утвердительное)',
            lesson: 3,
            ru: getRussianMeaning('masu', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'masu').kanji,
            jpKana: baseForms.find((f) => f.formId === 'masu').kana,
          },
          {
            name: 'Непрошедшее время (отрицательное)',
            lesson: 3,
            ru: getRussianMeaning('masen', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'masen').kanji,
            jpKana: baseForms.find((f) => f.formId === 'masen').kana,
          },
          {
            name: 'Приглашение',
            lesson: 3,
            ru: getRussianMeaning('masenka', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'masenka').kanji,
            jpKana: baseForms.find((f) => f.formId === 'masenka').kana,
          },
          {
            name: 'Прошедшее время (утвердительное)',
            lesson: 4,
            ru: getRussianMeaning('mashita', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'mashita').kanji,
            jpKana: baseForms.find((f) => f.formId === 'mashita').kana,
          },
          {
            name: 'Прошедшее время (отрицательное)',
            lesson: 4,
            ru: getRussianMeaning('masendeshita', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'masendeshita').kanji,
            jpKana: baseForms.find((f) => f.formId === 'masendeshita').kana,
          },
          {
            name: 'Побудительное',
            lesson: 5,
            ru: getRussianMeaning('mashou', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'mashou').kanji,
            jpKana: baseForms.find((f) => f.formId === 'mashou').kana,
          },
          {
            name: 'Предложение помощи',
            lesson: 5,
            ru: getRussianMeaning('mashouka', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'mashouka').kanji,
            jpKana: baseForms.find((f) => f.formId === 'mashouka').kana,
          },
        ];

        const plainGroup = [
          {
            name: 'Простое непрошедшее утвердительное',
            lesson: 8,
            ru: getRussianMeaning('dictionary', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'dictionary').kanji,
            jpKana: baseForms.find((f) => f.formId === 'dictionary').kana,
          },
          {
            name: 'Простое непрошедшее отрицательное',
            lesson: 8,
            ru: getRussianMeaning('nai', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'nai').kanji,
            jpKana: baseForms.find((f) => f.formId === 'nai').kana,
          },
          {
            name: 'Простое прошедшее утвердительное',
            lesson: 9,
            ru: getRussianMeaning('ta', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'ta').kanji,
            jpKana: baseForms.find((f) => f.formId === 'ta').kana,
          },
          {
            name: 'Простое прошедшее отрицательное',
            lesson: 9,
            ru: getRussianMeaning('nakatta', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'nakatta').kanji,
            jpKana: baseForms.find((f) => f.formId === 'nakatta').kana,
          },
        ];

        const teGroup = [
          {
            name: 'て-форма',
            lesson: 6,
            ru: getRussianMeaning('te', word.translation),
            jpKanji: baseForms.find((f) => f.formId === 'te').kanji,
            jpKana: baseForms.find((f) => f.formId === 'te').kana,
          },
        ];

        const teFormKanji = baseForms.find((f) => f.formId === 'te').kanji;
        const teFormKana = baseForms.find((f) => f.formId === 'te').kana;
        const dictionaryKanji = baseForms.find((f) => f.formId === 'dictionary').kanji;
        const dictionaryKana = baseForms.find((f) => f.formId === 'dictionary').kana;
        const naiFormKanji = baseForms.find((f) => f.formId === 'nai').kanji;
        const naiFormKana = baseForms.find((f) => f.formId === 'nai').kana;
        const taFormKanji = baseForms.find((f) => f.formId === 'ta').kanji;
        const taFormKana = baseForms.find((f) => f.formId === 'ta').kana;

        const constructionsGroup = [
          {
            name: 'てください',
            lesson: 6,
            ru: getRussianMeaning('てください', word.translation),
            jpKanji: teFormKanji + 'ください',
            jpKana: teFormKana + 'ください',
          },
          {
            name: 'てもいいです',
            lesson: 6,
            ru: getRussianMeaning('てもいいです', word.translation),
            jpKanji: teFormKanji + 'もいいです',
            jpKana: teFormKana + 'もいいです',
          },
          {
            name: 'てはいけません',
            lesson: 6,
            ru: getRussianMeaning('てはいけません', word.translation),
            jpKanji: teFormKanji + 'はいけません',
            jpKana: teFormKana + 'はいけません',
          },
          {
            name: 'последовательность 〜て、〜',
            lesson: 6,
            ru: getRussianMeaning('последовательность 〜て、〜', word.translation),
            jpKanji: teFormKanji + '、...',
            jpKana: teFormKana + '、...',
          },
          {
            name: 'ています',
            lesson: 7,
            ru: getRussianMeaning('ています', word.translation),
            jpKanji: teFormKanji + 'います',
            jpKana: teFormKana + 'います',
          },
          {
            name: 'основа + に行く/来る/帰る',
            lesson: 7,
            ru: getRussianMeaning('основа + に行く/来る/帰る', word.translation),
            jpKanji: stemKanji + 'に行く/来る/帰る',
            jpKana: stemKana + 'にいく/くる/かえる',
          },
          {
            name: 'найдеください',
            lesson: 8,
            ru: getRussianMeaning('ないдеください', word.translation),
            jpKanji: naiFormKanji + 'でください',
            jpKana: naiFormKana + 'деください',
          },
          {
            name: 'と思います',
            lesson: 8,
            ru: getRussianMeaning('と思います', word.translation),
            jpKanji: dictionaryKanji + 'と思います',
            jpKana: dictionaryKana + 'とおもいます',
          },
          {
            name: '言っていました',
            lesson: 8,
            ru: getRussianMeaning('сказал', word.translation),
            jpKanji: dictionaryKanji + 'と言っていました',
            jpKana: dictionaryKana + 'といっていました',
          },
          {
            name: 'のが好きです',
            lesson: 8,
            ru: getRussianMeaning('のが好きです', word.translation),
            jpKanji: dictionaryKanji + 'のが好きです',
            jpKana: dictionaryKana + 'のが好きです',
          },
          {
            name: 'つもりです',
            lesson: 10,
            ru: getRussianMeaning('つもりです', word.translation),
            jpKanji: dictionaryKanji + 'つもりです',
            jpKana: dictionaryKana + 'つもりです',
          },
          {
            name: 'たことがあります',
            lesson: 11,
            ru: getRussianMeaning('たことがあります', word.translation),
            jpKanji: taFormKanji + 'ことがあります',
            jpKana: taFormKana + 'ことがあります',
          },
          {
            name: 'たり〜たりします',
            lesson: 11,
            ru: getRussianMeaning('たり〜たりします', word.translation),
            jpKanji: taFormKanji + 'り、...たりします',
            jpKana: taFormKana + 'り、...たりします',
          },
          {
            name: 'たい',
            lesson: 11,
            ru: getRussianMeaning('たい', word.translation),
            jpKanji: stemKanji + 'たい',
            jpKana: stemKana + 'たい',
          },
        ];

        const renderRowHtml = (item) => {
          const locked = isLocked(item.lesson);
          const formattedJp = formatJp(item.jpKanji, item.jpKana);
          return `
            <div class="dict-conj-row ${locked ? 'locked' : ''}">
              <div class="dict-conj-cell cell-name">
                <span class="dict-conj-name">${item.name}</span>
              </div>
              <div class="dict-conj-cell cell-badge">
                <span class="dict-conj-lesson-badge">Урок ${item.lesson}</span>
              </div>
              <div class="dict-conj-cell cell-value">
                <div class="dict-conj-value">
                  ${
                    locked
                      ? `
                    <span class="dict-conj-locked-text">Откроется в уроке ${item.lesson}</span>
                  `
                      : `
                    <span class="dict-conj-actual-form" style="opacity: 1; visibility: visible; filter: none; display: inline;">${formattedJp}</span>
                  `
                  }
                </div>
              </div>
              <div class="dict-conj-cell cell-translation">
                <span class="dict-conj-translation">${locked ? '—' : item.ru}</span>
              </div>
            </div>
          `;
        };

        conjugationHtml = `
          <div class="dict-section dict-conjugation">
            <h3 class="dict-section-title">Спряжение глагола</h3>
            <div class="dict-section-body">
              <div class="dict-conj-tabs">
                <button class="dict-conj-tab-btn active" data-tab="polite">Вежливые</button>
                <button class="dict-conj-tab-btn" data-tab="plain">Простые</button>
                <button class="dict-conj-tab-btn" data-tab="te">て-форма</button>
                <button class="dict-conj-tab-btn" data-tab="constructions">Конструкции</button>
              </div>
              
              <div class="dict-conj-panel" id="dict-conj-panel-polite" style="display: flex;">
                ${politeGroup.map(renderRowHtml).join('')}
              </div>
              <div class="dict-conj-panel" id="dict-conj-panel-plain" style="display: none;">
                ${plainGroup.map(renderRowHtml).join('')}
              </div>
              <div class="dict-conj-panel" id="dict-conj-panel-te" style="display: none;">
                ${teGroup.map(renderRowHtml).join('')}
              </div>
              <div class="dict-conj-panel" id="dict-conj-panel-constructions" style="display: none;">
                ${constructionsGroup.map(renderRowHtml).join('')}
              </div>
            </div>
          </div>
        `;
      } catch (err) {
        console.error('Ошибка при генерации спряжений:', err);
        conjugationHtml = `
          <div class="dict-section dict-conjugation">
            <h3 class="dict-section-title">Спряжение глагола</h3>
            <div class="dict-section-body">
              <div class="dict-empty-state">Не удалось построить таблицу спряжений</div>
            </div>
          </div>
        `;
      }
    }

    function buildExampleBlockHtml() {
      const currentExample = exampleCandidates.length > 0 ? exampleCandidates[exampleIndex] : null;

      if (!currentExample) {
        return `<div class="dict-empty-state">Примеры предложений пока отсутствуют</div>`;
      }

      const isCurated = ['curated-word', 'curated', 'contextProduction'].includes(
        currentExample.source
      );
      const sourceLabel = isCurated ? 'Проверенный' : 'Из урока';
      const sourceBadgeClass = isCurated ? 'badge-curated' : 'badge-lesson';
      const sourceBadge = `<span class="dict-example-badge ${sourceBadgeClass}">${sourceLabel}</span>`;

      const readingHtml = currentExample.reading
        ? `<div class="dict-example-reading">${currentExample.reading}</div>`
        : '';

      const navHtml =
        exampleCandidates.length > 1
          ? `
        <div class="dict-example-footer">
          <div class="dict-example-nav">
            <button class="dict-example-prev btn-secondary-sm" id="dict-example-prev" aria-label="Предыдущий пример">←</button>
            <span class="dict-example-counter">${exampleIndex + 1} из ${exampleCandidates.length}</span>
            <button class="dict-example-next btn-secondary-sm" id="dict-example-next" aria-label="Следующий пример">→</button>
          </div>
        </div>
      `
          : '';

      return `
        <div class="dict-example-card" id="dict-example-card">
          <div class="dict-example-header">
            ${sourceBadge}
            <button class="dict-example-speak btn-ghost-sm" id="dict-example-speak"
              aria-label="Озвучить пример">🔊</button>
          </div>
          <div class="dict-example-jp" id="dict-example-jp">${currentExample.japaneseHighlighted}</div>
          ${readingHtml}
          <div class="dict-example-ru">${currentExample.translation}</div>
          ${navHtml}
        </div>
      `;
    }

    body.innerHTML = `
      <div class="dict-modal">
        <div class="dict-modal-header">
          <button class="btn-ghost" id="dict-modal-close">← Назад</button>
          <button class="dict-modal-speak" id="dict-modal-speak" aria-label="Озвучить">🔊</button>
        </div>
        
        <div class="dict-modal-content">
          <div class="dict-word-header-card">
            <div class="dict-word-main-info">
              <h2 class="dict-word-kanji">${word.kanji || word.writing}</h2>
              <p class="dict-word-reading">${word.writing}</p>
              ${word.romaji ? `<p class="dict-word-romaji">${word.romaji}</p>` : ''}
            </div>
            <div class="dict-word-translation-section">
              <p class="dict-word-translation">${word.translation}</p>
            </div>
            <div class="dict-word-meta-badges">
              <span class="dict-badge badge-pos">${getPartOfSpeechLabel(word.partOfSpeech)}</span>
              ${word.topic ? `<span class="dict-badge badge-topic">${getTopicLabel(word.topic)}</span>` : ''}
              ${word.partOfSpeech === 'verb' && word.verbClass ? `<span class="dict-badge badge-verbclass">${getVerbClassLabel(word.verbClass)}</span>` : ''}
              <span class="dict-badge badge-lessons">${getLessonsLabel(word.lessonIds)}</span>
            </div>
          </div>

          <div class="dict-section dict-examples">
            <h3 class="dict-section-title">Примеры предложений</h3>
            <div class="dict-section-body" id="dict-examples-body">
              ${buildExampleBlockHtml()}
            </div>
          </div>

          ${word.partOfSpeech === 'verb' ? conjugationHtml : ''}

          ${
            (word.particlePatterns && word.particlePatterns.length > 0) ||
            word.transitivity ||
            word.note
              ? `
          <div class="dict-section dict-usage">
            <h3 class="dict-section-title">Употребление</h3>
            <div class="dict-section-body dict-usage-grid">
              ${
                word.particlePatterns && word.particlePatterns.length > 0
                  ? `
              <div class="dict-usage-row">
                <span class="dict-usage-label">Частицы:</span>
                <span class="dict-usage-value">${word.particlePatterns.map((p) => `<span class="dict-particle-tag">${p}</span>`).join(' ')}</span>
              </div>
              `
                  : ''
              }
              ${
                word.transitivity && word.partOfSpeech === 'verb'
                  ? `
              <div class="dict-usage-row">
                <span class="dict-usage-label">Переходность:</span>
                <span class="dict-usage-value">${word.transitivity === 'transitive' ? 'Переходный глагол' : word.transitivity === 'intransitive' ? 'Непереходный глагол' : '<span class="dict-empty-inline">—</span>'}</span>
              </div>
              `
                  : ''
              }
              ${
                word.note
                  ? `
              <div class="dict-usage-row">
                <span class="dict-usage-label">Заметки:</span>
                <span class="dict-usage-value dict-usage-notes">${word.note}</span>
              </div>
              `
                  : ''
              }
            </div>
          </div>
          `
              : ''
          }

          ${
            hasKanji
              ? `
            <details class="dict-details-accordion" id="dict-kanji-details" ${isKanjiOpen ? 'open' : ''}>
              <summary class="dict-details-summary">Кандзи и написание</summary>
              <div class="dict-details-content">
                ${kanjiTabsHtml}
                <div class="dict-kanji-writer-container">
                  <div id="dict-kanji-writer-target"></div>
                </div>
                <div class="dict-kanji-controls">
                  <button class="btn-secondary" id="dict-animate-btn">🎬 Анимация черт</button>
                  <button class="btn-secondary" id="dict-quiz-btn">✍️ Пропись</button>
                </div>
              </div>
            </details>
          `
              : ''
          }

          <details class="dict-details-accordion" id="dict-progress-details" ${isProgressOpen ? 'open' : ''}>
            <summary class="dict-details-summary">Прогресс изучения</summary>
            <div class="dict-details-content">
              <div class="dict-mastery-overall">
                <div class="dict-mastery-score-row">
                  <span class="dict-mastery-level-label">Уровень освоения: <strong class="dict-mastery-level-value">${mastery.label}</strong></span>
                  <span class="dict-mastery-score-value">${mastery.score}%</span>
                </div>
                <div class="dict-mastery-progress-bar">
                  <div class="dict-mastery-progress-fill" style="width: ${mastery.score}%"></div>
                </div>
              </div>
              
              <div class="dict-skills-list">
                ${renderSkillRow('recognition', 'Узнавание (Recognition)', mastery, appSkills)}
                ${renderSkillRow('recall', 'Воспроизведение (Recall)', mastery, appSkills)}
                ${renderSkillRow('context-production', 'Использование (Production)', mastery, appSkills)}
              </div>
            </div>
          </details>
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

    const examplesBody = $('#dict-examples-body');
    if (examplesBody) {
      examplesBody.onclick = (e) => {
        const prevBtn = e.target.closest('#dict-example-prev');
        const nextBtn = e.target.closest('#dict-example-next');
        const speakBtn = e.target.closest('#dict-example-speak');

        if (prevBtn) {
          e.stopPropagation();
          if (exampleCandidates.length > 1) {
            exampleIndex = (exampleIndex - 1 + exampleCandidates.length) % exampleCandidates.length;
            examplesBody.innerHTML = buildExampleBlockHtml();
          }
        } else if (nextBtn) {
          e.stopPropagation();
          if (exampleCandidates.length > 1) {
            exampleIndex = (exampleIndex + 1) % exampleCandidates.length;
            examplesBody.innerHTML = buildExampleBlockHtml();
          }
        } else if (speakBtn) {
          e.stopPropagation();
          const currEx = exampleCandidates[exampleIndex];
          if (currEx) speakJapanese(currEx.japanese);
        }
      };
    }

    const conjSection = $('.dict-conjugation');
    if (conjSection) {
      const tabBtns = $$('.dict-conj-tab-btn');
      const panels = $$('.dict-conj-panel');
      tabBtns.forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const targetTab = btn.dataset.tab;
          tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
          panels.forEach((p) => {
            const isTarget = p.id === `dict-conj-panel-${targetTab}`;
            p.style.display = isTarget ? 'flex' : 'none';
          });
        };
      });
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
      initDictionaryKanjiWriter(selectedKanji, dependencies);
    }
  };

  renderModalContent();
}

export async function initDictionaryKanjiWriter(kanji, dependencies = {}) {
  const { toast } = dependencies;
  const target = document.getElementById('dict-kanji-writer-target');
  const container = target?.parentElement;
  const controls = document.querySelector('.dict-kanji-controls');

  if (!target) {
    console.warn('dict-kanji-writer-target not found');
    return;
  }

  target.innerHTML = '';
  target.style.touchAction = 'none';

  const loadKanjiData = (char) => {
    const cleanChar = cleanKanjiChar(char);
    if (!cleanChar) {
      return Promise.reject(new Error('Пустой символ после очистки'));
    }
    return localCharDataLoader(cleanChar);
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
            if (typeof toast === 'function') toast('✅ Отлично!');
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

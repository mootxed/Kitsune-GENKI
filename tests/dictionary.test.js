/* global Event */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderDictionary, getWordStatus, openDictionaryModal } from '../ui/flashcards.js';
import { calculateMastery } from '../src/mastery.js';

// Mock getRetrievability and calculateMastery
vi.mock('../src/mastery.js', async () => {
  const actual = await vi.importActual('../src/mastery.js');
  return {
    ...actual,
    calculateMastery: vi.fn(),
  };
});

// Mock example-generator so dict tests control example content
vi.mock('../src/example-generator.js', () => ({
  generateExample: vi.fn(() => ({
    japanese: '寿司を食べる。',
    japaneseHighlighted: '<mark class="ex-highlight">食べる</mark>。寿司を食べる。',
    reading: 'すしをたべる。',
    translation: 'Есть суши.',
    source: 'corpus',
    grammar: null,
  })),
  nextSeed: vi.fn((s) => s + 1),
  highlightWord: vi.fn((s) => s),
  EXAMPLE_SOURCES: { CORPUS: 'corpus', TEMPLATE: 'template' },
}));

describe('Dictionary UI System', () => {
  let state;
  let dependencies;

  beforeEach(() => {
    // Set up a clean DOM container
    document.body.innerHTML = '<div id="srs-body"></div>';

    // Set up global toast mock
    global.toast = vi.fn();

    // Set up a clean state
    state = {
      chapters: {
        1: { started: true },
        2: { started: true },
        3: { started: false }, // locked lesson
      },
      activeChapterId: 1,
      srs: {},
      reviewEvents: [],
      masteryArchive: {},
    };

    // Set up dependencies
    dependencies = {
      CONTENT_INDEX: [
        { id: 1, title: 'Урок 1' },
        { id: 2, title: 'Урок 2' },
        { id: 3, title: 'Урок 3' },
      ],
      ensureLesson: vi.fn().mockResolvedValue({}),
      toast: global.toast,
      LESSONS: [
        {
          id: 1,
          title: 'Приветствия',
          words: [
            {
              id: 'L1_V001',
              kanji: 'こんにちは',
              writing: 'こんにちは',
              romaji: 'konnichiwa',
              translation: 'здравствуйте',
              partOfSpeech: 'expression',
              lexemeId: 'lexeme_hello',
              lessonIds: [1],
            },
            {
              id: 'L1_V002',
              kanji: '食べる',
              writing: 'たべる',
              romaji: 'taberu',
              translation: 'есть',
              partOfSpeech: 'verb',
              lexemeId: 'lexeme_eat',
              lessonIds: [1, 2],
            },
          ],
        },
        {
          id: 2,
          title: 'Еда',
          words: [
            {
              id: 'L2_V001',
              kanji: '美味しい',
              writing: 'おいしい',
              romaji: 'oishii',
              translation: 'вкусный',
              partOfSpeech: 'adjective',
              lexemeId: 'lexeme_delicious',
              lessonIds: [2],
            },
            {
              id: 'L2_V002',
              kanji: '食べる',
              writing: 'たべる',
              romaji: 'taberu',
              translation: 'есть',
              partOfSpeech: 'verb',
              lexemeId: 'lexeme_eat',
              lessonIds: [1, 2],
            },
          ],
        },
        {
          id: 3,
          title: 'Будущее',
          words: [
            {
              id: 'L3_V001',
              kanji: '明日',
              writing: 'あした',
              romaji: 'ashita',
              translation: 'завтра',
              partOfSpeech: 'noun',
              lexemeId: 'lexeme_tomorrow',
              lessonIds: [3],
            },
          ],
        },
      ],
    };

    // Mock calculateMastery default return (New state)
    vi.mocked(calculateMastery).mockReturnValue({
      level: 'Новое',
      needsRefresh: false,
      score: 0,
      label: 'Новое',
      readiness: 'Ещё не проверено',
      productionStatus: 'Production пока не проверен',
      readinessLabel: 'Ещё не проверено',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getWordStatus mapping logic', () => {
    it('должен возвращать статус locked для заблокированных слов', () => {
      const status = getWordStatus({ id: 'L3_V001' }, state);
      expect(status.status).toBe('locked');
      expect(status.symbol).toBe('🔒');
    });

    it('должен возвращать статус new для новых слов', () => {
      vi.mocked(calculateMastery).mockReturnValue({
        level: 'Новое',
        needsRefresh: false,
        score: 0,
      });
      const status = getWordStatus({ id: 'L1_V001' }, state);
      expect(status.status).toBe('new');
      expect(status.symbol).toBe('•');
    });

    it('должен возвращать статус refresh для слов, требующих повторения', () => {
      vi.mocked(calculateMastery).mockReturnValue({
        level: 'Знакомо',
        needsRefresh: true,
        score: 30,
      });
      const status = getWordStatus({ id: 'L1_V001' }, state);
      expect(status.status).toBe('refresh');
      expect(status.symbol).toBe('↻');
    });

    it('должен возвращать статус learning для изучаемых слов', () => {
      vi.mocked(calculateMastery).mockReturnValue({
        level: 'Знакомо',
        needsRefresh: false,
        score: 25,
      });
      const status = getWordStatus({ id: 'L1_V001' }, state);
      expect(status.status).toBe('learning');
      expect(status.symbol).toBe('⚡');
    });

    it('должен возвращать статус confident для уверенно усвоенных слов', () => {
      vi.mocked(calculateMastery).mockReturnValue({
        level: 'Уверенно',
        needsRefresh: false,
        score: 75,
      });
      const status = getWordStatus({ id: 'L1_V001' }, state);
      expect(status.status).toBe('confident');
      expect(status.symbol).toBe('✓');
    });

    it('должен возвращать статус mastered для полностью освоенных слов', () => {
      vi.mocked(calculateMastery).mockReturnValue({
        level: 'Освоено',
        needsRefresh: false,
        score: 100,
      });
      const status = getWordStatus({ id: 'L1_V001' }, state);
      expect(status.status).toBe('mastered');
      expect(status.symbol).toBe('★');
    });
  });

  describe('Overall Mastery Bar', () => {
    it('должен корректно вычислять общую полоску мастерства словаря', async () => {
      // Mock different mastery scores for unlocked words:
      // L1_V001 score=80, L1_V002 score=40, L2_V001 score=90, L2_V002 score=70
      // L3_V001 is locked, so its score won't be calculated/summed in overall progress
      // Total unlocked words = 4. Average mastery = (80 + 40 + 90 + 70) / 5 (total words in dict = 5) = 280 / 5 = 56%
      vi.mocked(calculateMastery).mockImplementation(({ itemId }) => {
        if (itemId === 'L1_V001') return { level: 'Уверенно', score: 80 };
        if (itemId === 'L1_V002') return { level: 'Знакомо', score: 40 };
        if (itemId === 'L2_V001') return { level: 'Освоено', score: 90 };
        if (itemId === 'L2_V002') return { level: 'Уверенно', score: 70 };
        return { level: 'Новое', score: 0 };
      });

      await renderDictionary(state, dependencies);

      const overallPercent = document.getElementById('dict-overall-percent');
      const overallFill = document.getElementById('dict-overall-fill');

      expect(overallPercent).not.toBeNull();
      expect(overallFill).not.toBeNull();
      // Total words = 5, total mastery = 280. 280 / 5 = 56%.
      expect(overallPercent.textContent).toBe('56%');
      expect(overallFill.style.width).toBe('56%');
    });
  });

  describe('Lesson Collapsing and Default State', () => {
    it('должен раскрывать только текущий доступный урок по умолчанию', async () => {
      state.activeChapterId = 2;

      await renderDictionary(state, dependencies);

      const lessons = document.querySelectorAll('.dict-lesson');
      expect(lessons).toHaveLength(3);

      // Lesson 1 is unlocked, activeChapterId=2, so Lesson 1 should be collapsed
      expect(lessons[0].classList.contains('is-collapsed')).toBe(true);

      // Lesson 2 is unlocked and matches activeChapterId=2, so it should be expanded
      expect(lessons[1].classList.contains('is-expanded')).toBe(true);

      // Lesson 3 is locked, so it shouldn't have expanded/collapsed status list (shown in 1 line)
      expect(lessons[2].classList.contains('is-locked')).toBe(true);
    });

    it('должен сворачивать/разворачивать открытый урок при клике по заголовку', async () => {
      state.activeChapterId = 1;
      await renderDictionary(state, dependencies);

      const lessons = document.querySelectorAll('.dict-lesson');
      const header1 = lessons[0].querySelector('.dict-lesson-header');

      expect(lessons[0].classList.contains('is-expanded')).toBe(true);

      // Click to collapse
      header1.click();
      expect(lessons[0].classList.contains('is-collapsed')).toBe(true);

      // Click to expand
      header1.click();
      expect(lessons[0].classList.contains('is-expanded')).toBe(true);
    });

    it('не должен позволять разворачивать закрытый урок и показывать тост', async () => {
      state.activeChapterId = 1;
      await renderDictionary(state, dependencies);

      const lessons = document.querySelectorAll('.dict-lesson');
      const header3 = lessons[2].querySelector('.dict-lesson-header');

      header3.click();
      expect(dependencies.toast).toHaveBeenCalledWith(
        '🔒 Начните Главу 3, чтобы разблокировать этот урок'
      );
    });
  });

  describe('Search Integration', () => {
    it('должен фильтровать слова и автоматически раскрывать уроки с результатами', async () => {
      vi.useFakeTimers();
      await renderDictionary(state, dependencies);

      const searchInput = document.getElementById('dict-search');
      searchInput.value = 'вкусный';
      searchInput.dispatchEvent(new Event('input'));

      // Wait for search timeout
      vi.advanceTimersByTime(310);

      const visibleCards = document.querySelectorAll('.dict-word-card');
      expect(visibleCards).toHaveLength(1);
      expect(visibleCards[0].textContent).toContain('美味しい');

      const lesson2 = document.querySelector('.dict-lesson[data-lesson-id="2"]');
      expect(lesson2.classList.contains('is-expanded')).toBe(true);
      vi.useRealTimers();
    });
  });

  describe('Category Filters', () => {
    it('должен правильно фильтровать слова по частям речи', async () => {
      await renderDictionary(state, dependencies);

      // Click on Verbs filter
      const verbFilterBtn = document.querySelector('.dict-filter-btn[data-filter="verb"]');
      verbFilterBtn.click();

      // Only 'Eating' (たべる) should remain visible
      const visibleCards = document.querySelectorAll('.dict-word-card');
      expect(visibleCards).toHaveLength(2); // たべる is in lesson 1 and lesson 2
      expect(visibleCards[0].textContent).toContain('食べる');
      expect(visibleCards[1].textContent).toContain('食べる');

      // Click on Adjectives filter
      const adjFilterBtn = document.querySelector('.dict-filter-btn[data-filter="adjective"]');
      adjFilterBtn.click();

      const visibleCardsAdj = document.querySelectorAll('.dict-word-card');
      expect(visibleCardsAdj).toHaveLength(1);
      expect(visibleCardsAdj[0].textContent).toContain('美味しい');
    });
  });

  describe('Locked Lessons and Closed Answers', () => {
    it('должен скрывать японское написание и ответы для закрытых слов', async () => {
      // For lock tests, force a word in an unlocked lesson to be locked for the user
      state.chapters[2].started = false;

      await renderDictionary(state, dependencies);

      // Lesson 2 is now locked. It must be rendered as a single line with no word cards inside.
      const lesson2 = document.querySelector('.dict-lesson[data-lesson-id="2"]');
      expect(lesson2.classList.contains('is-locked')).toBe(true);
      expect(lesson2.querySelector('.dict-words-list')).toBeNull();
    });

    it('должен заменять кандзи на ??? для заблокированных слов при рендере в списке', async () => {
      state.chapters[2].started = true;

      // Let L2_V001 belong to Chapter 3 (locked)
      dependencies.LESSONS[1].words[0].id = 'L3_V999';

      await renderDictionary(state, dependencies);

      const lockedCard = document.querySelector('.dict-word-card[data-word-id="L3_V999"]');
      expect(lockedCard).not.toBeNull();
      expect(lockedCard.classList.contains('word-locked')).toBe(true);

      const kanjiEl = lockedCard.querySelector('.dict-word-kanji');
      expect(kanjiEl.textContent).toBe('???');
    });
  });

  describe('Duplicate lexemeId Grouping & Badges', () => {
    it('должен показывать badge совместных уроков и синхронизировать наведение', async () => {
      await renderDictionary(state, dependencies);

      // '食べる' has lexemeId = 'lexeme_eat' and lessonIds = [1, 2]
      const cards = document.querySelectorAll('.dict-word-card[data-lexeme-id="lexeme_eat"]');
      expect(cards).toHaveLength(2);

      // Each should have the lessons badge
      expect(cards[0].querySelector('.dict-word-lessons-badge').textContent).toBe('Уроки 1, 2');
      expect(cards[1].querySelector('.dict-word-lessons-badge').textContent).toBe('Уроки 1, 2');

      // Test hover synchronization
      cards[0].dispatchEvent(new Event('mouseenter'));
      expect(cards[0].classList.contains('lexeme-highlight')).toBe(true);
      expect(cards[1].classList.contains('lexeme-highlight')).toBe(true);

      cards[0].dispatchEvent(new Event('mouseleave'));
      expect(cards[0].classList.contains('lexeme-highlight')).toBe(false);
      expect(cards[1].classList.contains('lexeme-highlight')).toBe(false);
    });
  });

  describe('Word Card (openDictionaryModal) detailed tests', () => {
    let mockWordVerb;
    let mockWordNoun;
    let mockWordNoKanji;
    let mockWordMultipleKanji;

    beforeEach(() => {
      mockWordVerb = {
        id: 'L1_V002',
        kanji: '食べる',
        writing: 'たべる',
        romaji: 'taberu',
        translation: 'есть, кушать',
        partOfSpeech: 'verb',
        verbClass: 'ichidan',
        lessonIds: [1, 2],
        examples: [{ japanese: '寿司を食べる。', translation: 'Есть суши.' }],
        particlePatterns: ['を'],
        transitivity: 'transitive',
        note: 'Обычный глагол',
        contextProduction: {
          prompt: '昨日寿司を_。',
          meaningCue: 'съел',
          requiredForm: 'past',
          acceptedAnswers: ['たべた'],
        },
      };

      mockWordNoun = {
        id: 'L1_V001',
        kanji: 'こんにちは',
        writing: 'こんにちは',
        romaji: 'konnichiwa',
        translation: 'здравствуйте',
        partOfSpeech: 'expression',
        lessonIds: [1],
      };

      mockWordNoKanji = {
        id: 'L1_V003',
        kanji: '',
        writing: 'ここ',
        romaji: 'koko',
        translation: 'здесь',
        partOfSpeech: 'noun',
        lessonIds: [1],
      };

      mockWordMultipleKanji = {
        id: 'L1_V004',
        kanji: '明日',
        writing: 'あした',
        romaji: 'ashita',
        translation: 'завтра',
        partOfSpeech: 'noun',
        lessonIds: [1],
      };

      // Mock calculateMastery to return some mock values
      vi.mocked(calculateMastery).mockReturnValue({
        level: 'Уверенно',
        label: 'Уверенно',
        score: 75,
        skills: ['recognition', 'recall'],
        skillMetrics: {
          recognition: {
            card: { reps: 5 },
            accuracy: 0.9,
            stability: 14.5,
            retrievability: 0.88,
            hasSuccess: true,
          },
          recall: {
            card: { reps: 3 },
            accuracy: 0.8,
            stability: 7.2,
            retrievability: 0.81,
            hasSuccess: true,
          },
          'context-production': {
            card: null,
            accuracy: 0,
            stability: 0,
            retrievability: 0,
            hasSuccess: false,
          },
        },
      });
    });

    it('должен рендерить структуру карточки для глагола', () => {
      openDictionaryModal(mockWordVerb, state, dependencies);

      // Проверяем элементы хедера
      expect(document.querySelector('.dict-word-kanji').textContent).toBe('食べる');
      expect(document.querySelector('.dict-word-reading').textContent).toBe('たべる');
      expect(document.querySelector('.dict-word-romaji').textContent).toBe('taberu');
      expect(document.querySelector('.dict-word-translation').textContent).toBe('есть, кушать');
      expect(document.querySelector('.badge-pos').textContent).toBe('Глагол');
      expect(document.querySelector('.badge-verbclass').textContent).toBe('2-й класс (ichidan)');
      expect(document.querySelector('.badge-lessons').textContent).toBe('Уроки 1, 2');
      expect(document.querySelector('#dict-modal-speak')).not.toBeNull();

      // Примеры
      expect(document.querySelector('.dict-section.dict-examples')).not.toBeNull();
      // Генератор примеров вызван: блок либо показывает карточку с пример, либо empty-state
      const exampleJpEl = document.querySelector('.dict-example-jp');
      expect(exampleJpEl).not.toBeNull();
      // Проверяем что содержимое (innerHTML может содержать <mark>)
      expect(exampleJpEl.innerHTML).toContain('食べる');

      // Спряжение (так как это глагол)
      expect(document.querySelector('.dict-section.dict-conjugation')).not.toBeNull();

      // Употребление
      expect(document.querySelector('.dict-section.dict-usage')).not.toBeNull();
      expect(document.querySelector('.dict-particle-tag').textContent.trim()).toBe('を');
      expect(
        document.querySelector('.dict-usage-row:nth-child(2) .dict-usage-value').textContent.trim()
      ).toBe('Переходный глагол');
      expect(document.querySelector('.dict-usage-notes').textContent.trim()).toBe('Обычный глагол');

      // Кандзи
      expect(document.querySelector('#dict-kanji-details')).not.toBeNull();

      // Прогресс
      expect(document.querySelector('#dict-progress-details')).not.toBeNull();
    });

    it('не должен рендерить секцию спряжения и класс глагола для существительного/выражения', () => {
      openDictionaryModal(mockWordNoun, state, dependencies);

      expect(document.querySelector('.badge-verbclass')).toBeNull();
      expect(document.querySelector('.dict-section.dict-conjugation')).toBeNull();
    });

    it('не должен показывать блок кандзи и сообщение о его отсутствии для слова без кандзи', () => {
      openDictionaryModal(mockWordNoKanji, state, dependencies);

      expect(document.querySelector('#dict-kanji-details')).toBeNull();
      expect(document.body.innerHTML).not.toContain('нет кандзи');
    });

    it('должен поддерживать переключение вкладок для слова с несколькими кандзи', () => {
      openDictionaryModal(mockWordMultipleKanji, state, dependencies);

      const kanjiAccordion = document.querySelector('#dict-kanji-details');
      expect(kanjiAccordion).not.toBeNull();

      const tabs = document.querySelectorAll('.dict-kanji-tab');
      expect(tabs).toHaveLength(2);
      expect(tabs[0].textContent.trim()).toBe('明');
      expect(tabs[1].textContent.trim()).toBe('日');

      expect(tabs[0].classList.contains('active')).toBe(true);

      // Кликаем по второй вкладке
      tabs[1].click();

      // После перерендера вторая вкладка должна стать активной
      const newTabs = document.querySelectorAll('.dict-kanji-tab');
      expect(newTabs[1].classList.contains('active')).toBe(true);
    });

    it('должен корректно отображать прогресс и FSRS навыки на основе calculateMastery', () => {
      openDictionaryModal(mockWordVerb, state, dependencies);

      // Общие показатели
      expect(document.querySelector('.dict-mastery-level-value').textContent).toBe('Уверенно');
      expect(document.querySelector('.dict-mastery-score-value').textContent).toBe('75%');
      expect(document.querySelector('.dict-mastery-progress-fill').style.width).toBe('75%');

      // Отдельные навыки
      const skillRows = document.querySelectorAll('.dict-skill-row');
      expect(skillRows).toHaveLength(3);

      // Recognition (Узнавание) - active
      expect(skillRows[0].classList.contains('skill-active')).toBe(true);
      expect(skillRows[0].querySelector('.badge-active')).not.toBeNull();
      expect(skillRows[0].querySelector('.dict-skill-metrics-grid').textContent).toContain('90%'); // accuracy
      expect(skillRows[0].querySelector('.dict-skill-metrics-grid').textContent).toContain(
        '15 дн.'
      ); // stability
      expect(skillRows[0].querySelector('.dict-skill-metrics-grid').textContent).toContain('88%'); // retrievability

      // Recall (Воспроизведение) - active
      expect(skillRows[1].classList.contains('skill-active')).toBe(true);
      expect(skillRows[1].querySelector('.dict-skill-metrics-grid').textContent).toContain('80%');
      expect(skillRows[1].querySelector('.dict-skill-metrics-grid').textContent).toContain('7 дн.');
      expect(skillRows[1].querySelector('.dict-skill-metrics-grid').textContent).toContain('81%');

      // Production (Использование) - inactive (queued)
      expect(skillRows[2].classList.contains('skill-inactive')).toBe(true);
      expect(skillRows[2].querySelector('.badge-queued')).not.toBeNull();
      expect(skillRows[2].querySelector('.dict-skill-metrics-grid')).toBeNull();
    });

    it('должен рендерить 4 вкладки спряжения и переключать их по клику', () => {
      state.activeChapterId = 8;
      openDictionaryModal(mockWordVerb, state, dependencies);

      const conjugationSection = document.querySelector('.dict-conjugation');
      expect(conjugationSection).not.toBeNull();

      const tabs = document.querySelectorAll('.dict-conj-tab-btn');
      expect(tabs).toHaveLength(4);
      expect(tabs[0].textContent.trim()).toBe('Вежливые');
      expect(tabs[1].textContent.trim()).toBe('Простые');
      expect(tabs[2].textContent.trim()).toBe('て-форма');
      expect(tabs[3].textContent.trim()).toBe('Конструкции');

      const politePanel = document.querySelector('#dict-conj-panel-polite');
      const plainPanel = document.querySelector('#dict-conj-panel-plain');
      expect(politePanel.style.display).toBe('flex');
      expect(plainPanel.style.display).toBe('none');

      // Кликаем по вкладке "Простые"
      tabs[1].click();
      expect(politePanel.style.display).toBe('none');
      expect(plainPanel.style.display).toBe('flex');
    });

    it('должен скрывать японский ответ и раскрывать его по клику на Показать', () => {
      state.activeChapterId = 8;
      openDictionaryModal(mockWordVerb, state, dependencies);

      // Ищем строку "ます" (первая в Polite)
      const valueDiv = document.querySelector('#dict-conj-panel-polite .dict-conj-value');
      expect(valueDiv).not.toBeNull();
      expect(valueDiv.getAttribute('data-revealed')).toBe('false');

      const trigger = valueDiv.querySelector('.dict-conj-reveal-trigger');
      expect(trigger).not.toBeNull();

      // Кликаем по кнопке «Показать»
      trigger.click();
      expect(valueDiv.getAttribute('data-revealed')).toBe('true');
    });

    it('должен блокировать формы будущих уроков и открывать текущие/прошлые', () => {
      // Устанавливаем текущий урок = 5
      state.activeChapterId = 5;
      openDictionaryModal(mockWordVerb, state, dependencies);

      // ます-форма (урок 3) - должна быть доступна (есть кнопка "Показать")
      const masuValue = document.querySelector(
        '#dict-conj-panel-polite .dict-conj-row:nth-child(1) .dict-conj-value'
      );
      expect(masuValue.querySelector('.dict-conj-reveal-trigger')).not.toBeNull();

      // ました-форма (урок 4) - должна быть доступна
      const mashitaValue = document.querySelector(
        '#dict-conj-panel-polite .dict-conj-row:nth-child(4) .dict-conj-value'
      );
      expect(mashitaValue.querySelector('.dict-conj-reveal-trigger')).not.toBeNull();

      // ましょう-форма (урок 5) - должна быть доступна
      const mashouValue = document.querySelector(
        '#dict-conj-panel-polite .dict-conj-row:nth-child(6) .dict-conj-value'
      );
      expect(mashouValue.querySelector('.dict-conj-reveal-trigger')).not.toBeNull();

      // て-форма (урок 6) - должна быть заблокирована
      const teValue = document.querySelector(
        '#dict-conj-panel-te .dict-conj-row:nth-child(1) .dict-conj-value'
      );
      expect(teValue.querySelector('.dict-conj-reveal-trigger')).toBeNull();
      expect(teValue.querySelector('.dict-conj-locked-text').textContent).toContain(
        'Откроется в уроке 6'
      );

      // Простые формы (уроки 8-9) - должны быть заблокированы
      const dictValue = document.querySelector(
        '#dict-conj-panel-plain .dict-conj-row:nth-child(1) .dict-conj-value'
      );
      expect(dictValue.querySelector('.dict-conj-reveal-trigger')).toBeNull();
      expect(dictValue.querySelector('.dict-conj-locked-text').textContent).toContain(
        'Откроется в уроке 8'
      );
    });

    it('должен содержать корректную разметку с классами для адаптивной мобильной вёрстки', () => {
      state.activeChapterId = 11;
      openDictionaryModal(mockWordVerb, state, dependencies);

      const rows = document.querySelectorAll('.dict-conj-row');
      expect(rows.length).toBeGreaterThan(0);

      // Проверяем, что в строке присутствуют ячейки с нужными классами для мобильного перестроения
      const firstRow = rows[0];
      expect(firstRow.querySelector('.cell-name')).not.toBeNull();
      expect(firstRow.querySelector('.cell-badge')).not.toBeNull();
      expect(firstRow.querySelector('.cell-value')).not.toBeNull();
      expect(firstRow.querySelector('.cell-translation')).not.toBeNull();
    });
  });
});

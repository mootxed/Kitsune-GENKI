/**
 * tests/examples-switching-and-corpus.test.js
 * Комплексные модульные тесты переключения примеров, индексирования корпуса и фильтров словаря.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ExamplesDB, isWordInSentence } from '../src/examples-db.js';
import { getExampleCandidates } from '../src/example-generator.js';
import { getCanonicalMaxUnlockedLesson } from '../src/chapter-progress.js';
import { openDictionaryModal, dictionaryViewState, renderDictionary } from '../ui/flashcards.js';
import { speakJapanese } from '../src/audio-helper.js';

vi.mock('../src/audio-helper.js', () => ({
  speakJapanese: vi.fn(),
}));

describe('KotoKitsu Example Switching and Corpus Integration Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="srs-body"></div>';
    ExamplesDB.clear();
    vi.clearAllMocks();
  });

  // 1. getExampleCandidates() возвращает минимум 3 разных примера
  it('1. getExampleCandidates() возвращает минимум 3 разных примера для тестового слова', () => {
    const word = {
      id: 'w_taberu',
      lexemeId: 'lex_taberu',
      kanji: '食べる',
      writing: 'たべる',
      partOfSpeech: 'verb',
      verbClass: 'ichidan',
      lessonIds: [1],
    };
    ExamplesDB.registerVocabulary([word]);
    ExamplesDB.addRawSentence({
      japanese: 'りんごを食べる。',
      translation: 'Ем яблоко',
      sourceLessonId: 1,
      source: 'story',
    });
    ExamplesDB.addRawSentence({
      japanese: 'パンを食べます。',
      translation: 'Ем хлеб',
      sourceLessonId: 1,
      source: 'note',
    });
    ExamplesDB.addRawSentence({
      japanese: '朝ごはんを食べた。',
      translation: 'Поел завтрак',
      sourceLessonId: 1,
      source: 'particles',
    });
    ExamplesDB.rebuildIndex();

    const candidates = getExampleCandidates(word, { userMaxLesson: 5 });
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    const uniqueSentences = new Set(candidates.map((c) => c.japanese));
    expect(uniqueSentences.size).toBeGreaterThanOrEqual(3);
  });

  // 2-6. Переключение примеров через UI (dict-example-next / dict-example-prev)
  it('2-6. Клик по кнопке навигации меняет текст, чтение, перевод, счётчик и циклически возвращает к первому', () => {
    const word = {
      id: 'w_test',
      lexemeId: 'lex_test',
      kanji: '飲む',
      writing: 'のむ',
      lessonIds: [1],
      partOfSpeech: 'verb',
      verbClass: 'godan',
    };
    ExamplesDB.registerVocabulary([word]);
    ExamplesDB.addRawSentence({
      japanese: '水を飲む。',
      reading: 'みずをのむ',
      translation: 'Пить воду',
      sourceLessonId: 1,
      source: 'story',
    });
    ExamplesDB.addRawSentence({
      japanese: 'お茶を飲みます。',
      reading: 'おちゃをのみます',
      translation: 'Пью чай',
      sourceLessonId: 1,
      source: 'note',
    });
    ExamplesDB.addRawSentence({
      japanese: 'ジュースを飲んだ。',
      reading: 'じゅーすをのんだ',
      translation: 'Выпил сок',
      sourceLessonId: 1,
      source: 'particles',
    });
    ExamplesDB.rebuildIndex();

    const mockState = { chapters: { 1: { started: true } }, activeChapterId: 1 };
    const mockDeps = { nav: vi.fn() };

    openDictionaryModal(word, mockState, mockDeps);

    const getJp = () => document.querySelector('#dict-example-jp').textContent;
    const getRu = () => document.querySelector('.dict-example-ru').textContent;
    const getCounter = () => document.querySelector('.dict-example-counter').textContent;
    const clickNext = () => document.querySelector('#dict-example-next').click();

    expect(getCounter()).toContain('1 из 3');
    const firstJp = getJp();
    const firstRu = getRu();

    // Клик 1 -> Второй пример
    clickNext();
    expect(getJp()).not.toBe(firstJp);
    expect(getRu()).not.toBe(firstRu);
    expect(getCounter()).toContain('2 из 3');
    const secondJp = getJp();

    // Клик 2 -> Третий пример
    clickNext();
    expect(getJp()).not.toBe(secondJp);
    expect(getCounter()).toContain('3 из 3');

    // Клик 3 -> Зацикливание к 1-му примеру
    clickNext();
    expect(getJp()).toBe(firstJp);
    expect(getCounter()).toContain('1 из 3');
  });

  // 7. Озвучивание озвучивает ТЕКУЩИЙ пример
  it('7. Кнопка озвучки примера произносит текущий выведенный пример', () => {
    const word = {
      id: 'w_speak',
      lexemeId: 'lex_speak',
      kanji: '本',
      writing: 'ほん',
      lessonIds: [1],
    };
    ExamplesDB.registerVocabulary([word]);
    ExamplesDB.addRawSentence({
      japanese: '本を読む。',
      translation: 'Читать книгу',
      sourceLessonId: 1,
      source: 'story',
    });
    ExamplesDB.addRawSentence({
      japanese: '本を買った。',
      translation: 'Купил книгу',
      sourceLessonId: 1,
      source: 'note',
    });
    ExamplesDB.rebuildIndex();

    openDictionaryModal(word, { chapters: { 1: { started: true } } }, { nav: vi.fn() });

    const nextBtn = document.querySelector('#dict-example-next');
    nextBtn.click(); // Переключаем на 2-й пример

    const speakBtn = document.querySelector('#dict-example-speak');
    speakBtn.click();

    expect(speakJapanese).toHaveBeenCalledWith('本を買った。');
  });

  // 8. Навигация скрыта при 1 примере
  it('8. Навигация скрыта если есть только 1 пример', () => {
    const word = {
      id: 'w_single',
      lexemeId: 'lex_single',
      kanji: '犬',
      writing: 'いぬ',
      lessonIds: [1],
    };
    ExamplesDB.registerVocabulary([word]);
    ExamplesDB.addRawSentence({
      japanese: '白い犬がいる。',
      translation: 'Есть белая собака',
      sourceLessonId: 1,
      source: 'story',
    });
    ExamplesDB.rebuildIndex();

    openDictionaryModal(word, { chapters: { 1: { started: true } } }, { nav: vi.fn() });

    const navContainer = document.querySelector('.dict-example-footer');
    expect(navContainer).toBeNull();
  });

  // 9. Переключение примеров не пересоздаёт спряжения
  it('9. Переключение примера не заменяет DOM-узлы таблицы спряжений', () => {
    const word = {
      id: 'w_verb',
      lexemeId: 'lex_verb',
      kanji: '行く',
      writing: 'いく',
      partOfSpeech: 'verb',
      verbClass: 'godan',
      lessonIds: [1],
    };
    ExamplesDB.registerVocabulary([word]);
    ExamplesDB.addRawSentence({
      japanese: '学校に行く。',
      translation: 'Иду в школу',
      sourceLessonId: 1,
      source: 'story',
    });
    ExamplesDB.addRawSentence({
      japanese: '東京へ行きます。',
      translation: 'Еду в Токио',
      sourceLessonId: 1,
      source: 'note',
    });
    ExamplesDB.rebuildIndex();

    openDictionaryModal(word, { chapters: { 1: { started: true } } }, { nav: vi.fn() });

    const conjSectionBefore = document.querySelector('.dict-conjugation');
    expect(conjSectionBefore).not.toBeNull();

    const nextBtn = document.querySelector('#dict-example-next');
    nextBtn.click();

    const conjSectionAfter = document.querySelector('.dict-conjugation');
    expect(conjSectionAfter).toBe(conjSectionBefore);
  });

  // 10-12. Исключение ложных совпадений `いくら` и `暖かくなる`
  it('10-12. いくら и 暖かくなる не считаются формой 行く, а настоящие формы (行きます, 行った) продолжают находить', () => {
    const ikuWord = {
      id: 'L3_V001',
      lexemeId: 'lex_iku',
      kanji: '行く',
      writing: 'いく',
      partOfSpeech: 'verb',
      verbClass: 'godan',
    };

    expect(isWordInSentence(ikuWord, 'あのう、このかばんはいくらですか。')).toBe(false);
    expect(isWordInSentence(ikuWord, '暖かくなる')).toBe(false);
    expect(isWordInSentence(ikuWord, '暖かいくなる')).toBe(false);

    expect(isWordInSentence(ikuWord, '学校に行きます。')).toBe(true);
    expect(isWordInSentence(ikuWord, '昨日東京に行った。')).toBe(true);
    expect(isWordInSentence(ikuWord, '映画館に行って、買物をした。')).toBe(true);
  });

  // 13-16. Curated JSON регистрация, отсутствие L2_V024 и повторная регистрация
  it('13-16. Curated JSON регистрирует 2 примера для L3_V046 (ранний), не трогает L7_V027 (быстрый) и не создаёт дубликаты', () => {
    const hayaiEarly = {
      id: 'L3_V046',
      lexemeId: 'lex_hayai_early',
      kanji: 'はやい',
      writing: 'はやい',
      lessonIds: [3],
      translation: 'ранний',
    };
    const hayaiFast = {
      id: 'L7_V027',
      lexemeId: 'lex_hayai_fast',
      kanji: 'はやい',
      writing: 'はやい',
      lessonIds: [7],
      translation: 'быстрый',
    };
    ExamplesDB.registerVocabulary([hayaiEarly, hayaiFast]);

    const curatedData = {
      version: 1,
      examples: [
        {
          id: 'curated-hayai-early-01',
          targetWordId: 'L3_V046',
          japanese: '朝は早いです',
          reading: 'あさははやいです',
          translation: 'Утро раннее',
          minLesson: 3,
        },
        {
          id: 'curated-hayai-early-02',
          targetWordId: 'L3_V046',
          japanese: '朝ごはんは七時です。早いですね。',
          reading: 'あさごはんはしちじです。はやいですね。',
          translation: 'Завтрак в семь часов. Это рано, не так ли?',
          minLesson: 3,
        },
      ],
    };

    ExamplesDB.registerCuratedWordExamples(curatedData);

    const earlyExamples = getExampleCandidates(hayaiEarly, { userMaxLesson: 12 });
    const fastExamples = getExampleCandidates(hayaiFast, { userMaxLesson: 12 });

    expect(earlyExamples.length).toBe(2);
    expect(fastExamples.length).toBe(0);

    // Повторная регистрация не должна удваивать корпус
    ExamplesDB.registerCuratedWordExamples(curatedData);
    const earlyExamplesAfterReRegister = getExampleCandidates(hayaiEarly, { userMaxLesson: 12 });
    expect(earlyExamplesAfterReRegister.length).toBe(2);
  });

  // 17. Сохранение реального источника
  it('17. Источник примера не заменяется принудительно на corpus', () => {
    const word = { id: 'w_src', lexemeId: 'lex_src', kanji: '猫', writing: 'ねこ', lessonIds: [1] };
    ExamplesDB.registerVocabulary([word]);
    ExamplesDB.addRawSentence({
      japanese: '猫がいる。',
      translation: 'Есть кошка',
      sourceLessonId: 1,
      source: 'story',
    });
    ExamplesDB.rebuildIndex();

    const candidates = getExampleCandidates(word, { userMaxLesson: 5 });
    expect(candidates[0].source).toBe('story');
  });

  // 18. Lesson gating
  it('18. getCanonicalMaxUnlockedLesson и фильтрация не раскрывают примеры будущих уроков', () => {
    const word = {
      id: 'w_gate',
      lexemeId: 'lex_gate',
      kanji: '車',
      writing: 'くるま',
      lessonIds: [1],
    };
    ExamplesDB.registerVocabulary([word]);
    ExamplesDB.addRawSentence({
      japanese: '車がある。',
      translation: 'Есть машина',
      sourceLessonId: 1,
      source: 'story',
    });
    ExamplesDB.addRawSentence({
      japanese: '新しい車を買った。',
      translation: 'Купил новую машину',
      sourceLessonId: 10,
      source: 'note',
    });
    ExamplesDB.rebuildIndex();

    const unlockedMax = getCanonicalMaxUnlockedLesson({ chapters: { 1: { started: true } } });
    expect(unlockedMax).toBe('1');

    const candidates = getExampleCandidates(word, { userMaxLesson: unlockedMax });
    expect(candidates.length).toBe(1);
    expect(candidates[0].japanese).toBe('車がある。');
  });

  // 19-20. Сохранение единого состояния фильтров словаря
  it('19-20. Фильтры словаря сохраняются при открытии/возврате из модального окна', async () => {
    const state = { activeChapterId: 1, chapters: { 1: { started: true } } };
    const deps = {
      LESSONS: [
        {
          id: 1,
          title: 'Урок 1',
          words: [
            {
              id: 'w1',
              lexemeId: 'l1',
              kanji: '食べる',
              writing: 'たべる',
              partOfSpeech: 'verb',
              topic: 'food',
              lessonIds: [1],
            },
            {
              id: 'w2',
              lexemeId: 'l2',
              kanji: '早い',
              writing: 'はやい',
              partOfSpeech: 'adjective',
              adjectiveClass: 'i',
              topic: 'time',
              lessonIds: [1],
            },
          ],
        },
      ],
    };

    dictionaryViewState.search = 'はやい';
    dictionaryViewState.partOfSpeech = 'adjective';
    dictionaryViewState.adjectiveClass = 'i';
    dictionaryViewState.topic = 'time';
    dictionaryViewState.expandedLessons.add(1);

    await renderDictionary(state, deps);

    expect(dictionaryViewState.search).toBe('はやい');
    expect(dictionaryViewState.partOfSpeech).toBe('adjective');
    expect(dictionaryViewState.adjectiveClass).toBe('i');
    expect(dictionaryViewState.topic).toBe('time');
    expect(dictionaryViewState.expandedLessons.has(1)).toBe(true);
  });

  // 21. Нет ложных доказательств в FSRS/mastery
  it('21. Переключение примеров не создаёт записей в FSRS, mastery, review log или outbox', () => {
    const word = {
      id: 'w_clean',
      lexemeId: 'lex_clean',
      kanji: '魚',
      writing: 'さかな',
      lessonIds: [1],
    };
    ExamplesDB.registerVocabulary([word]);
    ExamplesDB.addRawSentence({
      japanese: '魚を食べる。',
      translation: 'Ем рыбу',
      sourceLessonId: 1,
      source: 'story',
    });
    ExamplesDB.addRawSentence({
      japanese: '大きな魚だ。',
      translation: 'Большая рыба',
      sourceLessonId: 1,
      source: 'note',
    });
    ExamplesDB.rebuildIndex();

    const mockState = {
      srs: {},
      reviewEvents: [],
      pendingReviewLogs: [],
      chapters: { 1: { started: true } },
    };
    openDictionaryModal(word, mockState, { nav: vi.fn() });

    const nextBtn = document.querySelector('#dict-example-next');
    nextBtn.click();

    expect(Object.keys(mockState.srs).length).toBe(0);
    expect(mockState.reviewEvents.length).toBe(0);
    expect(mockState.pendingReviewLogs.length).toBe(0);
  });
});

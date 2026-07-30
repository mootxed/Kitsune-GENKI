// ui/flashcards/dictionary.js - Экран словаря, фильтрация, карточки и прогресс освоения

import { $, $$, escapeHtml } from '../../src/utils.js';
import { isWordUnlocked, cardChapter, wordById } from '../../src/srs-helpers.js';
import { cardsForItem, vocabularySkills } from '../../src/knowledge-model.js';
import { calculateMastery } from '../../src/mastery.js';
import { SRS } from '../../srs.js';
import { ExamplesDB } from '../../src/examples-db.js';
import { CURATED_PARTICLE_SENTENCES } from '../../src/particle-templates.js';
import { openDictionaryModal } from './dictionary-modal.js';
import { displayWordForm, getUnlockedKanjiLesson } from '../../src/genki-kanji.js';

export const dictionaryViewState = {
  search: '',
  partOfSpeech: 'all',
  topic: 'all',
  adjectiveClass: 'all',
  expandedLessons: new Set(),
};

export function emptyState(icon, title, desc) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${escapeHtml(icon)}</div>
      <h3 class="empty-state-title">${escapeHtml(title)}</h3>
      <p class="empty-state-desc">${escapeHtml(desc)}</p>
    </div>
  `;
}

export function getWordStatus(word, state) {
  const isUnlocked = isWordUnlocked(word.id, state.chapters);
  const chapterId = cardChapter(word.id);
  if (!isUnlocked) {
    return {
      status: 'locked',
      label: 'Закрыто',
      symbol: '🔒',
      title: `Заблокировано (Откроется в Главе ${chapterId})`,
    };
  }

  const itemCards = cardsForItem(state.srs, word.id);
  const mastery = calculateMastery({
    itemId: word.id,
    cards: itemCards,
    events: state.reviewEvents || [],
    archive: state.masteryArchive?.[word.id],
    applicableSkills: vocabularySkills(word, {
      unlockedKanjiLesson: getUnlockedKanjiLesson(state),
    }),
    getRetrievability: (card, now) => SRS.getRetrievability(card, now),
  });

  const level = mastery.level;
  const needsRefresh = mastery.needsRefresh;

  if (level === 'Новое') {
    return {
      status: 'new',
      label: 'Новое',
      symbol: '•',
      title: 'Новое слово (ещё не изучалось)',
      score: mastery.score,
    };
  }

  if (needsRefresh) {
    return {
      status: 'refresh',
      label: 'Повторить',
      symbol: '↻',
      title: 'Пора освежить (нужно повторить)',
      score: mastery.score,
    };
  }

  if (level === 'Освоено') {
    return {
      status: 'mastered',
      label: 'Освоено',
      symbol: '★',
      title: 'Освоено (отличное знание)',
      score: mastery.score,
    };
  }

  if (level === 'Уверенно') {
    return {
      status: 'confident',
      label: 'Уверенно',
      symbol: '✓',
      title: 'Уверенно (хорошее знание)',
      score: mastery.score,
    };
  }

  return {
    status: 'learning',
    label: 'Изучается',
    symbol: '⚡',
    title: 'Изучается (в процессе освоения)',
    score: mastery.score,
  };
}

export function getPartOfSpeechLabel(pos) {
  const mapping = {
    verb: 'Глагол',
    noun: 'Существительное',
    adjective: 'Прилагательное',
    adverb: 'Наречие',
    particle: 'Частица',
    expression: 'Выражение',
  };
  return mapping[pos] || pos || 'Неизвестно';
}

export function getVerbClassLabel(vc) {
  const mapping = {
    godan: '1-й класс (godan)',
    ichidan: '2-й класс (ichidan)',
    irregular: 'Неправильный',
  };
  return mapping[vc] || vc || 'Неизвестно';
}

export function getTopicLabel(topic) {
  const mapping = {
    food: 'Еда и напитки',
    people: 'Люди',
    places: 'Места',
    time: 'Время',
    study: 'Учёба',
    directions: 'Направления',
    objects: 'Предметы',
    family: 'Семья',
    nature: 'Природа',
    weather: 'Погода',
    colors: 'Цвета',
    body: 'Части тела',
    clothes: 'Одежда',
    actions: 'Действия',
    animals: 'Животные',
    transport: 'Транспорт',
    buildings: 'Здания',
    jobs: 'Профессии',
    health: 'Здоровье',
    hobby: 'Хобби',
    sports: 'Спорт',
    music: 'Музыка',
    technology: 'Технологии',
    money: 'Деньги',
    shopping: 'Покупки',
    travel: 'Путешествия',
    culture: 'Культура',
    home: 'Дом',
    school: 'Школа',
    work: 'Работа',
    entertainment: 'Развлечения',
    feelings: 'Чувства',
    society: 'Общество',
    politics: 'Политика',
    science: 'Наука',
    religion: 'Религия',
    history: 'История',
    geography: 'География',
    math: 'Математика',
    literature: 'Литература',
    art: 'Искусство',
    daily: 'Повседневность',
  };

  if (!topic) return '';
  const lowerTopic = topic.toLowerCase().trim();
  if (mapping[lowerTopic]) return mapping[lowerTopic];
  return lowerTopic.charAt(0).toUpperCase() + lowerTopic.slice(1);
}

export function getLessonsLabel(lessonIds) {
  if (!lessonIds || lessonIds.length === 0) return 'Вне уроков';
  return lessonIds.length > 1 ? `Уроки ${lessonIds.join(', ')}` : `Урок ${lessonIds[0]}`;
}

export function renderSkillRow(skillKey, skillLabel, mastery, appSkills) {
  const isApplicable = appSkills.includes(skillKey);
  if (!isApplicable) {
    const isProduction = skillKey === 'context-production';
    const notRequiredLabel = isProduction
      ? 'Не проверен (Освоено ограничено до «Уверенно»)'
      : 'Не требуется';
    return `
      <div class="dict-skill-row skill-disabled">
        <div class="dict-skill-header">
          <span class="dict-skill-name">${skillLabel}</span>
          <span class="dict-skill-status-badge badge-not-required" title="${isProduction ? 'Для данного слова нет контекстных production-заданий' : ''}">${notRequiredLabel}</span>
        </div>
      </div>
    `;
  }

  const metric = mastery.skillMetrics?.[skillKey];
  const hasStarted = metric && metric.card && metric.card.reps > 0;

  if (!hasStarted) {
    return `
      <div class="dict-skill-row skill-inactive">
        <div class="dict-skill-header">
          <span class="dict-skill-name">${skillLabel}</span>
          <span class="dict-skill-status-badge badge-queued">В очереди</span>
        </div>
      </div>
    `;
  }

  const accuracyPercent = Math.round((metric.accuracy || 0) * 100);
  const stabilityDays = Math.round(metric.stability || 0);
  const retrievabilityPercent = Math.round((metric.retrievability || 0) * 100);

  return `
    <div class="dict-skill-row skill-active">
      <div class="dict-skill-header">
        <span class="dict-skill-name">${skillLabel}</span>
        <span class="dict-skill-status-badge badge-active">Активно</span>
      </div>
      <div class="dict-skill-metrics-grid">
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Точность:</span>
          <span class="dict-metric-value">${accuracyPercent}%</span>
        </div>
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Стабильность:</span>
          <span class="dict-metric-value">${stabilityDays} дн.</span>
        </div>
        <div class="dict-skill-metric-item">
          <span class="dict-metric-label">Память:</span>
          <span class="dict-metric-value">${retrievabilityPercent}%</span>
        </div>
      </div>
    </div>
  `;
}

export function renderDictionaryLessons(
  state,
  dependencies,
  arg3 = dictionaryViewState,
  filterQuery = 'all',
  topicQuery = 'all',
  adjectiveClassQuery = 'all'
) {
  let viewState = dictionaryViewState;
  if (typeof arg3 === 'object' && arg3 !== null) {
    viewState = arg3;
  } else if (typeof arg3 === 'string') {
    viewState = {
      search: arg3,
      partOfSpeech: filterQuery,
      topic: topicQuery,
      adjectiveClass: adjectiveClassQuery,
      expandedLessons: dictionaryViewState.expandedLessons || new Set(),
    };
  }

  const { search = '', partOfSpeech = 'all', topic = 'all', adjectiveClass = 'all' } = viewState;

  const { LESSONS, toast } = dependencies;

  const container = $('#dict-lessons-container');
  if (!container) return;

  const query = String(search || '')
    .toLowerCase()
    .trim();
  const activeLessonId = state.activeChapterId || 1;

  let totalMastery = 0;
  let totalWordsCount = 0;
  const processedLexemes = new Set();

  LESSONS.forEach((lesson) => {
    const words = lesson.words || [];
    words.forEach((word) => {
      if (!word.lexemeId || processedLexemes.has(word.lexemeId)) return;
      processedLexemes.add(word.lexemeId);

      totalWordsCount++;
      const isUnlocked = isWordUnlocked(word.id, state.chapters);
      if (isUnlocked) {
        const itemCards = cardsForItem(state.srs, word.id);
        const mastery = calculateMastery({
          itemId: word.id,
          cards: itemCards,
          events: state.reviewEvents || [],
          archive: state.masteryArchive?.[word.id],
          applicableSkills: vocabularySkills(word, {
            unlockedKanjiLesson: getUnlockedKanjiLesson(state),
          }),
          getRetrievability: (card, now) => SRS.getRetrievability(card, now),
        });
        totalMastery += mastery.score;
      }
    });
  });

  const overallProgress = totalWordsCount > 0 ? Math.round(totalMastery / totalWordsCount) : 0;
  const overallFill = $('#dict-overall-fill');
  const overallPercent = $('#dict-overall-percent');
  if (overallFill && overallPercent) {
    overallFill.style.width = `${overallProgress}%`;
    overallPercent.textContent = `${overallProgress}%`;
  }

  let totalVisible = 0;

  container.innerHTML = LESSONS.map((lesson) => {
    const words = lesson.words || [];
    const isLessonUnlocked = state.chapters?.[lesson.id]?.started === true || lesson.id === 1;

    const filteredWords = words.filter((word) => {
      const topicLabel = word.topic ? getTopicLabel(word.topic).toLowerCase() : '';
      const topicCode = word.topic ? word.topic.toLowerCase() : '';
      const matchesSearch =
        !query ||
        (word.writtenForm && word.writtenForm.toLowerCase().includes(query)) ||
        (word.reading && word.reading.toLowerCase().includes(query)) ||
        (word.meaning && word.meaning.toLowerCase().includes(query)) ||
        (word.kanji && word.kanji.toLowerCase().includes(query)) ||
        (word.writing && word.writing.toLowerCase().includes(query)) ||
        (word.romaji && word.romaji.toLowerCase().includes(query)) ||
        (word.translation && word.translation.toLowerCase().includes(query)) ||
        topicCode.includes(query) ||
        topicLabel.includes(query);

      let matchesFilter = true;
      if (partOfSpeech === 'verb') {
        matchesFilter = word.partOfSpeech === 'verb';
      } else if (partOfSpeech === 'noun') {
        matchesFilter = word.partOfSpeech === 'noun';
      } else if (partOfSpeech === 'adjective') {
        matchesFilter = word.partOfSpeech === 'adjective';
      } else if (partOfSpeech === 'other') {
        matchesFilter = !['verb', 'noun', 'adjective'].includes(word.partOfSpeech);
      }

      let matchesAdjectiveClass = true;
      if (partOfSpeech === 'adjective' && adjectiveClass !== 'all') {
        matchesAdjectiveClass = word.adjectiveClass === adjectiveClass;
      }

      let matchesTopic = true;
      if (topic !== 'all') {
        matchesTopic = word.topic === topic;
      }

      return matchesSearch && matchesFilter && matchesAdjectiveClass && matchesTopic;
    });

    if (filteredWords.length === 0 && (query || partOfSpeech !== 'all' || topic !== 'all')) {
      return '';
    }

    totalVisible += filteredWords.length;

    if (!isLessonUnlocked) {
      return `
        <div class="dict-lesson is-locked" data-lesson-id="${lesson.id}">
          <div class="dict-lesson-header" role="button" tabindex="0" aria-label="Урок ${lesson.id}: ${lesson.title}. Закрыто">
            <span class="dict-lesson-toggle-icon">🔒</span>
            <h3 class="dict-lesson-title">Урок ${lesson.id}: ${lesson.title}</h3>
            <span class="dict-lesson-count">${words.length} слов</span>
          </div>
        </div>
      `;
    }

    const wordsHtml = filteredWords
      .map((word) => {
        const isUnlocked = isWordUnlocked(word.id, state.chapters);
        const chapterId = cardChapter(word.id);
        const status = getWordStatus(word, state);

        const safeWrittenForm = displayWordForm(word, state);
        const reading = word.reading || word.writing;
        const hasSeparateReading = safeWrittenForm && safeWrittenForm !== reading;
        const readingHtml = hasSeparateReading
          ? `<div class="dict-word-reading">${reading}</div>`
          : '';

        const displayKanji = isUnlocked ? safeWrittenForm : '???';
        const displayReadingHtml = isUnlocked ? readingHtml : '・・・';
        const displayTranslation = isUnlocked ? word.translation : `Откроется в Главе ${chapterId}`;

        const lessonIds = word.lessonIds || [lesson.id];
        const lessonsBadge =
          isUnlocked && lessonIds.length > 1
            ? `<span class="dict-word-lessons-badge">Уроки ${lessonIds.join(', ')}</span>`
            : '';

        return `
          <div class="dict-word-card ${!isUnlocked ? 'word-locked' : ''}" data-word-id="${word.id}" data-chapter-id="${chapterId}" data-lexeme-id="${word.lexemeId || ''}">
            <div class="dict-word-main">
              <div class="dict-word-kanji">${displayKanji}</div>
              <div class="dict-word-info">
                ${displayReadingHtml}
                <div class="dict-word-translation">${displayTranslation} ${lessonsBadge}</div>
              </div>
            </div>
            <div class="dict-word-status">
              <span class="dict-status-indicator status-${status.status}" tabindex="0" title="${status.title}" aria-label="${status.title}">
                <span class="dict-status-icon">${status.symbol}</span>
              </span>
            </div>
          </div>
        `;
      })
      .join('');

    const isExpanded =
      query || filterQuery !== 'all' ? filteredWords.length > 0 : lesson.id === activeLessonId;

    return `
      <div class="dict-lesson is-unlocked ${isExpanded ? 'is-expanded' : 'is-collapsed'}" data-lesson-id="${lesson.id}">
        <div class="dict-lesson-header" role="button" tabindex="0" aria-label="Урок ${lesson.id}: ${lesson.title}. Нажмите для раскрытия">
          <span class="dict-lesson-toggle-icon">${isExpanded ? '▼' : '▶'}</span>
          <h3 class="dict-lesson-title">Урок ${lesson.id}: ${lesson.title}</h3>
          <span class="dict-lesson-count">${filteredWords.length} слов</span>
        </div>
        <div class="dict-words-list">
          ${wordsHtml}
        </div>
      </div>
    `;
  }).join('');

  if ((query || partOfSpeech !== 'all' || topic !== 'all') && totalVisible === 0) {
    container.innerHTML = emptyState(
      '🔍',
      'Ничего не найдено',
      `По запросу "${search || query}" слова не найдены.`
    );
    return;
  }

  $$('.dict-lesson-header').forEach((header) => {
    header.onclick = () => {
      const lessonEl = header.closest('.dict-lesson');
      const lessonId = Number(lessonEl.dataset.lessonId);
      if (lessonEl.classList.contains('is-locked')) {
        toast(`🔒 Начните Главу ${lessonId}, чтобы разблокировать этот урок`);
        return;
      }
      const isExpanded = lessonEl.classList.contains('is-expanded');
      if (isExpanded) {
        lessonEl.classList.remove('is-expanded');
        lessonEl.classList.add('is-collapsed');
        const icon = lessonEl.querySelector('.dict-lesson-toggle-icon');
        if (icon) icon.textContent = '▶';
      } else {
        lessonEl.classList.remove('is-collapsed');
        lessonEl.classList.add('is-expanded');
        const icon = lessonEl.querySelector('.dict-lesson-toggle-icon');
        if (icon) icon.textContent = '▼';
      }
    };
    header.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    };
  });

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

  $$('.dict-word-card').forEach((card) => {
    const lexemeId = card.dataset.lexemeId;
    if (lexemeId) {
      card.onmouseenter = () => {
        $$(`.dict-word-card[data-lexeme-id="${lexemeId}"]`).forEach((c) => {
          c.classList.add('lexeme-highlight');
        });
      };
      card.onmouseleave = () => {
        $$(`.dict-word-card[data-lexeme-id="${lexemeId}"]`).forEach((c) => {
          c.classList.remove('lexeme-highlight');
        });
      };
    }
  });
}

export async function renderDictionary(state, dependencies, options = {}, context = {}) {
  const { CONTENT_INDEX, ensureLesson } = dependencies;

  const content = $('#srs-body');
  if (!content) return;

  ExamplesDB.registerCuratedParticleSentences(CURATED_PARTICLE_SENTENCES);
  ExamplesDB.rebuildIndex();
  if (CONTENT_INDEX && ensureLesson) {
    await Promise.all(CONTENT_INDEX.map((ch) => ensureLesson(ch.id).catch(() => null)));
  }

  if (context?.signal?.aborted) return;

  const presentTopics = new Set();
  if (dependencies.LESSONS) {
    dependencies.LESSONS.forEach((l) => {
      if (l.words) {
        l.words.forEach((w) => {
          if (w.topic) presentTopics.add(w.topic);
        });
      }
    });
  }

  const topicOptionsHtml = Array.from(presentTopics)
    .sort()
    .map(
      (t) =>
        `<option value="${t}" ${dictionaryViewState.topic === t ? 'selected' : ''}>${getTopicLabel(t)}</option>`
    )
    .join('');

  const isAdjActive = dictionaryViewState.partOfSpeech === 'adjective';

  content.innerHTML = `
    <div class="dict-header-container">
      <div class="dict-search-wrap">
        <input 
          type="search" 
          id="dict-search" 
          class="dict-search-input" 
          placeholder="🔍 Поиск слов..."
          autocomplete="off"
          value="${escapeHtml(dictionaryViewState.search || '')}"
        />
      </div>
      <div class="dict-filters-wrap">
        <button class="dict-filter-btn ${dictionaryViewState.partOfSpeech === 'all' ? 'active' : ''}" data-filter="all">Все</button>
        <button class="dict-filter-btn ${dictionaryViewState.partOfSpeech === 'verb' ? 'active' : ''}" data-filter="verb">Глаголы</button>
        <button class="dict-filter-btn ${dictionaryViewState.partOfSpeech === 'noun' ? 'active' : ''}" data-filter="noun">Сущ.</button>
        <button class="dict-filter-btn ${dictionaryViewState.partOfSpeech === 'adjective' ? 'active' : ''}" data-filter="adjective">Прилаг.</button>
        <button class="dict-filter-btn ${dictionaryViewState.partOfSpeech === 'other' ? 'active' : ''}" data-filter="other">Ост.</button>
      </div>
      <div class="dict-adjective-subfilter" id="dict-adjective-subfilter" style="display: ${isAdjActive ? 'flex' : 'none'}; margin-top: 8px; gap: 6px;">
        <button class="dict-adj-class-btn ${dictionaryViewState.adjectiveClass === 'all' ? 'active' : ''}" data-adj-class="all">Все</button>
        <button class="dict-adj-class-btn ${dictionaryViewState.adjectiveClass === 'i' ? 'active' : ''}" data-adj-class="i">い-прилаг.</button>
        <button class="dict-adj-class-btn ${dictionaryViewState.adjectiveClass === 'na' ? 'active' : ''}" data-adj-class="na">な-прилаг.</button>
      </div>
      ${
        presentTopics.size > 0
          ? `
      <div class="dict-topic-filter-wrap" style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <label for="dict-topic-select" style="font-size: 14px; font-weight: 600; color: var(--text-muted);">Тема:</label>
        <select id="dict-topic-select" style="padding: 6px 12px; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border); color: var(--text); font-family: inherit; font-size: 14px; outline: none; flex: 1;">
          <option value="all">Все темы</option>
          ${topicOptionsHtml}
        </select>
      </div>`
          : ''
      }
      <div class="dict-overall-mastery">
        <div class="dict-overall-label">Общий прогресс словаря: <span id="dict-overall-percent">0%</span></div>
        <div class="dict-overall-bar">
          <div class="dict-overall-fill" id="dict-overall-fill" style="width: 0%"></div>
        </div>
      </div>
    </div>
    <div id="dict-lessons-container"></div>
  `;

  renderDictionaryLessons(state, dependencies, dictionaryViewState);

  const searchInput = $('#dict-search');
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        dictionaryViewState.search = e.target.value;
        renderDictionaryLessons(state, dependencies, dictionaryViewState);
      }, 300);
    });
  }

  $$('.dict-filter-btn').forEach((btn) => {
    btn.onclick = () => {
      $$('.dict-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      dictionaryViewState.partOfSpeech = btn.dataset.filter;

      const adjSubfilter = $('#dict-adjective-subfilter');
      if (adjSubfilter) {
        if (dictionaryViewState.partOfSpeech === 'adjective') {
          adjSubfilter.style.display = 'flex';
        } else {
          adjSubfilter.style.display = 'none';
          dictionaryViewState.adjectiveClass = 'all';
        }
      }

      renderDictionaryLessons(state, dependencies, dictionaryViewState);
    };
  });

  $$('.dict-adj-class-btn').forEach((btn) => {
    btn.onclick = () => {
      $$('.dict-adj-class-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      dictionaryViewState.adjectiveClass = btn.dataset.adjClass;
      renderDictionaryLessons(state, dependencies, dictionaryViewState);
    };
  });

  const topicSelect = $('#dict-topic-select');
  if (topicSelect) {
    topicSelect.onchange = (e) => {
      dictionaryViewState.topic = e.target.value;
      renderDictionaryLessons(state, dependencies, dictionaryViewState);
    };
  }
}

import { $, $$, escapeHtml } from '../../src/utils.js';
import { setSafeHTML } from '../../src/security-helpers.js';
import { isWordUnlocked, cardChapter, wordById } from '../../src/srs-helpers.js';
import { cardsForItem, vocabularySkills } from '../../src/knowledge-model.js';
import { calculateMastery } from '../../src/mastery.js';
import { SRS } from '../../srs.js';
import { openDictionaryModal } from './dictionary-modal.js';
import { displayWordForm, getUnlockedKanjiLesson } from '../../src/course-orthography.js';
import {
  getPartOfSpeechLabel,
  getVerbClassLabel,
  getTopicLabel,
  getLessonsLabel,
  renderSkillRow,
} from './dictionary-helpers.js';
import { ensureDictionaryCatalog } from '../../src/dictionary/dictionary-catalog-loader.js';

export { getPartOfSpeechLabel, getVerbClassLabel, getTopicLabel, getLessonsLabel, renderSkillRow };

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

export function renderDictionaryError(error) {
  const container = $('#dict-lessons-container');
  if (!container) return;
  setSafeHTML(
    container,
    `
    <div class="empty-state dict-error-state" style="padding: 32px 16px; text-align: center;">
      <div class="empty-state-icon" style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
      <h3 class="empty-state-title" style="margin-bottom: 8px;">Ошибка загрузки словаря</h3>
      <p class="empty-state-desc" style="color: var(--text-muted, #888); font-size: 14px;">
        ${escapeHtml(error?.message || 'Не удалось загрузить данные словаря')}
      </p>
    </div>
  `
  );
}

export function getWordStatus(word, state) {
  const isUnlocked = isWordUnlocked(word, state.chapters);
  const chapterId = cardChapter(word);
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

export function renderDictionaryLessons(
  state,
  dependencies,
  arg3 = dictionaryViewState,
  filterQuery = 'all',
  topicQuery = 'all',
  adjectiveClassQuery = 'all',
  dictionaryLessons = null
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

  const { LESSONS, toast, ensureLesson } = dependencies;
  const lessonsToRender = dictionaryLessons || dependencies.dictionaryLessons || LESSONS || [];

  const container = $('#dict-lessons-container');
  if (!container) return;

  const query = String(search || '')
    .toLowerCase()
    .trim();
  const activeLessonId = state.activeChapterId || 1;

  let totalMastery = 0;
  let totalWordsCount = 0;
  const processedLexemes = new Set();

  lessonsToRender.forEach((lesson) => {
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

  setSafeHTML(
    container,
    lessonsToRender
      .map((lesson) => {
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

        const safeLessonTitle = escapeHtml(String(lesson.title || `Урок ${lesson.id}`));
        const safeLessonId = escapeHtml(String(lesson.id));

        if (!isLessonUnlocked) {
          return `
          <div class="dict-lesson is-locked" data-lesson-id="${safeLessonId}">
            <div class="dict-lesson-header" role="button" tabindex="0" aria-label="Урок ${safeLessonId}: ${safeLessonTitle}. Закрыто">
              <span class="dict-lesson-toggle-icon">🔒</span>
              <h3 class="dict-lesson-title">Урок ${safeLessonId}: ${safeLessonTitle}</h3>
              <span class="dict-lesson-count">${words.length} слов</span>
            </div>
          </div>
        `;
        }

        const wordsHtml = filteredWords
          .map((word) => {
            const isUnlocked = isWordUnlocked(word, state.chapters);
            const chapterId = cardChapter(word);
            const status = getWordStatus(word, state);

            const safeWrittenForm = displayWordForm(word, state);
            const reading = word.reading || word.writing || '';
            const hasSeparateReading = safeWrittenForm && safeWrittenForm !== reading;
            const readingHtml = hasSeparateReading
              ? `<div class="dict-word-reading">${escapeHtml(reading)}</div>`
              : '';

            const displayKanji = isUnlocked ? safeWrittenForm : '???';
            const displayReadingHtml = isUnlocked ? readingHtml : '・・・';
            const displayTranslation = isUnlocked
              ? word.translation || word.meaning || ''
              : `Откроется в Главе ${chapterId}`;

            const lessonIds = word.lessonIds || [lesson.id];
            const lessonsBadge =
              isUnlocked && lessonIds.length > 1
                ? `<span class="dict-word-lessons-badge">Уроки ${escapeHtml(lessonIds.join(', '))}</span>`
                : '';

            const safeWordId = escapeHtml(String(word.id || ''));
            const safeChapterId = escapeHtml(String(chapterId || ''));
            const safeLexemeId = escapeHtml(String(word.lexemeId || ''));

            return `
            <div class="dict-word-card ${!isUnlocked ? 'word-locked' : ''}" data-word-id="${safeWordId}" data-chapter-id="${safeChapterId}" data-lexeme-id="${safeLexemeId}">
              <div class="dict-word-main">
                <div class="dict-word-kanji">${escapeHtml(displayKanji)}</div>
                <div class="dict-word-info">
                  ${displayReadingHtml}
                  <div class="dict-word-translation">${escapeHtml(displayTranslation)} ${lessonsBadge}</div>
                </div>
              </div>
              <div class="dict-word-status">
                <span class="dict-status-indicator status-${escapeHtml(status.status)}" tabindex="0" title="${escapeHtml(status.title)}" aria-label="${escapeHtml(status.title)}">
                  <span class="dict-status-icon">${escapeHtml(status.symbol)}</span>
                </span>
              </div>
            </div>
          `;
          })
          .join('');

        const hasActiveFilters =
          Boolean(query) || partOfSpeech !== 'all' || topic !== 'all' || adjectiveClass !== 'all';
        const isExpanded =
          dictionaryViewState.expandedLessons?.has(lesson.id) ||
          (hasActiveFilters ? filteredWords.length > 0 : lesson.id === activeLessonId);

        return `
        <div class="dict-lesson is-unlocked ${isExpanded ? 'is-expanded' : 'is-collapsed'}" data-lesson-id="${safeLessonId}">
          <div class="dict-lesson-header" role="button" tabindex="0" aria-label="Урок ${safeLessonId}: ${safeLessonTitle}. Нажмите для раскрытия">
            <span class="dict-lesson-toggle-icon">${isExpanded ? '▼' : '▶'}</span>
            <h3 class="dict-lesson-title">Урок ${safeLessonId}: ${safeLessonTitle}</h3>
            <span class="dict-lesson-count">${filteredWords.length} слов</span>
          </div>
          <div class="dict-words-list">
            ${wordsHtml}
          </div>
        </div>
      `;
      })
      .join('')
  );

  if (
    (Boolean(query) || partOfSpeech !== 'all' || topic !== 'all' || adjectiveClass !== 'all') &&
    totalVisible === 0
  ) {
    setSafeHTML(
      container,
      emptyState('🔍', 'Ничего не найдено', `По запросу "${search || query}" слова не найдены.`)
    );
    return;
  }

  $$('.dict-lesson-header').forEach((header) => {
    header.onclick = () => {
      const lessonEl = header.closest('.dict-lesson');
      const lessonId = lessonEl.dataset.lessonId;
      if (lessonEl.classList.contains('is-locked')) {
        toast(`🔒 Начните Главу ${lessonId}, чтобы разблокировать этот урок`);
        return;
      }

      const isExpanded = lessonEl.classList.contains('is-expanded');
      if (isExpanded) {
        lessonEl.classList.remove('is-expanded');
        lessonEl.classList.add('is-collapsed');
        dictionaryViewState.expandedLessons?.delete(lessonId);
        const icon = lessonEl.querySelector('.dict-lesson-toggle-icon');
        if (icon) icon.textContent = '▶';
      } else {
        lessonEl.classList.remove('is-collapsed');
        lessonEl.classList.add('is-expanded');
        dictionaryViewState.expandedLessons?.add(lessonId);
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
    card.onclick = async () => {
      const wordId = card.dataset.wordId;

      if (card.classList.contains('word-locked')) {
        const chapterId = card.dataset.chapterId;
        toast(`🔒 Начните Главу ${chapterId}, чтобы разблокировать это слово`);
        return;
      }

      const word = wordById(wordId, lessonsToRender);
      if (word) {
        const lessonId = word.lessonId || word.introducedIn;
        if (lessonId && typeof ensureLesson === 'function') {
          card.classList.add('is-loading');
          try {
            const loadedLesson = await ensureLesson(lessonId);
            if (loadedLesson && $('#dict-lessons-container')) {
              // Re-evaluate catalog with runtime lesson override
              const activeCourse =
                dependencies.getActiveCourse?.() ||
                dependencies.activeCourse ||
                dependencies.course ||
                state?.activeCourse;
              const updatedResult = await ensureDictionaryCatalog({
                courseId: state?.activeCourseId || 'genki-1',
                activeCourse,
                contentIndex: dependencies.CONTENT_INDEX || [],
                loadedLessons: dependencies.LESSONS || [],
              });
              if ($('#dict-lessons-container')) {
                renderDictionaryLessons(
                  state,
                  dependencies,
                  dictionaryViewState,
                  'all',
                  'all',
                  'all',
                  updatedResult.lessons
                );
              }
            }
          } catch {
            // silent catch
          } finally {
            card.classList.remove('is-loading');
          }
        }
        const runtimeWord =
          wordById(wordId, dependencies.LESSONS) || wordById(wordId, lessonsToRender);
        openDictionaryModal(runtimeWord || word, state, dependencies);
      }
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
  const { CONTENT_INDEX } = dependencies;

  const content = $('#srs-body');
  if (!content) return;

  const isAdjActive = dictionaryViewState.partOfSpeech === 'adjective';

  setSafeHTML(
    content,
    `
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
      <div id="dict-topic-filter-container"></div>
      <div class="dict-overall-mastery">
        <div class="dict-overall-label">Общий прогресс словаря: <span id="dict-overall-percent">0%</span></div>
        <div class="dict-overall-bar">
          <div class="dict-overall-fill" id="dict-overall-fill" style="width: 0%"></div>
        </div>
      </div>
    </div>
    <div id="dict-lessons-container">
      <div class="dictionary-skeleton" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <div class="skeleton-bar" style="height: 24px; width: 60%; background: var(--border, #e0e0e0); border-radius: 6px; opacity: 0.6;"></div>
        <div class="skeleton-bar" style="height: 16px; width: 40%; background: var(--border, #e0e0e0); border-radius: 6px; opacity: 0.4;"></div>
        <div class="skeleton-bar" style="height: 48px; width: 100%; background: var(--border, #e0e0e0); border-radius: 8px; opacity: 0.3;"></div>
      </div>
    </div>
  `
  );

  let catalogResult = null;
  try {
    const activeCourse =
      dependencies.getActiveCourse?.() ||
      dependencies.activeCourse ||
      dependencies.course ||
      state?.activeCourse;
    catalogResult = await ensureDictionaryCatalog({
      courseId: state?.activeCourseId || 'genki-1',
      activeCourse,
      contentIndex: CONTENT_INDEX || [],
      loadedLessons: dependencies.LESSONS || [],
      signal: context?.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') return;
    renderDictionaryError(error);
    return;
  }

  if (context?.signal?.aborted) return;

  const catalogLessons = catalogResult?.lessons || dependencies.LESSONS || [];

  // Build topics dynamically from catalogResult.lessons
  const presentTopics = new Set();
  catalogLessons.forEach((l) => {
    (l.words || []).forEach((w) => {
      if (w.topic) presentTopics.add(w.topic);
    });
  });

  if (dictionaryViewState.topic !== 'all' && !presentTopics.has(dictionaryViewState.topic)) {
    dictionaryViewState.topic = 'all';
  }

  const topicContainer = $('#dict-topic-filter-container');
  if (topicContainer) {
    if (presentTopics.size > 0) {
      const topicOptionsHtml = Array.from(presentTopics)
        .sort()
        .map(
          (t) =>
            `<option value="${escapeHtml(t)}" ${dictionaryViewState.topic === t ? 'selected' : ''}>${escapeHtml(getTopicLabel(t))}</option>`
        )
        .join('');

      setSafeHTML(
        topicContainer,
        `
        <div class="dict-topic-filter-wrap" style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <label for="dict-topic-select" style="font-size: 14px; font-weight: 600; color: var(--text-muted);">Тема:</label>
          <select id="dict-topic-select" style="padding: 6px 12px; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border); color: var(--text); font-family: inherit; font-size: 14px; outline: none; flex: 1;">
            <option value="all">Все темы</option>
            ${topicOptionsHtml}
          </select>
        </div>
      `
      );

      const topicSelect = $('#dict-topic-select');
      if (topicSelect) {
        topicSelect.onchange = (e) => {
          dictionaryViewState.topic = e.target.value;
          renderDictionaryLessons(
            state,
            dependencies,
            dictionaryViewState,
            'all',
            'all',
            'all',
            catalogLessons
          );
        };
      }
    } else {
      topicContainer.innerHTML = '';
    }
  }

  renderDictionaryLessons(
    state,
    dependencies,
    dictionaryViewState,
    'all',
    'all',
    'all',
    catalogLessons
  );

  const searchInput = $('#dict-search');
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        dictionaryViewState.search = e.target.value;
        renderDictionaryLessons(
          state,
          dependencies,
          dictionaryViewState,
          'all',
          'all',
          'all',
          catalogLessons
        );
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

      renderDictionaryLessons(
        state,
        dependencies,
        dictionaryViewState,
        'all',
        'all',
        'all',
        catalogLessons
      );
    };
  });

  $$('.dict-adj-class-btn').forEach((btn) => {
    btn.onclick = () => {
      $$('.dict-adj-class-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      dictionaryViewState.adjectiveClass = btn.dataset.adjClass;
      renderDictionaryLessons(
        state,
        dependencies,
        dictionaryViewState,
        'all',
        'all',
        'all',
        catalogLessons
      );
    };
  });
}

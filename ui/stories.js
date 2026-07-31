// ui/stories.js - Модуль интерактивных историй

import { $, $$ } from '../src/utils.js';
import { CONTENT_INDEX } from './home.js';
import { loadChapterData } from '../src/content-loader.js';
import { formatLessonLabel, sameLessonId } from '../src/courses/course-context.js';

// Локальный контекст зависимостей
let deps = null;

// Глобальные переменные для квиза
let currentQuestionIndex = 0;
let attemptsCount = 0;

// Функция рендеринга списка историй
export function renderStories(state, dependencies) {
  if (dependencies) deps = dependencies;
  const { chState } = deps;
  const $$ = deps?.$$ || window.$$ || ((s) => Array.from(document.querySelectorAll(s)));
  const toast = deps?.toast || window.toast || (() => {});
  const nav = deps?.nav || window.nav || (() => {});
  const markActivity = deps?.markActivity || window.markActivity || ((toastFn) => {});
  const emptyState = (icon, title, desc) =>
    `<div class="empty"><div class="em">${icon}</div><h3>${title}</h3><p>${desc}</p></div>`;

  // Привязка вкладок библиотеки (Грамматика / Заметки / Истории)
  $$('.lib-tab[data-libtab]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.libtab === 'stories');
    tab.onclick = () => {
      $$('.lib-tab[data-libtab]').forEach((t) => t.classList.toggle('active', t === tab));
      if (tab.dataset.libtab === 'notes') {
        renderLibraryNotes(state, dependencies);
      } else if (tab.dataset.libtab === 'grammar') {
        renderLibraryGrammar(state, dependencies);
      } else {
        renderStories(state, dependencies);
      }
    };
  });

  const body = $('#library-body');

  // Список историй строится из лёгкого content-index (без полного контента)
  const stories = CONTENT_INDEX.filter((ch) => ch.storyMeta).map((ch) => ({
    id: ch.storyMeta.storyId,
    lesson_id: ch.id,
    title: ch.storyMeta.title,
    cover_url: ch.storyMeta.cover_url,
  }));

  if (stories.length === 0) {
    body.innerHTML = emptyState(
      '📖',
      'Историй пока нет',
      'Скоро здесь появятся интересные истории!'
    );
    return;
  }

  body.innerHTML = stories
    .map((story) => {
      const isUnlocked = chState(story.lesson_id).started;
      const lockedClass = isUnlocked ? '' : 'story-locked';

      return `
      <div class="story-card ${lockedClass}" data-story-id="${story.id}" data-testid="story-${story.id}">
        <div class="story-cover-wrap">
          <img src="${story.cover_url}" alt="${story.title}" class="story-cover" loading="lazy" />
          ${!isUnlocked ? '<div class="story-lock-overlay"><span class="story-lock-icon">🔒</span></div>' : ''}
        </div>
        <div class="story-info">
          <h3 class="story-title">${story.title}</h3>
          <p class="story-lesson">${formatLessonLabel(story.lesson_id)}</p>
        </div>
      </div>
    `;
    })
    .join('');

  $$('.story-card').forEach((card) => {
    card.onclick = async () => {
      const storyId = card.dataset.storyId;
      const storyMeta = stories.find((s) => String(s.id) === storyId);
      if (!storyMeta) return;

      const isUnlocked = chState(storyMeta.lesson_id).started;

      if (!isUnlocked) {
        toast(`🔒 Пройдите «${formatLessonLabel(storyMeta.lesson_id)}», чтобы открыть эту историю`);
        return;
      }

      // Полный контент истории подгружаем только при открытии
      try {
        const { story } = await loadChapterData(storyMeta.lesson_id);
        if (!story) throw new Error('story chunk missing');
        openStory(story, state, dependencies);
      } catch (e) {
        console.error('Не удалось загрузить историю:', e);
        toast('⚠️ Не удалось загрузить историю');
      }
    };
  });
}

// Локальный экранировщик HTML для пользовательского контента
function escapeHtmlLocal(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const expandedNoteIds = new Set();

function isLongNote(content) {
  if (!content) return false;
  if (content.length > 500) return true;
  const lines = content.split('\n').length;
  return lines > 8;
}

// Вкладка «Заметки» — сохранённые ответы Сенсея
export function renderLibraryNotes(state, dependencies) {
  const { save } = deps || dependencies;
  const body = $('#library-body');
  if (!body) return;

  const notes = state.savedNotes || [];
  if (notes.length === 0) {
    body.innerHTML = `<div class="empty"><div class="em">📝</div><h3>Заметок пока нет</h3><p>Сохраняйте ответы Сенсея кнопкой «＋ Сохранить в учебник».</p></div>`;
    return;
  }

  body.innerHTML = notes
    .map((n) => {
      const isLong = isLongNote(n.content);
      const isExpanded = expandedNoteIds.has(n.id);
      const contentClass = isLong
        ? isExpanded
          ? 'note-content note-content-expanded'
          : 'note-content note-content-collapsed'
        : 'note-content note-content-expanded';

      const toggleBtn = isLong
        ? `<button type="button" class="btn-ghost note-toggle" aria-expanded="${isExpanded}" aria-controls="note-content-${escapeHtmlLocal(n.id)}">${isExpanded ? 'Свернуть' : 'Развернуть'}</button>`
        : '';

      return `
      <article class="note-card" data-note-id="${escapeHtmlLocal(n.id)}">
        <header class="note-head">
          <h3 class="note-title">${escapeHtmlLocal(n.title)}</h3>
          <span class="note-date">${escapeHtmlLocal(n.date || '')}</span>
        </header>
        <div class="${contentClass}" id="note-content-${escapeHtmlLocal(n.id)}">${escapeHtmlLocal(n.content)}</div>
        <footer class="note-actions">
          ${toggleBtn}
          <button type="button" class="btn-ghost note-delete">Удалить</button>
        </footer>
      </article>`;
    })
    .join('');

  body.querySelectorAll('.note-toggle').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const card = btn.closest('.note-card');
      const id = card?.dataset.noteId;
      if (!id) return;
      if (expandedNoteIds.has(id)) {
        expandedNoteIds.delete(id);
      } else {
        expandedNoteIds.add(id);
      }
      renderLibraryNotes(state, dependencies);
    };
  });

  body.querySelectorAll('.note-delete').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const card = btn.closest('.note-card');
      const id = card?.dataset.noteId;
      if (!id) return;
      expandedNoteIds.delete(id);
      state.savedNotes = (state.savedNotes || []).filter((n) => n.id !== id);
      save();
      renderLibraryNotes(state, dependencies);
    };
  });
}

// Вкладка «Грамматика» — горизонтальные кнопки глав + карточки грамматики
async function renderLibraryGrammar(state, dependencies) {
  const { chState } = deps || dependencies;
  const body = $('#library-body');
  if (!body) return;

  if (!CONTENT_INDEX || CONTENT_INDEX.length === 0) {
    body.innerHTML = `<div class="empty"><div class="em">📚</div><h3>Уроки не загружены</h3></div>`;
    return;
  }

  // Определяем активную главу (первая разблокированная или первая)
  let activeChapterId = state.activeGrammarChapter || CONTENT_INDEX[0]?.id || null;
  const activeChapter = CONTENT_INDEX.find((ch) => sameLessonId(ch.id, activeChapterId));
  activeChapterId = activeChapter?.id || CONTENT_INDEX[0]?.id || null;
  const isUnlocked = activeChapter ? chState(activeChapter.id).started : false;

  // Генерируем кнопки глав
  const chaptersButtons = CONTENT_INDEX.map((ch) => {
    const unlocked = chState(ch.id).started;
    const isActive = sameLessonId(ch.id, activeChapterId);
    const lessonNumber = (ch.order ?? CONTENT_INDEX.indexOf(ch)) + 1;
    return `
      <button 
        class="grammar-chapter-btn ${isActive ? 'active' : ''} ${unlocked ? '' : 'locked'}" 
        data-chapter-id="${ch.id}"
        ${unlocked ? '' : 'disabled'}
      >
        ${unlocked ? `Ур.${lessonNumber}` : `Ур.${lessonNumber} 🔒`}
      </button>`;
  }).join('');

  // Генерируем заголовок главы
  const chapterTitle = (activeChapter?.title || formatLessonLabel(activeChapterId)).toUpperCase();

  // Показываем лоадер перед загрузкой
  body.innerHTML = `
    <div class="grammar-chapters-row">
      ${chaptersButtons}
    </div>
    <h2 class="grammar-chapter-title">${chapterTitle}</h2>
    <div class="loader-container">
      <div class="loader"></div>
    </div>
  `;

  // Генерируем карточки грамматики
  let grammarCards = '';
  if (!isUnlocked) {
    grammarCards = `
      <div class="grammar-empty">
        <div class="grammar-empty-icon">🔒</div>
        <p class="grammar-empty-text">Завершите «${formatLessonLabel(activeChapterId)}», чтобы открыть грамматику</p>
      </div>`;
  } else {
    try {
      // Загружаем полные данные урока
      const { lesson } = await loadChapterData(activeChapterId);
      const notes = lesson?.notes || [];

      if (notes.length > 0) {
        grammarCards = notes
          .map(
            (note) => `
          <div class="grammar-card">
            <h3 class="grammar-card-title">${escapeHtmlLocal(note.title)}</h3>
            <p class="grammar-card-content">${escapeHtmlLocal(note.content)}</p>
          </div>`
          )
          .join('');
      } else {
        grammarCards = `
          <div class="grammar-empty">
            <div class="grammar-empty-icon">📝</div>
            <p class="grammar-empty-text">В этой главе пока нет грамматических правил</p>
          </div>`;
      }
    } catch (error) {
      grammarCards = `
        <div class="grammar-empty">
          <div class="grammar-empty-icon">⚠️</div>
          <p class="grammar-empty-text">Ошибка загрузки грамматики</p>
        </div>`;
    }
  }

  // Обновляем контент с загруженной грамматикой
  body.innerHTML = `
    <div class="grammar-chapters-row">
      ${chaptersButtons}
    </div>
    <h2 class="grammar-chapter-title">${chapterTitle}</h2>
    ${grammarCards}
  `;

  // Навешиваем обработчики на кнопки глав
  body.querySelectorAll('.grammar-chapter-btn:not(.locked)').forEach((btn) => {
    btn.onclick = () => {
      state.activeGrammarChapter = btn.dataset.chapterId;
      renderLibraryGrammar(state, dependencies);
    };
  });
}

import { normalizeLegacyStoryToken } from '../src/dictionary/token-occurrence.js';
import { dictionaryStore } from '../src/dictionary/dictionary-store.js';

// Функция рендеринга интерактивной истории с токенами
function renderInteractiveStory(content) {
  if (!Array.isArray(content)) return '';

  return content
    .map((sentence, sIdx) => {
      const sentenceId = sentence.sentence_id || sIdx + 1;
      const tokensHtml = (sentence.tokens || [])
        .map((rawToken, idx) => {
          const occ = normalizeLegacyStoryToken(rawToken, {
            sentenceId,
            tokenIndex: idx,
            dictionaryStore,
          });

          if (occ.resolution.status === 'non-lexical' || rawToken.type === 'Punctuation') {
            return escapeHtmlLocal(occ.surface);
          }

          const surface = escapeHtmlLocal(occ.surface);
          const reading = escapeHtmlLocal(occ.reading);
          const dictionaryId = escapeHtmlLocal(occ.dictionaryId || '');
          const contextMeaning = escapeHtmlLocal(occ.contextMeaning || '');
          const status = escapeHtmlLocal(occ.resolution.status);
          const tokenId = escapeHtmlLocal(occ.id);
          const posType = escapeHtmlLocal(rawToken.type || 'Word');

          if (reading && reading !== surface) {
            return `<ruby><span class="word-token" 
                  data-token-id="${tokenId}"
                  data-dictionary-id="${dictionaryId}"
                  data-surface="${surface}"
                  data-reading="${reading}"
                  data-context-meaning="${contextMeaning}"
                  data-resolution-status="${status}"
                  data-kanji="${surface}"
                  data-writing="${reading}"
                  data-translation="${contextMeaning}"
                  data-type="${posType}">${surface}</span><rt>${reading}</rt></ruby>`;
          }

          return `<span class="word-token" 
                data-token-id="${tokenId}"
                data-dictionary-id="${dictionaryId}"
                data-surface="${surface}"
                data-reading="${reading}"
                data-context-meaning="${contextMeaning}"
                data-resolution-status="${status}"
                data-kanji="${surface}"
                data-translation="${contextMeaning}"
                data-type="${posType}">${surface}</span>`;
        })
        .join('');

      return `
      <div class="story-sentence">
        ${sentence.speaker ? `<strong class="speaker">${escapeHtmlLocal(sentence.speaker)}:</strong>` : ''}
        <p class="sentence-jp">${tokensHtml}</p>
        <button class="toggle-translation-btn">Показать перевод</button>
        <p class="sentence-translation hidden">${escapeHtmlLocal(sentence.translation)}</p>
      </div>
    `;
    })
    .join('');
}

// Функция открытия Bottom Sheet для перевода слова
export function openWordBottomSheet(tokenElement, customStore = null) {
  const sheet = $('#word-bottom-sheet');
  if (!sheet) return;

  const dataset = tokenElement.dataset || {};
  const surface = dataset.surface || dataset.kanji || '';
  const reading = dataset.reading || dataset.writing || surface;
  const contextMeaning = dataset.contextMeaning || dataset.translation || '';
  const dictionaryId = dataset.dictionaryId || null;

  const modalKanji = $('#modal-kanji');
  const modalReading = $('#modal-reading');
  const modalTranslation = $('#modal-translation');
  const modalType = $('#modal-type');

  let entry = null;
  const activeStore = customStore || dictionaryStore || window.dictionaryStore || null;
  if (dictionaryId && activeStore && typeof activeStore.getDictionaryEntry === 'function') {
    entry = activeStore.getDictionaryEntry(dictionaryId);
  }

  if (modalKanji) modalKanji.textContent = entry?.dictionaryForm || surface;
  if (modalReading) {
    const displayReading =
      reading !== surface ? reading : entry?.reading !== surface ? entry?.reading : '';
    modalReading.textContent = displayReading || '';
  }

  if (modalTranslation) {
    const globalMeanings = entry?.meanings ? entry.meanings.join(', ') : '';
    if (contextMeaning && globalMeanings && contextMeaning !== globalMeanings) {
      modalTranslation.textContent = `${contextMeaning} (Значения: ${globalMeanings})`;
    } else {
      modalTranslation.textContent =
        contextMeaning || globalMeanings || 'Слово не найдено в словаре';
    }
  }

  if (modalType) {
    const srcTag =
      entry?.source === 'ai' ? ' [AI]' : entry?.source === 'curated' ? ' [Словарь]' : '';
    modalType.textContent = (entry?.partOfSpeech || dataset.type || 'Слово') + srcTag;
  }

  sheet.classList.add('active');

  const backdrop = sheet.querySelector('.bottom-sheet-backdrop');
  if (backdrop) {
    backdrop.onclick = () => closeWordBottomSheet();
  }
}

// Функция закрытия Bottom Sheet
export function closeWordBottomSheet() {
  const sheet = $('#word-bottom-sheet');
  if (sheet) sheet.classList.remove('active');
}

// Функция установки обработчиков клика по токенам и переключения переводов
function setupStoryInteractions() {
  const buttons = $$('.toggle-translation-btn');
  buttons.forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const translation = btn.nextElementSibling;
      if (translation && translation.classList.contains('sentence-translation')) {
        const isHidden = translation.classList.toggle('hidden');
        btn.textContent = isHidden ? 'Показать перевод' : 'Скрыть перевод';
      }
    };
  });

  const tokens = $$('.word-token');
  tokens.forEach((tok) => {
    tok.onclick = (e) => {
      e.stopPropagation();
      openWordBottomSheet(tok);
    };
  });
}

// Функция открытия истории
function openStory(story, state, dependencies) {
  const storyTitle = $('#story-title');
  const storyTitleJp = $('#story-title-jp');

  if (storyTitle) storyTitle.textContent = story.title;
  if (storyTitleJp) storyTitleJp.textContent = story.titleJP || '';

  $('#story-body').innerHTML = `
  <div class="story-content">
    <div class="story-meta">
      <span class="story-lesson-badge">${formatLessonLabel(story.lessonId || story.lesson_id)}</span>
    </div>
    <div class="story-text">${renderInteractiveStory(story.content)}</div>
    ${
      story.questions && story.questions.length > 0
        ? `
      <div class="story-actions">
        <button id="btn-finish-story" class="btn-primary-large">
          📖 Завершить историю
        </button>
      </div>
    `
        : ''
    }
  </div>
  `;

  setupStoryInteractions();

  const finishBtn = document.getElementById('btn-finish-story');
  if (finishBtn) {
    finishBtn.onclick = () => {
      startStoryQuiz(story, state, dependencies);
    };
  }

  nav('story');
}

// Функция запуска квиза по истории
function startStoryQuiz(story, state, dependencies) {
  if (!story.questions || story.questions.length === 0) {
    story.questions = [
      {
        question: 'Вы внимательно прочитали историю?',
        options: ['Да, всё понятно!', 'Нет, хочу перечитать'],
        correctAnswer: 0,
      },
    ];
  }

  currentQuestionIndex = 0;
  attemptsCount = 0;

  function renderQuestion(index) {
    const q = story.questions[index];
    const storyBody = $('#story-body');

    storyBody.innerHTML = `
      <div class="quiz-container">
        <div class="quiz-header">
          <button class="btn-ghost" id="quiz-back-btn">← Назад к истории</button>
          <div class="quiz-progress">Вопрос ${index + 1} из ${story.questions.length}</div>
        </div>
        <h2 class="quiz-question">${q.question}</h2>
        <div class="quiz-options" id="quiz-options">
          ${q.options
            .map((opt, i) => `<button class="quiz-option-btn" data-index="${i}">${opt}</button>`)
            .join('')}
        </div>
      </div>
    `;

    const backBtn = $('#quiz-back-btn');
    if (backBtn) {
      backBtn.onclick = () => {
        openStory(story, state, dependencies);
      };
    }

    document.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.onclick = () => {
        const selectedIndex = parseInt(btn.dataset.index, 10);
        checkAnswer(selectedIndex, q.correctAnswer, btn);
      };
    });
  }

  function checkAnswer(selectedIndex, correctIndex, buttonElement) {
    const allButtons = document.querySelectorAll('.quiz-option-btn');

    allButtons.forEach((b) => (b.disabled = true));

    if (selectedIndex === correctIndex) {
      buttonElement.classList.add('correct');

      setTimeout(() => {
        currentQuestionIndex++;
        attemptsCount = 0;

        if (currentQuestionIndex < story.questions.length) {
          renderQuestion(currentQuestionIndex);
        } else {
          completeStory(story, state, dependencies);
        }
      }, 1000);
    } else {
      buttonElement.classList.add('incorrect');
      attemptsCount++;

      setTimeout(() => {
        currentQuestionIndex = 0;
        toast('❌ Попробуйте снова с начала');
        renderQuestion(0);
      }, 1500);
    }
  }

  renderQuestion(0);
}

// Функция завершения истории
function completeStory(story, state, dependencies) {
  const { save, showCompletionScreen, XP_PER_LEVEL, COINS_PER_LEVEL, refreshStreakDisplay } =
    dependencies;

  if (!state.completedStories) state.completedStories = [];

  const isFirstCompletion = !state.completedStories.includes(story.id);

  let xpReward, coinsReward, rewardLabel;

  if (isFirstCompletion) {
    xpReward = story.rewards?.xp || 20;
    coinsReward = story.rewards?.coins || 15;
    rewardLabel = 'Первое прохождение!';

    state.completedStories.push(story.id);
  } else {
    xpReward = 1;
    coinsReward = 0;
    rewardLabel = 'Повторное прохождение';
  }

  state.xp += xpReward;
  state.coins += coinsReward;

  while (state.xp >= XP_PER_LEVEL) {
    state.xp -= XP_PER_LEVEL;
    state.level += 1;
    state.coins += COINS_PER_LEVEL;
    toast(`🎉 Уровень ${state.level}! +${COINS_PER_LEVEL} 🪙`);
  }

  save();
  refreshStreakDisplay();
  markActivity(deps?.toast || window.toast);

  const rewards = isFirstCompletion
    ? [
        { icon: '📖', label: rewardLabel },
        { icon: '🪙', label: `+${coinsReward} монет` },
        { icon: '⭐', label: `+${xpReward} XP` },
      ]
    : [
        { icon: '🔄', label: rewardLabel },
        { icon: '⭐', label: `+${xpReward} XP` },
      ];

  showCompletionScreen({
    title: isFirstCompletion ? 'おめでとう!' : 'よくできました!',
    subtitle: story.title,
    desc: isFirstCompletion ? 'История успешно пройдена!' : 'История перечитана!',
    theme: 'success',
    rewards: rewards,
    onContinue: () => {
      nav('library');
    },
  });
}

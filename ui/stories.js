// ui/stories.js - Модуль интерактивных историй

import { $ } from '../src/utils.js';
import { CONTENT_INDEX } from './home.js';
import { loadChapterData } from '../src/content-loader.js';

// Локальный контекст зависимостей
let deps = null;

// Глобальные переменные для квиза
let currentQuestionIndex = 0;
let attemptsCount = 0;

// Функция рендеринга списка историй
export function renderStories(state, dependencies) {
  if (dependencies) deps = dependencies;
  const { CH_NAMES, chState } = deps;
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
          <p class="story-lesson">Урок ${story.lesson_id}: ${(CH_NAMES[story.lesson_id] || [''])[0]}</p>
        </div>
      </div>
    `;
    })
    .join('');

  $$('.story-card').forEach((card) => {
    card.onclick = async () => {
      const storyId = parseInt(card.dataset.storyId);
      const storyMeta = stories.find((s) => s.id === storyId);
      if (!storyMeta) return;

      const isUnlocked = chState(storyMeta.lesson_id).started;

      if (!isUnlocked) {
        toast(`🔒 Пройдите Урок ${storyMeta.lesson_id}, чтобы открыть эту историю`);
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

// Вкладка «Заметки» — сохранённые ответы Сенсея
function renderLibraryNotes(state, dependencies) {
  const { save } = deps || dependencies;
  const body = $('#library-body');
  if (!body) return;

  const notes = state.savedNotes || [];
  if (notes.length === 0) {
    body.innerHTML = `<div class="empty"><div class="em">📝</div><h3>Заметок пока нет</h3><p>Сохраняйте ответы Сенсея кнопкой «＋ Сохранить в учебник».</p></div>`;
    return;
  }

  body.innerHTML = notes
    .map(
      (n) => `
      <div class="note-card" data-note-id="${escapeHtmlLocal(n.id)}">
        <div class="note-head">
          <h3 class="note-title">${escapeHtmlLocal(n.title)}</h3>
          <span class="note-date">${escapeHtmlLocal(n.date || '')}</span>
        </div>
        <div class="note-content">${escapeHtmlLocal(n.content)}</div>
        <button class="btn-ghost note-delete">🗑 Удалить</button>
      </div>`
    )
    .join('');

  body.querySelectorAll('.note-delete').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.closest('.note-card').dataset.noteId;
      state.savedNotes = (state.savedNotes || []).filter((n) => n.id !== id);
      save();
      renderLibraryNotes(state, dependencies);
    };
  });
}

// Вкладка «Грамматика» — список глав с переходом к уроку
function renderLibraryGrammar(state, dependencies) {
  const { CH_NAMES, chState } = deps || dependencies;
  const navFn = deps?.nav || window.nav || (() => {});
  const body = $('#library-body');
  if (!body) return;

  if (!CONTENT_INDEX || CONTENT_INDEX.length === 0) {
    body.innerHTML = `<div class="empty"><div class="em">📚</div><h3>Уроки не загружены</h3></div>`;
    return;
  }

  body.innerHTML = CONTENT_INDEX.map((ch) => {
    const unlocked = chState(ch.id).started;
    const name = (CH_NAMES[ch.id] || [`Урок ${ch.id}`, ''])[0];
    return `
      <div class="story-card ${unlocked ? '' : 'story-locked'}" data-chapter-id="${ch.id}">
        <div class="story-info">
          <h3 class="story-title">${unlocked ? '📖' : '🔒'} Урок ${ch.id}: ${escapeHtmlLocal(name)}</h3>
        </div>
      </div>`;
  }).join('');

  body.querySelectorAll('[data-chapter-id]').forEach((card) => {
    card.onclick = () => navFn('chapter', parseInt(card.dataset.chapterId, 10));
  });
}

// Функция рендеринга интерактивной истории с токенами
function renderInteractiveStory(content) {
  return content
    .map((sentence) => {
      const tokensHtml = sentence.tokens
        .map((token, idx) => {
          if (token.type === 'Punctuation') {
            return token.kanji;
          }

          if (token.writing && token.writing !== token.kanji) {
            return `<ruby><span class="word-token" 
                  data-word-id="${sentence.sentence_id}-${idx}"
                  data-kanji="${token.kanji}"
                  data-writing="${token.writing}"
                  data-translation="${token.translation}"
                  data-type="${token.type}">${token.kanji}</span><rt>${token.writing}</rt></ruby>`;
          }

          return `<span class="word-token" 
                data-word-id="${sentence.sentence_id}-${idx}"
                data-kanji="${token.kanji}"
                data-translation="${token.translation}"
                data-type="${token.type}">${token.kanji}</span>`;
        })
        .join('');

      return `
      <div class="story-sentence">
        ${sentence.speaker ? `<strong class="speaker">${sentence.speaker}:</strong>` : ''}
        <p class="sentence-jp">${tokensHtml}</p>
        <button class="toggle-translation-btn">Показать перевод</button>
        <p class="sentence-translation hidden">${sentence.translation}</p>
      </div>
    `;
    })
    .join('');
}

// Функция открытия Bottom Sheet для перевода слова
export function openWordBottomSheet(tokenElement) {
  const sheet = $('#word-bottom-sheet');
  if (!sheet) return;

  const kanji = tokenElement.dataset.kanji;
  const writing = tokenElement.dataset.writing || kanji;
  const translation = tokenElement.dataset.translation;
  const type = tokenElement.dataset.type;

  const modalKanji = $('#modal-kanji');
  const modalReading = $('#modal-reading');
  const modalTranslation = $('#modal-translation');
  const modalType = $('#modal-type');

  if (modalKanji) modalKanji.textContent = kanji;
  if (modalReading) modalReading.textContent = writing !== kanji ? writing : '';
  if (modalTranslation) modalTranslation.textContent = translation;
  if (modalType) modalType.textContent = type;

  sheet.classList.add('active');
}

// Функция закрытия Bottom Sheet
export function closeWordBottomSheet() {
  const sheet = $('#word-bottom-sheet');
  if (sheet) sheet.classList.remove('active');
}

// Функция установки обработчиков переключения переводов
function setupTranslationToggleHandlers() {
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
      <span class="story-lesson-badge">Урок ${story.lesson_id}</span>
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

  setupTranslationToggleHandlers();

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

// ui/flashcards.js - Модуль для работы с карточками SRS и словарём

import { $ } from '../src/utils.js';
import { wordById, cardChapter, isWordUnlocked } from '../src/srs-helpers.js';
import { allCards } from '../src/srs-helpers.js';
import { SRS } from '../srs.js';

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

// Константа вероятности режима рисования
const DRAWING_MODE_PROBABILITY = 0.2;

// Функция проверки, является ли строка одиночным кандзи
function isSingleKanji(text) {
  if (!text || text.length === 0) return false;
  const code = text.charCodeAt(0);
  return (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x3400 && code <= 0x4DBF) ||
         (code >= 0x20000 && code <= 0x2A6DF);
}

// Функция извлекает первый кандзи из текста
function getFirstKanji(text) {
  if (!text) return null;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x20000 && code <= 0x2A6DF)) {
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
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3400 && code <= 0x4DBF) ||
        (code >= 0x20000 && code <= 0x2A6DF)) {
      kanji.push(text[i]);
    }
  }
  return kanji;
}

// Отрисовка ячеек прогресса
function renderKanjiProgressCells() {
  const container = document.getElementById("kanji-progress-cells");
  if (!container || kanjiSequence.length === 0) {
    if (container) container.innerHTML = "";
    return;
  }

  container.innerHTML = kanjiSequence.map((k, idx) => {
    const classes = ['kanji-cell'];
    if (idx < currentKanjiIndex) classes.push('completed');
    if (idx === currentKanjiIndex) classes.push('current');
    
    const displayChar = idx < currentKanjiIndex ? k.kanji : '';
    return `<div class="${classes.join(' ')}">${displayChar}</div>`;
  }).join('');
}

// Функция инициализации режима рисования с HanziWriter
function initDrawingMode(kanji, writing, translation, category, hideRomaji, romaji, state, dependencies) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, renderSRSHome } = dependencies;
  
  const target = document.getElementById("kanji-writer-target");
  if (!target || !kanji || typeof HanziWriter === 'undefined') {
    toast("⚠️ HanziWriter не загружен");
    return;
  }

  // 🛑 ВАЖНО: Блокируем скролл страницы при рисовании пальцем на мобилке
  target.style.touchAction = "none"; 

  // Инициализация последовательности, если это первый кандзи
  if (kanjiSequence.length === 0) {
    const kanjiChars = getAllKanji(kanji);
    kanjiSequence = kanjiChars.map(k => ({
      kanji: k,
      writing: writing,
      translation: translation,
      category: category,
      hideRomaji: hideRomaji,
      romaji: romaji
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
          toast("💡 Слишком много ошибок. Дорисуйте по контуру");
        }
      },
      onComplete: (summaryData) => {
        currentKanjiIndex++;
        
        if (currentKanjiIndex < kanjiSequence.length) {
          const nextKanji = kanjiSequence[currentKanjiIndex];
          renderKanjiProgressCells();
          
          const target = document.getElementById("kanji-writer-target");
          if (target) target.innerHTML = "";
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
        
        const resultText = quality === 5 
          ? "✅ Отлично! Нарисовано без подсказок" 
          : "📝 Нарисовано с подсказками";
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
        markActivity();
        flashRevealed = false;
        
        kanjiSequence = [];
        currentKanjiIndex = 0;
        
        setTimeout(() => {
          renderFlash(state, dependencies);
          updateSrsBadge();
        }, 300);
      }
    });
  }

  try {
    target.innerHTML = "";
    
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
      leniency: 1.6
    });

    const undoBtn = document.getElementById("drawing-undo");
    if (undoBtn) {
      undoBtn.onclick = () => {
        if (currentWriter) {
          currentWriter.updateColor('outlineColor', '#f2f2f2');
          startQuiz();
        }
      };
    }

    const startBtn = document.getElementById("drawing-start");
    if (startBtn) {
      startBtn.onclick = () => {
        startQuiz();
      };
    }
    
    startQuiz();
  } catch (error) {
    console.error("Ошибка инициализации HanziWriter:", error);
    toast("⚠️ Ошибка загрузки кандзи: " + error.message);
    flashRevealed = true;
    renderFlash(state, dependencies);
  }
}

// Функция показа карточки после завершения рисования
function showCardAfterDrawing(kanji, writing, translation, category, hideRomaji, romaji, state, dependencies) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, renderSRSHome } = dependencies;
  
  const body = $("#srs-body");
  
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
            ${kanji !== writing ? `<p class="flash-reading">${writing}</p>` : ""}
            ${hideRomaji ? "" : `<p class="flash-romaji">${romaji}</p>`}
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

  speak(writing);
  const speakBtn = $("#flash-speak");
  if (speakBtn) speakBtn.onclick = (e) => { e.stopPropagation(); speak(writing); };

  const exitBtn = $("#flash-exit");
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      
      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: "おつかれさま!",
            subtitle: "Хорошая работа!",
            desc: `Вы повторили часть карточек`,
            theme: "success",
            rewards: [
              { icon: "📚", label: `${stats.reviewed} карточек` },
              { icon: "✨", label: `${stats.perfect} без ошибок` },
              { icon: "🪙", label: `+${stats.reviewed} XP` }
            ],
            onContinue: () => {
              sessionManager = null;
              flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
            }
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
    };
  }

  $$("#rate .rate-btn").forEach((b) => {
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

// Главная функция рендеринга карточки
export function renderFlash(state, dependencies) {
  const { save, showCompletionScreen, XP_CARD, appAddXP, updateSrsBadge, renderSRSHome, LESSONS } = dependencies;
  
  const body = $("#srs-body");
  if (!body) return;

  let card;
  
  if (sessionManager) {
    card = sessionManager.getNextCard();
    
    if (!card) {
      const stats = sessionManager.getStats();
      showCompletionScreen({
        title: "おめでとう！",
        subtitle: "Сессия завершена!",
        desc: "Отличная работа! Вы справились со всеми карточками.",
        theme: "success",
        rewards: [
          { icon: "📚", label: `${stats.reviewed} карточек` },
          { icon: "✨", label: `${stats.perfect} без ошибок` },
          { icon: "🎯", label: `${Math.round(stats.accuracy)}% точность` },
          { icon: "🪙", label: `+${stats.reviewed} XP` }
        ],
        onContinue: () => {
          sessionManager = null;
          flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
        }
      });
      return;
    }
  } else {
    if (flashIdx >= flashQueue.length) {
      const count = flashQueue.length;
      showCompletionScreen({
        title: "おめでとう！",
        subtitle: "Повторение завершено!",
        desc: "Вы успешно повторили все карточки.",
        theme: "success",
        rewards: [
          { icon: "📚", label: `${count} карточек` },
          { icon: "🪙", label: `+${count} XP` }
        ],
        onContinue: () => {
          flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
        }
      });
      return;
    }
    card = flashQueue[flashIdx];
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
  const displayCategory = word.category || "Слово";
  const hideRomaji = state.settings?.hideRomaji || false;
  const displayRomaji = word.romaji || "";

  const allKanji = getAllKanji(displayKanji);
  const isDrawingMode = allKanji.length > 0 && Math.random() < DRAWING_MODE_PROBABILITY;

  if (isDrawingMode && !flashRevealed && allKanji.length > 0) {
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
            <button class="btn-secondary" id="drawing-undo">↺ Заново</button>
            <button class="btn-secondary" id="drawing-start">✍️ Начать</button>
          </div>
        </div>
      </div>`;

    const exitBtn = $("#flash-exit");
    if (exitBtn) {
      exitBtn.onclick = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        
        if (sessionManager) {
          const stats = sessionManager.getStats();
          if (stats.reviewed > 0) {
            showCompletionScreen({
              title: "おつかれさま!",
              subtitle: "Хорошая работа!",
              desc: `Вы повторили часть карточек`,
              theme: "success",
              rewards: [
                { icon: "📚", label: `${stats.reviewed} карточек` },
                { icon: "✨", label: `${stats.perfect} без ошибок` },
                { icon: "🪙", label: `+${stats.reviewed} XP` }
              ],
              onContinue: () => {
                sessionManager = null;
                flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
              }
            });
            return;
          }
        }
        sessionManager = null;
        flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
      };
    }

    initDrawingMode(displayKanji, displayWriting, displayTranslation, displayCategory, hideRomaji, displayRomaji, state, dependencies);
    return;
  }

  body.innerHTML = `
    <div class="flash-wrap">
      <div class="flash-top">
        <span class="flash-count" data-testid="flash-progress">${flashIdx + 1} / ${flashQueue.length}</span>
        <button class="btn-ghost" id="flash-exit">Выйти</button>
      </div>
      <div class="flash-card-3d" id="flash-card" data-testid="flash-card">
        <div class="flash-inner ${flashRevealed ? "flipped" : ""}">
          <div class="flash-front">
            <button class="flash-speak" id="flash-speak" aria-label="Озвучить">🔊</button>
            <div class="flash-cat">${displayCategory}</div>
            <p class="flash-jp">${displayKanji}</p>
            <p class="flash-tap-hint">Нажмите, чтобы показать ответ</p>
          </div>
          <div class="flash-back">
            <p class="flash-tr">${displayTranslation}</p>
            ${displayKanji !== displayWriting ? `<p class="flash-reading">${displayWriting}</p>` : ""}
            ${hideRomaji ? "" : `<p class="flash-romaji">${displayRomaji}</p>`}
          </div>
        </div>
      </div>
      <div id="rate" class="${flashRevealed ? "" : "hidden"}">
        <div class="rate-row">
          <button class="rate-btn rate-again" data-q="0" data-testid="rate-again">Снова</button>
          <button class="rate-btn rate-hard" data-q="3" data-testid="rate-hard">Трудно</button>
          <button class="rate-btn rate-good" data-q="4" data-testid="rate-good">Хорошо</button>
          <button class="rate-btn rate-easy" data-q="5" data-testid="rate-easy">Легко</button>
        </div>
      </div>
    </div>`;

  const cardEl = $("#flash-card");
  const rateDiv = $("#rate");
  const speakBtn = $("#flash-speak");

  if (!flashRevealed) {
    if (speakBtn) speakBtn.onclick = (e) => { e.stopPropagation(); speak(displayWriting); };
    if (cardEl) {
      cardEl.onclick = () => {
        flashRevealed = true;
        cardEl.querySelector(".flash-inner").classList.add("flipped");
        rateDiv.classList.remove("hidden");
        speak(displayWriting);
      };
    }
  } else {
    speak(displayWriting);
    if (speakBtn) speakBtn.onclick = (e) => { e.stopPropagation(); speak(displayWriting); };
  }

  const exitBtn = $("#flash-exit");
  if (exitBtn) {
    exitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      
      if (sessionManager) {
        const stats = sessionManager.getStats();
        if (stats.reviewed > 0) {
          showCompletionScreen({
            title: "おつかれさま!",
            subtitle: "Хорошая работа!",
            desc: `Вы повторили часть карточек`,
            theme: "success",
            rewards: [
              { icon: "📚", label: `${stats.reviewed} карточек` },
              { icon: "✨", label: `${stats.perfect} без ошибок` },
              { icon: "🪙", label: `+${stats.reviewed} XP` }
            ],
            onContinue: () => {
              sessionManager = null;
              flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
            }
          });
          return;
        }
      }
      sessionManager = null;
      flashCtx ? nav("chapter", flashCtx) : renderSRSHome();
    };
  }

  $$("#rate .rate-btn").forEach((b) => {
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

// Функция рендеринга словаря
export function renderDictionary(state, dependencies) {
  const { LESSONS } = dependencies;
  
  const content = $("#srs-body");
  if (!content) return;
  
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
  
  const searchInput = $("#dict-search");
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filterDictionaryWords(e.target.value, state, dependencies);
      }, 300);
    });
  }
}

// Функция рендеринга списка уроков и слов
function renderDictionaryLessons(state, dependencies, searchQuery = "") {
  const { LESSONS } = dependencies;
  
  const container = $("#dict-lessons-container");
  if (!container) return;
  
  const query = searchQuery.toLowerCase().trim();
  let totalVisible = 0;
  
  container.innerHTML = LESSONS.map((lesson) => {
    const words = lesson.words || [];
    
    const filteredWords = query ? words.filter(word => {
      return (word.kanji && word.kanji.toLowerCase().includes(query)) ||
             (word.writing && word.writing.toLowerCase().includes(query)) ||
             (word.romaji && word.romaji.toLowerCase().includes(query)) ||
             (word.translation && word.translation.toLowerCase().includes(query));
    }) : words;
    
    if (filteredWords.length === 0 && query) {
      return '';
    }
    
    totalVisible += filteredWords.length;
    
    const wordsHtml = filteredWords.map(word => {
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
    }).join('');
    
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
    container.innerHTML = emptyState("🔍", "Ничего не найдено", `По запросу "${searchQuery}" слова не найдены.`);
    return;
  }
  
  $$(".dict-word-card").forEach(card => {
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
  '専': '專', '学': '學', '図': '圖', '実': '實', '医': '醫',
  '体': '體', '国': '國', '会': '會', '帰': '歸', '万': '萬',
  '円': '圓', '亜': '亞', '仏': '佛', '単': '單', '号': '號',
  '売': '賣', '変': '變', '声': '聲', '寝': '寢', '広': '廣',
  '従': '從', '恵': '惠', '応': '應', '斎': '齋', '旧': '舊',
  '権': '權', '楽': '樂', '気': '氣', '温': '溫', '湾': '灣',
  '点': '點', '為': '爲', '画': '畫', '祈': '祈', '禅': '禪',
  '糸': '絲', '経': '經', '絵': '繪', '続': '續', '聴': '聽',
  '脳': '腦', '臓': '臟', '薬': '藥', '虫': '蟲', '号': '號',
  '覚': '覺', '観': '觀', '訳': '譯', '証': '證', '読': '讀',
  '辞': '辭', '鉄': '鐵', '関': '關', '雑': '雜', '霊': '靈',
  '顔': '顏', '駅': '驛', '黄': '黃', '黒': '黑', '歯': '齒'
};

// Функция открытия модального окна словаря
function openDictionaryModal(word, state, dependencies) {
  const { renderSRSHome } = dependencies;
  
  const body = $("#srs-body");
  if (!body) return;
  
  const kanjiChars = getAllKanji(word.kanji || word.writing);
  const hasKanji = kanjiChars.length > 0;
  
  const returnToDict = () => {
    renderSRSHome();
  };
  
  let currentKanjiIdx = 0;
  
  const renderModalContent = () => {
    const selectedKanji = hasKanji ? kanjiChars[currentKanjiIdx] : null;
    
    const kanjiTabsHtml = kanjiChars.length > 1 ? `
      <div class="dict-kanji-tabs">
        ${kanjiChars.map((k, idx) => `
          <button class="dict-kanji-tab ${idx === currentKanjiIdx ? 'active' : ''}" data-kanji-idx="${idx}">
            ${k}
          </button>
        `).join('')}
      </div>
    ` : '';
    
    body.innerHTML = `
      <div class="dict-modal">
        <div class="dict-modal-header">
          <button class="btn-ghost" id="dict-modal-close">← Назад</button>
          <h2 class="dict-modal-title">${word.kanji || word.writing}</h2>
        </div>
        
        <div class="dict-modal-content">
          <div class="dict-modal-info">
            <p class="dict-modal-reading">${word.writing}</p>
            <p class="dict-modal-translation">${word.translation}</p>
            ${word.romaji ? `<p class="dict-modal-romaji">${word.romaji}</p>` : ''}
          </div>
          
          ${hasKanji ? `
            ${kanjiTabsHtml}
            <div class="dict-kanji-writer-container">
              <div id="dict-kanji-writer-target"></div>
            </div>
            <div class="dict-kanji-controls">
              <button class="btn-secondary" id="dict-animate-btn">🎬 Анимация черт</button>
              <button class="btn-secondary" id="dict-quiz-btn">✍️ Пропись</button>
            </div>
          ` : '<p class="dict-no-kanji">В этом слове нет кандзи для отрисовки</p>'}
        </div>
      </div>
    `;
    
    const closeBtn = $("#dict-modal-close");
    if (closeBtn) closeBtn.onclick = returnToDict;
    
    if (kanjiChars.length > 1) {
      $$(".dict-kanji-tab").forEach(tab => {
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
  const target = document.getElementById("dict-kanji-writer-target");
  const container = target?.parentElement;
  const controls = document.querySelector(".dict-kanji-controls");
  
  if (!target || typeof HanziWriter === 'undefined') {
    toast("⚠️ HanziWriter не загружен");
    return;
  }
  
  target.innerHTML = "";
  target.style.touchAction = "none";
  
  const loadKanjiData = async (char) => {
    try {
      const response = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${char}.json`);
      
      if (response.ok) {
        return await response.json();
      }
      
      if (response.status === 404 && kanjiSimplifiedToTraditional[char]) {
        const traditionalChar = kanjiSimplifiedToTraditional[char];
        const fallbackResponse = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${traditionalChar}.json`);
        
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
      }
    });
    
    const animateBtn = $("#dict-animate-btn");
    if (animateBtn) {
      animateBtn.onclick = () => {
        writer.animateCharacter();
      };
    }
    
    const quizBtn = $("#dict-quiz-btn");
    if (quizBtn) {
      quizBtn.onclick = () => {
        writer.quiz({
          showOutline: true,
          leniency: 1.2,
          onComplete: () => {
            toast("✅ Отлично!");
          }
        });
      };
    }
  } catch (error) {
    console.error("Ошибка инициализации HanziWriter:", error);
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
  const { save, updateSrsBadge, renderHome, startFlash } = dependencies;
  
  const all = allCards(state.srs);
  if (all.length === 0) {
    toast("Нет изученных карточек. Сначала начните главу.");
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
  renderHome();
  updateSrsBadge();
  startFlash(null);
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

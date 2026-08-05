import { getGrammarQuizTopic, normalizeGrammarQuizAnswer } from '../src/grammar-quiz-content.js';
import { setSafeHTML } from '../src/security-helpers.js';

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeAnswerText(text, options) {
  return normalizeGrammarQuizAnswer(text, options);
}

function renderHighlightedText(text, highlights = []) {
  if (!text) return '';
  if (!Array.isArray(highlights) || highlights.length === 0) {
    return escapeHtml(text);
  }
  let html = escapeHtml(text);
  for (const h of highlights) {
    if (!h) continue;
    const escapedH = escapeHtml(h);
    const regex = new RegExp(escapedH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    html = html.replace(regex, `<mark class="grammar-highlight">${escapedH}</mark>`);
  }
  return html;
}

export function openGrammarLesson({ state: _state, chapterId, topic, onComplete, onClose }) {
  return new Promise((resolve) => {
    let questions = Array.isArray(topic?.quiz) ? topic.quiz : [];
    const passingScorePercent = Number(topic?.passingScorePercent) || 67;

    let screen = 'explanation'; // 'explanation' | 'quiz' | 'result'
    let currentQuestionIndex = 0;
    let selectedOptionId = null;
    let fillBlankText = '';
    let placedTokens = []; // Array of { id, text }
    let answerConfirmed = false;
    let userAnswers = []; // Array of { questionId, isCorrect, userAnswer, correctAnswer, question }

    const overlay = document.createElement('div');
    overlay.className = 'grammar-lesson-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', topic?.title || 'Грамматическая тема');

    const finish = (result) => {
      window.removeEventListener('keydown', handleKeyDown);
      overlay.remove();
      if (result.canceled) {
        onClose?.(result);
      } else {
        onComplete?.(result);
      }
      resolve(result);
    };

    const confirmCancel = () => {
      if (
        screen === 'quiz' &&
        (currentQuestionIndex > 0 ||
          answerConfirmed ||
          selectedOptionId ||
          fillBlankText ||
          placedTokens.length > 0)
      ) {
        if (!window.confirm('Выйти из проверки? Ответы не сохранятся.')) {
          return;
        }
      }
      finish({ canceled: true, completed: false, changed: false, reason: 'canceled' });
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        confirmCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const render = () => {
      if (screen === 'explanation') {
        renderExplanationScreen();
      } else if (screen === 'quiz') {
        renderQuizScreen();
      } else if (screen === 'result') {
        renderResultScreen();
      }
    };

    function renderExplanationScreen() {
      const noteNum = topic?.noteId || topic?.order || 1;
      const subtitleHtml = topic?.subtitle
        ? `<div class="grammar-lesson-subtitle">${escapeHtml(topic.subtitle)}</div>`
        : '';
      const summaryHtml = topic?.summary
        ? `<div class="grammar-lesson-summary">${escapeHtml(topic.summary)}</div>`
        : '';
      const formulaHtml = topic?.formula
        ? `<div class="grammar-formula-card">
            <div class="grammar-formula-label">Формула</div>
            <div class="grammar-formula-content">${escapeHtml(topic.formula)}</div>
           </div>`
        : '';

      let explanationHtml = '';
      if (Array.isArray(topic?.explanation) && topic.explanation.length > 0) {
        explanationHtml = topic.explanation
          .map((item) => {
            if (typeof item === 'string') {
              return `<p class="grammar-explanation-p">${escapeHtml(item)}</p>`;
            }
            if (item?.type === 'rule') {
              return `<div class="grammar-rule-card">📌 ${escapeHtml(item.text)}</div>`;
            }
            return `<p class="grammar-explanation-p">${escapeHtml(item?.text || '')}</p>`;
          })
          .join('');
      } else if (typeof topic?.explanation === 'string' && topic.explanation.trim()) {
        explanationHtml = topic.explanation
          .split('\n\n')
          .map((p) => `<p class="grammar-explanation-p">${escapeHtml(p)}</p>`)
          .join('');
      } else if (topic?.content) {
        explanationHtml = String(topic.content)
          .split('\n\n')
          .map((p) => `<p class="grammar-explanation-p">${escapeHtml(p)}</p>`)
          .join('');
      }

      let examplesHtml = '';
      if (Array.isArray(topic?.examples) && topic.examples.length > 0) {
        examplesHtml = `
          <div class="grammar-examples-section">
            <div class="grammar-section-heading">Примеры</div>
            ${topic.examples
              .map(
                (ex) => `
              <div class="grammar-example-card">
                <div class="grammar-example-japanese">${renderHighlightedText(ex.japanese, ex.highlight)}</div>
                ${ex.reading ? `<div class="grammar-example-reading">${escapeHtml(ex.reading)}</div>` : ''}
                ${ex.translation ? `<div class="grammar-example-translation">${escapeHtml(ex.translation)}</div>` : ''}
              </div>
            `
              )
              .join('')}
          </div>
        `;
      }

      let workbookHtml = '';
      if (topic?.workbookReference) {
        const page = topic.workbookReference.printedPage || topic.workbookReference.page;
        if (page) {
          workbookHtml = `<div class="grammar-workbook-ref">По мотивам практики Workbook · стр. ${page}</div>`;
        }
      }

      const hasQuiz = questions.length > 0;

      setSafeHTML(
        overlay,
        `
        <div class="grammar-lesson-shell">
          <div class="grammar-lesson-header">
            <div class="grammar-lesson-header-main">
              <span class="grammar-badge">Тема ${noteNum} · Глава ${chapterId}</span>
              <h2 class="grammar-lesson-title">${escapeHtml(topic?.title || 'Грамматическая тема')}</h2>
              ${subtitleHtml}
            </div>
            <button type="button" class="grammar-lesson-close" data-close aria-label="Закрыть">&times;</button>
          </div>
          <div class="grammar-lesson-body">
            ${summaryHtml}
            ${formulaHtml}
            <div class="grammar-explanation-content">
              ${explanationHtml}
            </div>
            ${examplesHtml}
            ${workbookHtml}
          </div>
          <div class="grammar-lesson-footer">
            ${
              hasQuiz
                ? `<button type="button" class="btn-primary grammar-action-btn" data-start-quiz>Перейти к проверке</button>`
                : `<div class="grammar-quiz-unavailable">Проверочные задания временно недоступны или опущены.</div>
                   <button type="button" class="btn-secondary grammar-action-btn" data-retry-quiz-load>Повторить загрузку</button>
                   <button type="button" class="btn-secondary grammar-action-btn" data-close>Закрыть</button>`
            }
          </div>
        </div>
      `
      );

      overlay.querySelectorAll('[data-close]').forEach((btn) => {
        btn.onclick = () =>
          finish({ canceled: true, completed: false, changed: false, reason: 'canceled' });
      });

      const startBtn = overlay.querySelector('[data-start-quiz]');
      if (startBtn) {
        startBtn.onclick = () => {
          screen = 'quiz';
          currentQuestionIndex = 0;
          userAnswers = [];
          resetQuestionState();
          render();
        };
      }

      const retryLoadBtn = overlay.querySelector('[data-retry-quiz-load]');
      if (retryLoadBtn) {
        retryLoadBtn.onclick = async () => {
          retryLoadBtn.disabled = true;
          retryLoadBtn.textContent = 'Загрузка...';
          const freshTopic = await getGrammarQuizTopic(chapterId, topic?.id);
          if (freshTopic && Array.isArray(freshTopic.quiz) && freshTopic.quiz.length > 0) {
            topic.quiz = freshTopic.quiz;
            questions = freshTopic.quiz;
          }
          render();
        };
      }
    }

    function resetQuestionState() {
      selectedOptionId = null;
      fillBlankText = '';
      placedTokens = [];
      answerConfirmed = false;
    }

    function renderQuizScreen() {
      const q = questions[currentQuestionIndex];
      const totalQ = questions.length;
      const progressPercent = Math.round(((currentQuestionIndex + 1) / totalQ) * 100);

      let questionContentHtml = '';

      if (q.type === 'single-choice') {
        const optionsHtml = (q.options || [])
          .map((opt) => {
            const isSelected = selectedOptionId === opt.id;
            let stateClass = '';
            if (isSelected) stateClass += ' grammar-option-selected';
            if (answerConfirmed) {
              if (opt.id === q.correctOptionId) stateClass += ' grammar-option-correct';
              else if (isSelected) stateClass += ' grammar-option-incorrect';
            }
            return `
              <button type="button" class="grammar-option${stateClass}" data-opt-id="${escapeHtml(opt.id)}" ${answerConfirmed ? 'disabled' : ''}>
                <span class="grammar-option-radio"></span>
                <span class="grammar-option-text">${escapeHtml(opt.text)}</span>
              </button>
            `;
          })
          .join('');

        questionContentHtml = `<div class="grammar-options-grid">${optionsHtml}</div>`;
      } else if (q.type === 'fill-blank') {
        const disabledAttr = answerConfirmed ? 'disabled' : '';
        questionContentHtml = `
          <div class="grammar-fill-container">
            <input type="text" class="grammar-input" placeholder="Введите ответ..." value="${escapeHtml(fillBlankText)}" ${disabledAttr} autofocus />
          </div>
        `;
      } else if (q.type === 'sentence-order') {
        // tokens pool vs placed tokens
        const allTokens = (q.tokens || []).map((t, idx) => ({
          id: `token_${idx}`,
          text: t,
        }));

        const placedIds = new Set(placedTokens.map((t) => t.id));
        const availableTokens = allTokens.filter((t) => !placedIds.has(t.id));

        const answerAreaHtml = placedTokens
          .map(
            (t) =>
              `<button type="button" class="grammar-token placed" data-token-id="${escapeHtml(t.id)}" ${answerConfirmed ? 'disabled' : ''}>${escapeHtml(t.text)}</button>`
          )
          .join('');

        const poolTokensHtml = availableTokens
          .map(
            (t) =>
              `<button type="button" class="grammar-token pool" data-token-id="${escapeHtml(t.id)}" ${answerConfirmed ? 'disabled' : ''}>${escapeHtml(t.text)}</button>`
          )
          .join('');

        questionContentHtml = `
          <div class="grammar-sentence-builder">
            <div class="grammar-answer-area ${placedTokens.length === 0 ? 'empty' : ''}">
              ${answerAreaHtml || '<span class="grammar-answer-placeholder">Составьте предложение из слов ниже</span>'}
            </div>
            <div class="grammar-sentence-controls">
              <button type="button" class="btn-secondary btn-sm" data-token-undo ${placedTokens.length === 0 || answerConfirmed ? 'disabled' : ''}>Отменить</button>
              <button type="button" class="btn-secondary btn-sm" data-token-clear ${placedTokens.length === 0 || answerConfirmed ? 'disabled' : ''}>Очистить</button>
            </div>
            <div class="grammar-tokens-pool">
              ${poolTokensHtml}
            </div>
          </div>
        `;
      }

      let feedbackHtml = '';
      if (answerConfirmed) {
        const lastAns = userAnswers[userAnswers.length - 1];
        feedbackHtml = `
          <div class="grammar-feedback ${lastAns.isCorrect ? 'correct' : 'incorrect'}">
            <div class="grammar-feedback-badge">${lastAns.isCorrect ? '✓ Верно' : '✗ Неверно'}</div>
            <div class="grammar-feedback-explanation">${escapeHtml(q.explanation || '')}</div>
          </div>
        `;
      }

      const canSubmit = checkCanSubmitQuestion(q);

      setSafeHTML(
        overlay,
        `
        <div class="grammar-lesson-shell">
          <div class="grammar-lesson-header">
            <div class="grammar-lesson-progress">
              <span class="grammar-progress-step">Вопрос ${currentQuestionIndex + 1} из ${totalQ}</span>
              <span class="grammar-type-badge">${escapeHtml(q.type)}</span>
            </div>
            <div class="grammar-progress-track">
              <div class="grammar-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <button type="button" class="grammar-lesson-close" data-close aria-label="Закрыть">&times;</button>
          </div>
          <div class="grammar-lesson-body">
            <div class="grammar-question-card">
              <div class="grammar-question-prompt">${escapeHtml(q.prompt)}</div>
              ${questionContentHtml}
            </div>
            ${feedbackHtml}
          </div>
          <div class="grammar-lesson-footer">
            ${
              !answerConfirmed
                ? `<button type="button" class="btn-primary grammar-action-btn" data-submit-answer ${canSubmit ? '' : 'disabled'}>Ответить</button>`
                : `<button type="button" class="btn-primary grammar-action-btn" data-next-question>${currentQuestionIndex + 1 >= totalQ ? 'Посмотреть результат' : 'Следующий вопрос'}</button>`
            }
          </div>
        </div>
      `
      );

      // Event handlers
      overlay.querySelector('[data-close]').onclick = confirmCancel;

      if (q.type === 'single-choice' && !answerConfirmed) {
        overlay.querySelectorAll('.grammar-option').forEach((btn) => {
          btn.onclick = () => {
            selectedOptionId = btn.dataset.optId;
            render();
          };
        });
      } else if (q.type === 'fill-blank' && !answerConfirmed) {
        const inputEl = overlay.querySelector('.grammar-input');
        if (inputEl) {
          inputEl.oninput = (e) => {
            fillBlankText = e.target.value;
            const submitBtn = overlay.querySelector('[data-submit-answer]');
            if (submitBtn) submitBtn.disabled = !checkCanSubmitQuestion(q);
          };
          inputEl.onkeydown = (e) => {
            if (e.key === 'Enter' && checkCanSubmitQuestion(q)) {
              e.preventDefault();
              submitAnswer(q);
            }
          };
        }
      } else if (q.type === 'sentence-order' && !answerConfirmed) {
        const allTokens = (q.tokens || []).map((t, idx) => ({
          id: `token_${idx}`,
          text: t,
        }));

        overlay.querySelectorAll('.grammar-token.pool').forEach((btn) => {
          btn.onclick = () => {
            const tokId = btn.dataset.tokenId;
            const found = allTokens.find((t) => t.id === tokId);
            if (found) {
              placedTokens.push(found);
              render();
            }
          };
        });

        overlay.querySelectorAll('.grammar-token.placed').forEach((btn) => {
          btn.onclick = () => {
            const tokId = btn.dataset.tokenId;
            placedTokens = placedTokens.filter((t) => t.id !== tokId);
            render();
          };
        });

        const undoBtn = overlay.querySelector('[data-token-undo]');
        if (undoBtn) {
          undoBtn.onclick = () => {
            placedTokens.pop();
            render();
          };
        }

        const clearBtn = overlay.querySelector('[data-token-clear]');
        if (clearBtn) {
          clearBtn.onclick = () => {
            placedTokens = [];
            render();
          };
        }
      }

      const submitBtn = overlay.querySelector('[data-submit-answer]');
      if (submitBtn) {
        submitBtn.onclick = () => submitAnswer(q);
      }

      const nextBtn = overlay.querySelector('[data-next-question]');
      if (nextBtn) {
        nextBtn.onclick = () => {
          if (currentQuestionIndex + 1 < totalQ) {
            currentQuestionIndex++;
            resetQuestionState();
            render();
          } else {
            screen = 'result';
            render();
          }
        };
      }
    }

    function checkCanSubmitQuestion(q) {
      if (q.type === 'single-choice') {
        return Boolean(selectedOptionId);
      }
      if (q.type === 'fill-blank') {
        return Boolean(normalizeAnswerText(fillBlankText));
      }
      if (q.type === 'sentence-order') {
        return placedTokens.length > 0;
      }
      return false;
    }

    function submitAnswer(q) {
      if (answerConfirmed) return;

      let isCorrect = false;
      let userAnswer = '';
      let correctAnswer = '';

      if (q.type === 'single-choice') {
        userAnswer = selectedOptionId;
        correctAnswer = q.correctOptionId;
        isCorrect = selectedOptionId === q.correctOptionId;
      } else if (q.type === 'fill-blank') {
        userAnswer = normalizeAnswerText(fillBlankText);
        const accepted = (q.acceptedAnswers || []).map(normalizeAnswerText);
        correctAnswer = accepted[0] || '';
        isCorrect = accepted.includes(userAnswer);
      } else if (q.type === 'sentence-order') {
        const userOrder = placedTokens.map((t) => t.text);
        const correctOrder = q.correctOrder || [];
        userAnswer = userOrder.join('');
        correctAnswer = correctOrder.join('');
        isCorrect =
          userOrder.length === correctOrder.length &&
          userOrder.every((val, idx) => val === correctOrder[idx]);
      }

      answerConfirmed = true;
      userAnswers.push({
        questionId: q.id,
        isCorrect,
        userAnswer,
        correctAnswer,
        question: q,
      });

      render();
    }

    function renderResultScreen() {
      const totalQ = questions.length;
      const correctCount = userAnswers.filter((a) => a.isCorrect).length;
      const score = Math.round((correctCount / totalQ) * 100);
      const passed = score >= passingScorePercent;

      const wrongAnswers = userAnswers.filter((a) => !a.isCorrect);

      let errorsReviewHtml = '';
      if (wrongAnswers.length > 0) {
        errorsReviewHtml = `
          <div class="grammar-error-review">
            <div class="grammar-section-heading">Разбор ошибок</div>
            ${wrongAnswers
              .map(
                (ans) => `
              <div class="grammar-error-item">
                <div class="grammar-error-prompt">${escapeHtml(ans.question.prompt)}</div>
                <div class="grammar-error-explanation">${escapeHtml(ans.question.explanation)}</div>
              </div>
            `
              )
              .join('')}
          </div>
        `;
      }

      setSafeHTML(
        overlay,
        `
        <div class="grammar-lesson-shell">
          <div class="grammar-lesson-header">
            <div class="grammar-lesson-header-main">
              <h2 class="grammar-lesson-title">Результаты проверки</h2>
            </div>
            <button type="button" class="grammar-lesson-close" data-close aria-label="Закрыть">&times;</button>
          </div>
          <div class="grammar-lesson-body">
            <div class="grammar-result-card ${passed ? 'pass' : 'fail'}">
              <div class="grammar-result-score">${score}%</div>
              <div class="grammar-result-count">${correctCount} из ${totalQ} верных ответов</div>
              <div class="grammar-result-status">${passed ? '🎉 Отлично! Тема освоена' : `Попробуйте ещё раз (требуется ${passingScorePercent}%)`}</div>
            </div>
            ${errorsReviewHtml}
          </div>
          <div class="grammar-lesson-footer">
            ${
              passed
                ? `<button type="button" class="btn-primary grammar-action-btn" data-complete-topic>Завершить тему</button>`
                : `<button type="button" class="btn-secondary grammar-action-btn" data-retry-quiz>Попробовать снова</button>
                   <button type="button" class="btn-primary grammar-action-btn" data-close>Закрыть</button>`
            }
          </div>
        </div>
      `
      );

      overlay.querySelectorAll('[data-close]').forEach((btn) => {
        btn.onclick = () =>
          finish({ canceled: true, score, passed: false, correctCount, totalQuestions: totalQ });
      });

      const retryBtn = overlay.querySelector('[data-retry-quiz]');
      if (retryBtn) {
        retryBtn.onclick = () => {
          screen = 'quiz';
          currentQuestionIndex = 0;
          userAnswers = [];
          resetQuestionState();
          render();
        };
      }

      const completeBtn = overlay.querySelector('[data-complete-topic]');
      if (completeBtn) {
        completeBtn.onclick = () => {
          finish({
            canceled: false,
            passed: true,
            score,
            correctCount,
            totalQuestions: totalQ,
            errors: wrongAnswers,
          });
        };
      }
    }

    document.body.appendChild(overlay);
    render();
  });
}

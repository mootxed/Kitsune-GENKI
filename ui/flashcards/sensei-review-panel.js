/**
 * ui/flashcards/sensei-review-panel.js
 *
 * Post-review AI panel: кнопки → loading → result → квиз → "в чат".
 * Единый helper renderPostReviewSenseiActions — вызывается из всех режимов.
 *
 * DOM-якорь: #review-feedback-actions (создаётся в review-fsrs.js или вставляется helper-ом).
 * A11y: role="dialog", aria-label, Escape, возврат фокуса.
 * Async race protection: сверяем { attemptId, cardSessionId } перед рендером.
 */

import { createAIRequestClient } from '../../src/ai/request-client.js';
import { ensureAIPrivacyDisclosure } from '../../src/ai-disclosure.js';
import { getOpenRouterKey } from '../../src/openrouter-key.js';

import { handleExplainReviewError } from '../../src/ai/handlers/explain-review-error.js';
import { handleCreateMnemonic } from '../../src/ai/handlers/create-mnemonic.js';
import { activeReviewAIContext, setActiveReviewAIContext } from './state.js';

import { shouldShowSenseiAction, buildSenseiActionInput } from './sensei-review-actions.js';
import { diagnoseReviewError } from '../../src/ai/local-diagnosis.js';
import { validateAllQuizQuestions } from '../../src/ai/quiz-validator.js';
import { getCorrectOptionIndex } from '../../src/ai/schemas.js';
async function activateChatTab() {
  const chatMod = await import('../chat.js');
  if (typeof chatMod.setSenseiTab === 'function') {
    chatMod.setSenseiTab('chat');
  }
}

import { secureRandomId } from '../../src/utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId() {
  return secureRandomId();
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text ?? '');
  if (options.id) node.id = options.id;
  if (options.type) node.type = options.type;
  for (const [k, v] of Object.entries(options.attrs || {})) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

// ---------------------------------------------------------------------------
// Panel lifecycle
// ---------------------------------------------------------------------------

let _currentPanel = null;
let _previousFocus = null;

/**
 * Закрывает панель Сенсея. Возвращает фокус.
 */
export function closeSenseiPanel() {
  if (_currentPanel) {
    _currentPanel.remove();
    _currentPanel = null;
  }
  if (_previousFocus && typeof _previousFocus.focus === 'function') {
    _previousFocus.focus();
    _previousFocus = null;
  }
  // Не очищаем activeReviewAIContext здесь — только при Undo и следующей карточке
}

// ---------------------------------------------------------------------------
// Quiz renderer (для панели — ответы в памяти, не сохраняются)
// ---------------------------------------------------------------------------

function renderPanelQuiz(quiz, quizAnswers, onAnswerChange) {
  if (!Array.isArray(quiz?.questions) || !quiz.questions.length) return null;

  const validQuestions = quiz.questions.filter((q) => validateAllQuizQuestions([q]).length === 0);
  if (!validQuestions.length) return null;

  const section = el('section', { className: 'srp-quiz' });
  section.append(el('h4', { text: 'Проверьте себя' }));

  validQuestions.forEach((question, qi) => {
    if (!question || !Array.isArray(question.options)) return;
    const fieldset = el('fieldset', { className: 'srp-quiz-question' });
    fieldset.append(el('legend', { text: `${qi + 1}. ${question.prompt || ''}` }));
    const correctIndex = getCorrectOptionIndex(question);
    const selectedIndex = quizAnswers?.[question.id] ?? null;

    question.options.forEach((opt, oi) => {
      if (!opt) return;
      const btn = el('button', {
        type: 'button',
        className: 'srp-quiz-option',
        text: opt.text || '',
      });
      if (selectedIndex !== null) {
        btn.disabled = true;
        if (oi === correctIndex) btn.classList.add('correct');
        if (oi === selectedIndex && oi !== correctIndex) btn.classList.add('incorrect');
      }
      btn.addEventListener('click', () => {
        if (selectedIndex !== null) return;
        onAnswerChange?.(question.id, oi);
      });
      fieldset.append(btn);
    });

    if (selectedIndex !== null) {
      const answeredCorrectly = selectedIndex === correctIndex;
      fieldset.append(
        el('p', {
          className: `srp-quiz-result ${answeredCorrectly ? 'correct' : 'incorrect'}`,
          text: `${answeredCorrectly ? '✓ Правильно' : '✗ Неверно'}\n${question.explanation || ''}`,
        })
      );
    }

    section.append(fieldset);
  });

  return section;
}

// ---------------------------------------------------------------------------
// Comparison renderer
// ---------------------------------------------------------------------------

function renderComparison(comparison) {
  if (!Array.isArray(comparison) || !comparison.length) return null;
  const section = el('section', { className: 'srp-comparison' });
  section.append(el('h4', { text: 'Сравнение' }));
  const table = el('table', { className: 'srp-comparison-table' });
  const thead = el('thead');
  thead.innerHTML = '<tr><th>Форма</th><th>Чтение</th><th>Роль</th></tr>';
  const tbody = el('tbody');
  comparison.forEach((entry) => {
    const tr = document.createElement('tr');
    if (entry.isExpected) tr.classList.add('expected');
    tr.innerHTML = `
      <td lang="ja">${escapeHtml(entry.form || '')}</td>
      <td lang="ja">${escapeHtml(entry.reading || '')}</td>
      <td>${escapeHtml(entry.role || '')}</td>
    `;
    tbody.append(tr);
  });
  table.append(thead, tbody);
  section.append(table);
  return section;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });
}

// ---------------------------------------------------------------------------
// Main panel builder
// ---------------------------------------------------------------------------

function buildPanel({ artifact, actionType, snapshot, dependencies, cardSessionId, attemptId }) {
  const panel = el('div', {
    className: 'srp-panel',
    id: 'sensei-review-panel',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'AI Сенсей — разбор ответа',
    },
  });

  const header = el('div', { className: 'srp-header' });
  const title = el('h3', {
    className: 'srp-title',
    text: actionType === 'mnemonic' ? '🧠 Мнемоника' : '🔍 AI Сенсей',
  });
  const closeBtn = el('button', {
    type: 'button',
    className: 'srp-close',
    attrs: { 'aria-label': 'Закрыть панель' },
    text: '✕',
  });
  closeBtn.addEventListener('click', closeSenseiPanel);
  header.append(title, closeBtn);
  panel.append(header);

  const body = el('div', { className: 'srp-body' });

  if (artifact.type === 'review_explanation') {
    // Диагноз
    if (artifact.diagnosis?.message) {
      body.append(el('div', { className: 'srp-diagnosis', text: artifact.diagnosis.message }));
    }

    // Объяснение
    if (artifact.explanation) {
      const expSection = el('section', { className: 'srp-explanation' });
      expSection.append(el('h4', { text: 'Объяснение' }));
      expSection.append(el('p', { text: artifact.explanation }));
      body.append(expSection);
    }

    // Сравнение
    const comp = renderComparison(artifact.comparison);
    if (comp) body.append(comp);

    // Примеры
    if (Array.isArray(artifact.examples) && artifact.examples.length) {
      const exSection = el('section', { className: 'srp-examples' });
      exSection.append(el('h4', { text: 'Примеры' }));
      artifact.examples.forEach((ex) => {
        const item = el('div', { className: 'srp-example' });
        item.innerHTML = `
          <strong lang="ja">${escapeHtml(ex.japanese || '')}</strong>
          ${ex.reading ? `<span class="muted" lang="ja">${escapeHtml(ex.reading)}</span>` : ''}
          <span>${escapeHtml(ex.translation || '')}</span>
        `;
        exSection.append(item);
      });
      body.append(exSection);
    }

    // Квиз
    const ctx = activeReviewAIContext;
    const quizAnswers = ctx?.quizAnswers || {};

    let activeQuizNode = null;
    const renderQuizInstance = (answers) => {
      return renderPanelQuiz(artifact.quiz, answers, (questionId, selectedIndex) => {
        const current = activeReviewAIContext;
        if (
          !current ||
          current.cardSessionId !== cardSessionId ||
          current.attemptId !== attemptId
        ) {
          return;
        }
        if (!current.quizAnswers) current.quizAnswers = {};
        current.quizAnswers[questionId] = selectedIndex;
        const newQuizSection = renderQuizInstance(current.quizAnswers);
        if (activeQuizNode && newQuizSection) {
          activeQuizNode.replaceWith(newQuizSection);
          activeQuizNode = newQuizSection;
        }
      });
    };

    activeQuizNode = renderQuizInstance(quizAnswers);
    if (activeQuizNode) body.append(activeQuizNode);
  }

  if (artifact.type === 'mnemonic') {
    if (artifact.mnemonic) {
      const section = el('section', { className: 'srp-mnemonic-text' });
      section.append(el('p', { text: artifact.mnemonic }));
      body.append(section);
    }

    if (Array.isArray(artifact.breakdown) && artifact.breakdown.length) {
      const section = el('section', { className: 'srp-breakdown' });
      section.append(el('h4', { text: 'Разбор по элементам' }));
      artifact.breakdown.forEach((item) => {
        const row = el('div', { className: 'srp-breakdown-row' });
        row.append(
          el('strong', { attrs: { lang: 'ja' }, text: item.element || '' }),
          el('span', { text: item.cue || '' })
        );
        section.append(row);
      });
      body.append(section);
    }

    if (artifact.warning) {
      body.append(el('p', { className: 'srp-warning', text: `⚠️ ${artifact.warning}` }));
    }

    if (artifact.example) {
      const section = el('section', { className: 'srp-examples' });
      section.append(el('h4', { text: 'Пример' }));
      const item = el('div', { className: 'srp-example' });
      item.innerHTML = `
        <strong lang="ja">${escapeHtml(artifact.example.japanese || '')}</strong>
        <span>${escapeHtml(artifact.example.translation || '')}</span>
      `;
      section.append(item);
      body.append(section);
    }
  }

  panel.append(body);

  // Кнопка "Продолжить в чате"
  const footer = el('div', { className: 'srp-footer' });
  const chatBtn = el('button', {
    type: 'button',
    className: 'btn-ghost srp-chat-btn',
    text: '💬 Продолжить в чате',
  });
  chatBtn.addEventListener('click', async () => {
    if (typeof dependencies?.importReviewExplanationToChat === 'function') {
      await dependencies.importReviewExplanationToChat(artifact, snapshot, dependencies?.state);
      dependencies?.save?.();
    }
    await activateChatTab();
    dependencies?.nav?.('sensei');
    closeSenseiPanel();
  });
  footer.append(chatBtn);
  panel.append(footer);

  // Escape
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeSenseiPanel();
    }
  });

  return panel;
}

// ---------------------------------------------------------------------------
// Loading / Error states
// ---------------------------------------------------------------------------

function setLoading(container, isLoading) {
  const existing = container.querySelector('.srp-loading');
  if (isLoading) {
    if (!existing) {
      container.append(el('div', { className: 'srp-loading', text: '⏳ AI думает…' }));
    }
  } else {
    existing?.remove();
  }
}

function showErrorInContainer(container, message, onRetry) {
  const errDiv = el('div', { className: 'srp-error' });
  errDiv.append(el('p', { text: `⚠️ ${message}` }));
  if (onRetry) {
    const retryBtn = el('button', {
      type: 'button',
      className: 'btn-ghost',
      text: '↻ Повторить',
    });
    retryBtn.addEventListener('click', onRetry);
    errDiv.append(retryBtn);
  }
  container.append(errDiv);
}

// ---------------------------------------------------------------------------
// Panel open
// ---------------------------------------------------------------------------

/**
 * Открывает панель AI Сенсея.
 *
 * @param {object} params
 * @param {import('../../src/ai/review-attempt-schema.js').ReviewAttemptSnapshot} params.snapshot
 * @param {'explain_error'|'explain_more'|'mnemonic'} params.actionType
 * @param {string} [params.reason]
 * @param {object} params.dependencies — { nav, save, aiRequest, state, getAISettings, acceptAIPrivacy }
 */
export async function openSenseiPanel({ snapshot, actionType, reason, dependencies }) {
  const currentCtx = activeReviewAIContext;
  if (!currentCtx) return;

  const { cardSessionId } = currentCtx;
  const attemptId = generateId();

  // Закрываем предыдущую панель если была
  closeSenseiPanel();

  _previousFocus = document.activeElement;

  // Проверяем согласие на передачу данных в AI
  const state = dependencies?.state;
  const aiSettings = dependencies?.getAISettings ? dependencies.getAISettings() : state?.settings;
  const privacySaver = dependencies?.acceptAIPrivacy || dependencies?.save;

  const accepted = await ensureAIPrivacyDisclosure(state, privacySaver);
  if (!accepted) return;

  // Async race: убедимся что карточка не сменилась пока шёл privacy modal
  const ctxAfterPrivacy = activeReviewAIContext;
  if (!ctxAfterPrivacy || ctxAfterPrivacy.cardSessionId !== cardSessionId) return;

  // Обновляем attemptId в контексте
  setActiveReviewAIContext({ ...ctxAfterPrivacy, attemptId, quizAnswers: {} });

  // Создаём panel skeleton
  const overlay = el('div', { className: 'srp-overlay', id: 'srp-overlay' });
  const panelContainer = el('div', { className: 'srp-container' });
  overlay.append(panelContainer);
  document.body.append(overlay);
  _currentPanel = overlay;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSenseiPanel();
  });

  setLoading(panelContainer, true);

  const localDiagnosis = actionType !== 'mnemonic' ? diagnoseReviewError(snapshot) : null;
  const actionReason = reason || (actionType === 'explain_more' ? 'slow_answer' : 'error');
  const input = buildSenseiActionInput(snapshot, actionType, localDiagnosis, actionReason);

  const doRequest = async () => {
    // Race check
    const ctx = activeReviewAIContext;
    if (!ctx || ctx.cardSessionId !== cardSessionId || ctx.attemptId !== attemptId) {
      return;
    }

    panelContainer.innerHTML = '';
    setLoading(panelContainer, true);

    try {
      const apiKey = getOpenRouterKey();
      if (!apiKey && !dependencies?.aiRequest) {
        setLoading(panelContainer, false);
        showErrorInContainer(panelContainer, 'API-ключ OpenRouter не указан', null);
        const settingsBtn = el('button', {
          type: 'button',
          className: 'btn-ghost',
          text: '⚙️ Открыть настройки',
        });
        settingsBtn.addEventListener('click', () => {
          dependencies?.nav?.('settings');
          closeSenseiPanel();
        });
        panelContainer.append(settingsBtn);
        return;
      }

      const request =
        dependencies?.aiRequest || createAIRequestClient(aiSettings || state?.settings);
      const handler = actionType === 'mnemonic' ? handleCreateMnemonic : handleExplainReviewError;

      const result = await handler({ input, context: null, request });

      // Final race check
      const finalCtx = activeReviewAIContext;
      if (
        !finalCtx ||
        finalCtx.cardSessionId !== cardSessionId ||
        finalCtx.attemptId !== attemptId
      ) {
        return;
      }

      setLoading(panelContainer, false);

      if (result.success) {
        const panel = buildPanel({
          artifact: result.artifact,
          actionType,
          snapshot,
          dependencies,
          cardSessionId,
          attemptId,
        });
        panelContainer.append(panel);
        // Фокус на панель для a11y
        panel.setAttribute('tabindex', '-1');
        panel.focus();
      } else {
        showErrorInContainer(
          panelContainer,
          result.fallbackText || 'Не удалось получить ответ',
          doRequest
        );
      }
    } catch (err) {
      const finalCtx = activeReviewAIContext;
      if (
        !finalCtx ||
        finalCtx.cardSessionId !== cardSessionId ||
        finalCtx.attemptId !== attemptId
      ) {
        return;
      }
      setLoading(panelContainer, false);
      showErrorInContainer(panelContainer, err.message || 'Ошибка сети', doRequest);
    }
  };

  await doRequest();
}

// ---------------------------------------------------------------------------
// Post-review helper — ЕДИНАЯ точка рендера кнопок Сенсея
// ---------------------------------------------------------------------------

/**
 * Рендерит кнопки AI Сенсея в контейнере #review-feedback-actions или #sensei-post-review-actions.
 *
 * @param {object} params
 * @param {import('../../src/ai/review-attempt-schema.js').ReviewAttemptSnapshot} params.snapshot
 * @param {string} params.cardSessionId — UUID показа карточки
 * @param {object} params.dependencies
 */
export function renderPostReviewSenseiActions({
  snapshot,
  cardSessionId: _cardSessionId,
  dependencies,
}) {
  if (!snapshot) return;

  const decision = shouldShowSenseiAction(snapshot);
  if (!decision.show || !decision.actions.length) return;

  // Находим или создаём якорь #review-feedback-actions
  let container = document.getElementById('review-feedback-actions');
  if (!container) {
    let persistentWrap = document.getElementById('sensei-post-review-actions');
    if (!persistentWrap) {
      const srsScreen = document.getElementById('screen-srs');
      if (srsScreen) {
        persistentWrap = el('div', {
          id: 'sensei-post-review-actions',
          className: 'sensei-post-review-actions',
        });
        srsScreen.append(persistentWrap);
      } else {
        const flashWrap = document.querySelector('.flash-wrap');
        if (!flashWrap) return;
        persistentWrap = el('div', {
          id: 'review-feedback-actions',
          className: 'review-feedback-actions',
        });
        flashWrap.append(persistentWrap);
      }
    }
    container = persistentWrap;
  }

  // Очищаем предыдущие кнопки
  container.innerHTML = '';

  const senseiRow = el('div', { className: 'srp-actions-row' });
  senseiRow.append(el('span', { className: 'srp-actions-label', text: '🦊 AI Сенсей:' }));

  decision.actions.forEach(({ actionType, reason, label }) => {
    const btn = el('button', {
      type: 'button',
      className: 'srp-action-btn',
      text: label,
      attrs: { 'data-action': actionType, 'data-reason': reason || '' },
    });
    btn.addEventListener('click', () => {
      openSenseiPanel({ snapshot, actionType, reason, dependencies });
    });
    senseiRow.append(btn);
  });

  container.append(senseiRow);
}

/**
 * Очищает контейнеры кнопок AI Сенсея.
 */
export function clearPostReviewSenseiActions() {
  document.getElementById('sensei-post-review-actions')?.replaceChildren();
  document.getElementById('review-feedback-actions')?.replaceChildren();
}

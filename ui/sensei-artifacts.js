import { getCorrectOptionIndex } from '../src/ai/schemas.js';

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  for (const [name, value] of Object.entries(options.attrs || {})) {
    if (value !== null && value !== undefined) node.setAttribute(name, String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function tokenKey(sentenceId, index) {
  return `${sentenceId}:${index}`;
}

function renderExamples(examples = []) {
  if (!examples.length) return null;
  const section = el('section', { className: 'sensei-examples' });
  section.append(el('h4', { text: 'Примеры' }));
  for (const example of examples) {
    const item = el('div', { className: 'sensei-example' });
    item.append(el('strong', { text: example.japanese }));
    if (example.reading) item.append(el('span', { className: 'muted', text: example.reading }));
    item.append(el('span', { text: example.translation }));
    section.append(item);
  }
  return section;
}

function renderQuiz(quiz, { messageId, onAnswer }) {
  if (!Array.isArray(quiz?.questions) || !quiz.questions.length) return null;
  const section = el('section', {
    className: 'sensei-quiz',
    attrs: { 'data-testid': 'sensei-inline-quiz' },
  });
  section.append(el('h4', { text: 'Проверьте себя' }));
  quiz.questions.forEach((question, questionIndex) => {
    if (!question || typeof question !== 'object' || !Array.isArray(question.options)) return;
    const card = el('fieldset', { className: 'sensei-quiz-question' });
    card.append(el('legend', { text: `${questionIndex + 1}. ${question.prompt || ''}` }));
    const correctIndex = getCorrectOptionIndex(question);
    question.options.forEach((option, optionIndex) => {
      if (!option || typeof option !== 'object') return;
      const button = el('button', {
        className: 'sensei-quiz-option',
        text: option.text || '',
        attrs: { type: 'button' },
      });
      if (question.selectedIndex !== null && question.selectedIndex !== undefined) {
        button.disabled = true;
        if (optionIndex === correctIndex) button.classList.add('correct');
        if (optionIndex === question.selectedIndex && optionIndex !== correctIndex) {
          button.classList.add('incorrect');
        }
      }
      button.addEventListener('click', () => onAnswer?.(messageId, question.id, optionIndex));
      card.append(button);
    });
    if (question.selectedIndex !== null && question.selectedIndex !== undefined) {
      card.append(
        el('p', {
          className: question.answeredCorrectly ? 'quiz-result correct' : 'quiz-result incorrect',
          text: `${question.answeredCorrectly ? '✓ Правильно' : '✗ Неверно'}\n${question.explanation || ''}`,
        })
      );
    }
    section.append(card);
  });
  return section;
}

function showTokenCard(anchor, { token, sentence, message, key, onExplain, onAdd }) {
  document.querySelectorAll('.sensei-token-popover').forEach((popover) => popover.remove());
  const popover = el('div', {
    className: 'sensei-token-popover',
    attrs: { role: 'dialog', 'aria-label': 'Информация о слове' },
  });
  popover.append(
    el('strong', { text: token.kanji || token.writing }),
    token.writing && token.writing !== token.kanji
      ? el('span', { className: 'muted', text: token.writing })
      : null,
    el('span', { text: token.translation || token.type || 'Без перевода' })
  );
  if (token.dictionaryForm) {
    popover.append(
      el('small', { text: 'Словарная форма:' }),
      el('span', {
        text: `${token.dictionaryForm}${token.dictionaryReading ? `【${token.dictionaryReading}】` : ''}${token.dictionaryMeaning ? ` — ${token.dictionaryMeaning}` : ''}`,
      })
    );
  }
  const actions = el('div', { className: 'sensei-token-actions' });
  const explain = el('button', {
    text: token.type?.toLowerCase().includes('particle') ? 'Объяснить употребление' : 'Объяснить',
    attrs: { type: 'button' },
  });
  explain.addEventListener('click', () => {
    popover.remove();
    onExplain?.(token);
  });
  const add = el('button', {
    text: message.context?.dictionaryTokens?.[key] ? '✓ Уже в словаре' : 'Добавить в словарь',
    attrs: { type: 'button' },
  });
  add.addEventListener('click', () => {
    popover.remove();
    onAdd?.({ token, sentence, message, key, opener: anchor });
  });
  actions.append(explain, add);
  popover.append(actions);
  anchor.after(popover);
  requestAnimationFrame(() => {
    const close = (event) => {
      if (!popover.contains(event.target) && event.target !== anchor) {
        popover.remove();
        document.removeEventListener('pointerdown', close, true);
      }
    };
    document.addEventListener('pointerdown', close, true);
  });
}

function renderStory(artifact, options) {
  const section = el('section', {
    className: 'sensei-story',
    attrs: { 'data-testid': 'sensei-story-artifact' },
  });
  const sentences = Array.isArray(artifact?.story) ? artifact.story : [];
  let lastSpeaker = null;

  for (const sentence of sentences) {
    if (!sentence) continue;
    const article = el('article', { className: 'sensei-story-sentence' });
    const rawSpeaker = (sentence.speaker || '').trim();
    const isNarrator =
      !rawSpeaker ||
      rawSpeaker === 'Рассказчик' ||
      rawSpeaker === 'Narrator' ||
      rawSpeaker === 'Голос';

    if (!isNarrator) {
      if (rawSpeaker !== lastSpeaker) {
        article.append(el('div', { className: 'sensei-story-speaker', text: rawSpeaker }));
        lastSpeaker = rawSpeaker;
      }
    } else {
      lastSpeaker = null;
    }

    const japanese = el('p', { className: 'sensei-story-japanese' });
    const tokens = Array.isArray(sentence.tokens) ? sentence.tokens : [];
    tokens.forEach((token, index) => {
      if (!token) return;
      const punctuation =
        !token.type ||
        /^punctuation$/iu.test(token.type) ||
        /^[。、！？…]+$/u.test(token.kanji || '');
      const tokenNode = el(punctuation ? 'span' : 'button', {
        className: punctuation ? 'sensei-punctuation' : 'sensei-token',
        text: token.kanji || token.writing || '',
        attrs: punctuation ? {} : { type: 'button' },
      });
      if (!punctuation) {
        const key = tokenKey(sentence.sentence_id, index);
        tokenNode.addEventListener('click', () =>
          showTokenCard(tokenNode, {
            token,
            sentence,
            message: options.message,
            key,
            onExplain: options.onExplain,
            onAdd: options.onAddToken,
          })
        );
      }
      japanese.append(tokenNode);
    });
    article.append(japanese, el('p', { className: 'muted', text: sentence.translation || '' }));
    section.append(article);
  }
  const check = el('button', {
    className: 'sensei-story-check',
    text: '▶ Проверить понимание',
    attrs: { type: 'button' },
  });
  check.addEventListener('click', () => options.onCreateStoryQuiz?.(artifact, options.message));
  section.append(check);
  return section;
}

export function renderAssistantArtifact(message, options = {}) {
  const content = el('div', { className: 'msg bot sensei-structured-message' });
  const text = el('div', { className: 'sensei-message-text' });
  text.innerHTML = options.renderMarkdown(message.text || message.artifact?.message || '');
  content.append(text);
  const artifact = message.artifact;
  if (!artifact || typeof artifact !== 'object') return content;
  if (Array.isArray(artifact.examples) && artifact.examples.length) {
    content.append(renderExamples(artifact.examples));
  }
  if (artifact.type === 'story' && Array.isArray(artifact.story)) {
    content.append(renderStory(artifact, { ...options, message }));
  }
  if (
    artifact.quiz &&
    typeof artifact.quiz === 'object' &&
    Array.isArray(artifact.quiz.questions)
  ) {
    content.append(renderQuiz(artifact.quiz, { ...options, messageId: message.id }));
  }
  return content;
}

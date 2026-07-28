// ui/chat.js — AI Сенсей: shell, interaction wiring and safe rendering

import { $, todayStr as getTodayStr } from '../src/utils.js';
import { syncAvatars } from './shared.js';
import { getAvailableChapterCount } from '../src/minigame-word-selectors.js';
import { ensureAIPrivacyDisclosure } from '../src/ai-disclosure.js';
import { UserDictionaryRepository } from '../src/user-dictionaries/repository.js';
import { AI_INTENTS, STARTER_ACTIONS } from '../src/ai/intents.js';
import { createAIRequestClient } from '../src/ai/request-client.js';
import { runSenseiPipeline } from '../src/ai/pipeline.js';
import { PERSONAL_DICTIONARY_ID } from '../src/ai/personal-dictionary.js';
import {
  clearChatHistory,
  createAssistantChatMessage,
  createUserChatMessage,
  formatMessageAsNote,
  markTokenDictionaryEntry,
  normalizeChatHistory,
  updateQuizAnswer,
} from '../src/ai/chat-history.js';
import { renderAssistantArtifact } from './sensei-artifacts.js';
import { openSenseiDictionaryDialog } from './sensei-dictionary.js';
import { findTokenLexemeMatches } from '../src/ai/personal-dictionary.js';

let deps = null;
let chatHistory = [];
let senseiTab = 'chat';
let chatSending = false;

const getToast = () => deps?.toast || globalThis.window?.toast || (() => {});

function escapeHtml(value) {
  const text = String(value ?? '');
  return text.replace(/[&<>"']/gu, (character) => {
    if (character === '&') return '&amp;';
    if (character === '<') return '&lt;';
    if (character === '>') return '&gt;';
    if (character === '"') return '&quot;';
    return '&#39;';
  });
}

function parseTableRow(line, tag) {
  const cells = line
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);
  return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join('')}</tr>`;
}

export function md(text) {
  const codeBlocks = [];
  const preserved = String(text ?? '').replace(/```([\s\S]*?)```/gu, (_, content) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre>${escapeHtml(content.trim())}</pre>`);
    return `KOTOKITSU_CODE_BLOCK_${index}_END`;
  });
  let html = escapeHtml(preserved);
  html = html.replace(/KOTOKITSU_CODE_BLOCK_(\d+)_END/gu, (_, index) => codeBlocks[Number(index)]);
  html = html.replace(/`([^`]+)`/gu, (_, content) => `<code>${escapeHtml(content)}</code>`);
  html = html.replace(/^\s*[-*_]{3,}\s*$/gmu, '<hr>');
  html = html.replace(/^######\s+(.*)$/gmu, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.*)$/gmu, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.*)$/gmu, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.*)$/gmu, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.*)$/gmu, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.*)$/gmu, '<h1>$1</h1>');
  html = html.replace(/^>\s+(.*)$/gmu, '<blockquote>$1</blockquote>');
  html = html.replace(/((?:^\s*\d+\.\s+.*\n?)+)/gmu, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line) => line.replace(/^\s*\d+\.\s+(.*)$/u, '<li>$1</li>'))
      .join('');
    return `<ol>${items}</ol>`;
  });
  html = html.replace(/((?:^\s*[-*]\s+.*\n?)+)/gmu, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line) => line.replace(/^\s*[-*]\s+(.*)$/u, '<li>$1</li>'))
      .join('');
    return `<ul>${items}</ul>`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_, label, url) => {
    const safeUrl = url.trim();
    return /^(?:https?:\/\/|mailto:)/iu.test(safeUrl)
      ? `<a href="${safeUrl}" target="_blank" rel="noopener">${label}</a>`
      : label;
  });
  html = html.replace(/((?:^\|.*\|\n?)+)/gmu, (match) => {
    const lines = match
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2 || !/^\|[-:\s|]+\|$/u.test(lines[1])) return match;
    return `<div class="table-wrap"><table><thead>${parseTableRow(lines[0], 'th')}</thead><tbody>${lines
      .slice(2)
      .map((line) => parseTableRow(line, 'td'))
      .join('')}</tbody></table></div>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/gu, '<b>$1</b>');
  html = html.replace(/\*([^*]+)\*/gu, '<i>$1</i>');
  html = html.replace(/~~([^~]+)~~/gu, '<s>$1</s>');
  const blockTags = /^(<pre>|<h[1-6]>|<hr>|<blockquote>|<ul>|<ol>|<div class="table-wrap">)/u;
  return html
    .split(/\n{2,}/u)
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      return blockTags.test(trimmed) ? trimmed : `<p>${trimmed.replace(/\n/gu, '<br>')}</p>`;
    })
    .join('\n');
}

function starterMarkup() {
  return `
    <section class="sensei-starter" data-testid="sensei-starter">
      <div class="sensei-starter-intro">
        <span aria-hidden="true">🦊</span>
        <div><h2>Чем займёмся?</h2><p>Выберите учебное действие или задайте вопрос своими словами.</p></div>
      </div>
      <div class="sensei-starter-grid">
        ${STARTER_ACTIONS.map(
          (action) => `
            <button type="button" class="sensei-starter-card" data-sensei-action="${action.intent}">
              <span aria-hidden="true">${action.icon}</span>
              <strong>${action.title}</strong>
            </button>`
        ).join('')}
      </div>
    </section>`;
}

function chatShell(isEmpty) {
  return `
    <div class="sensei-chat-toolbar">
      <button type="button" id="sensei-clear-history" ${isEmpty ? 'disabled' : ''}>Очистить историю</button>
    </div>
    <div class="chat-area" id="chat-area" data-testid="chat-area">${isEmpty ? starterMarkup() : ''}</div>
    <div class="sensei-privacy-note">
      🔒 Для генерации ответа текст отправляется провайдеру OpenRouter. Не отправляйте персональные данные.
    </div>
    <div class="chat-input-bar">
      <select id="sensei-action-menu" aria-label="Учебное действие">
        <option value="">Свободный текст</option>
        ${STARTER_ACTIONS.map(
          (action) => `<option value="${action.intent}">${action.title}</option>`
        ).join('')}
      </select>
      <select id="sensei-wordsource-menu" aria-label="Источник слов" title="Источник слов">
        <option value="mixed">Смешанный источник</option>
        <option value="user_dictionary">Мой словарь</option>
        <option value="current_lesson">Текущий урок</option>
        <option value="fsrs_difficult">Трудные слова</option>
        <option value="fsrs_learned">Изученные слова</option>
      </select>
      <input type="text" id="chat-input" class="chat-input" placeholder="質問してください… Задайте вопрос" data-testid="chat-input" />
      <button class="chat-send" id="chat-send" data-testid="chat-send-btn" aria-label="Отправить">➤</button>
    </div>`;
}

function applyExplicitAction(intent) {
  const input = $('#chat-input');
  const action = STARTER_ACTIONS.find((item) => item.intent === intent);
  if (!input || !action) return;
  input.dataset.explicitIntent = intent;
  input.placeholder = action.prompt;
  const menu = $('#sensei-action-menu');
  if (menu) menu.value = intent;
  input.focus();
}

function saveAssistantNote(message, state, dependencies, button) {
  const todayStr = dependencies?.todayStr || getTodayStr;
  const note = formatMessageAsNote(message);
  state.savedNotes ||= [];
  state.savedNotes.unshift({
    id: `n${Date.now()}`,
    title: note.title,
    content: note.content,
    date: todayStr(),
  });
  dependencies.save?.();
  button.textContent = '✓ Сохранено';
  button.disabled = true;
  getToast()('Сохранено в Мини-учебник 📚');
}

function renderUserMessage(message) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap user';
  const bubble = document.createElement('div');
  bubble.className = 'msg user';
  bubble.textContent = message.text;
  wrap.append(bubble);
  return wrap;
}

function prefillFollowup(text, intent) {
  const input = $('#chat-input');
  if (!input) return;
  input.value = text;
  applyExplicitAction(intent);
}

function renderClarification(message) {
  const box = document.createElement('div');
  box.className = 'sensei-clarify-actions';
  [
    [AI_INTENTS.CREATE_STORY, 'Создать историю'],
    [AI_INTENTS.CREATE_QUIZ, 'Создать квиз'],
    [AI_INTENTS.EXPLAIN_WORD, 'Объяснить'],
  ].forEach(([intent, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () =>
      prefillFollowup(message.context?.originalText || '', intent)
    );
    box.append(button);
  });
  return box;
}

function renderAssistantMessage(message, state, dependencies) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap';
  const repository =
    dependencies.userDictionaryRepository ||
    (dependencies.createUserDictionaryRepository?.() ?? new UserDictionaryRepository());
  wrap.append(
    renderAssistantArtifact(message, {
      renderMarkdown: md,
      onAnswer: (messageId, questionId, selectedIndex) => {
        chatHistory = updateQuizAnswer(chatHistory, messageId, questionId, selectedIndex);
        state.chatHistory = chatHistory;
        dependencies.save?.();
        renderSensei(state, dependencies, { autoScroll: false });
      },
      onExplain: (token) => {
        const particle = String(token.type || '')
          .toLowerCase()
          .includes('particle');
        prefillFollowup(
          particle
            ? `Объясни употребление ${token.kanji || token.writing}`
            : `Объясни слово ${token.dictionaryForm || token.kanji || token.writing}`,
          particle ? AI_INTENTS.EXPLAIN_GRAMMAR : AI_INTENTS.EXPLAIN_WORD
        );
      },
      onAddToken: async ({ token, sentence, key, opener }) => {
        const existingId = message.context?.dictionaryTokens?.[key];
        if (existingId) {
          const entry = await repository.getEntry(existingId);
          if (entry) {
            getToast()(`${entry.writing || entry.reading} уже в словаре`);
            return;
          }
          chatHistory = markTokenDictionaryEntry(chatHistory, message.id, key, null);
          state.chatHistory = chatHistory;
          dependencies.save?.();
        }
        try {
          const catalogWords = (dependencies.LESSONS || []).flatMap(
            (lesson) => lesson?.vocab || lesson?.vocabulary || lesson?.words || lesson?.items || []
          );
          const dictionaries = await repository.listDictionaries();
          const userEntries = (
            await Promise.all(
              dictionaries.slice(0, 20).map((dictionary) => repository.listEntries(dictionary.id))
            )
          ).flat();
          const matches = findTokenLexemeMatches(token, catalogWords, userEntries);
          await openSenseiDictionaryDialog({
            repository,
            token,
            sentence,
            opener,
            ...matches,
            onSaved: (entry) => {
              chatHistory = markTokenDictionaryEntry(chatHistory, message.id, key, entry.id);
              state.chatHistory = chatHistory;
              dependencies.save?.();
              renderSensei(state, dependencies);
            },
            onOpenExisting: (entry) => {
              getToast()(`Найдено: ${entry.writing || entry.reading}`);
              dependencies.nav?.('user-dictionaries', {
                dictionaryId: entry.dictionaryId,
                entryId: entry.id,
                search: entry.writing,
              });
            },
          });
        } catch (error) {
          getToast()(`⚠️ ${error.message}`);
        }
      },
      onCreateStoryQuiz: (storyArtifact, storyMessage) => {
        const sentences = (storyArtifact?.story || []).map((s) => ({
          japanese: (s.tokens || []).map((t) => t.kanji || t.writing || '').join(''),
          translation: s.translation || '',
        }));
        const storyContext = {
          storyMessageId: storyMessage?.id || null,
          sentences,
        };
        const input = $('#chat-input');
        if (input) {
          input.value = `Создай квиз на понимание истории из ${sentences.length} предложений`;
          input.dataset.explicitIntent = AI_INTENTS.CREATE_QUIZ;
          input.dataset.storyContext = JSON.stringify(storyContext);
          sendChat(state, dependencies);
        }
      },
    })
  );
  if (message.context?.clarify) wrap.append(renderClarification(message));
  if (message.type !== 'error') {
    const saveButton = document.createElement('button');
    saveButton.className = 'save-note-btn';
    saveButton.dataset.testid = 'save-note-btn';
    saveButton.textContent = '＋ Сохранить в учебник';
    saveButton.addEventListener('click', () =>
      saveAssistantNote(message, state, dependencies, saveButton)
    );
    wrap.append(saveButton);
  }
  return wrap;
}

function renderMessages(state, dependencies, renderOptions = {}) {
  const area = $('#chat-area');
  if (!area || !chatHistory.length) return;
  const targetScrollTop = renderOptions.savedScrollTop ?? area.scrollTop;
  area.replaceChildren();
  for (const message of chatHistory) {
    area.append(
      message.role === 'user'
        ? renderUserMessage(message)
        : renderAssistantMessage(message, state, dependencies)
    );
  }
  requestAnimationFrame(() => {
    if (renderOptions.autoScroll === false) {
      area.scrollTop = targetScrollTop;
    } else {
      area.scrollTop = area.scrollHeight;
    }
  });
}

export function renderSensei(state, dependencies = {}, renderOptions = {}) {
  deps = dependencies;
  chatHistory = normalizeChatHistory(state?.chatHistory || chatHistory);
  if (state) state.chatHistory = chatHistory;

  const existingArea = $('#chat-area');
  const savedScrollTop = existingArea ? existingArea.scrollTop : 0;

  const selectAll =
    dependencies.$$ ||
    globalThis.window?.$$ ||
    ((selector) => [...document.querySelectorAll(selector)]);
  selectAll('[data-senseitab]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.senseitab === senseiTab);
    tab.onclick = () => {
      senseiTab = tab.dataset.senseitab;
      renderSensei(state, dependencies);
    };
  });
  if (senseiTab === 'tools') {
    renderSenseiTools(state, dependencies);
    return;
  }
  const body = $('#sensei-body');
  if (!body) return;
  body.innerHTML = chatShell(chatHistory.length === 0);
  renderMessages(state, dependencies, { savedScrollTop, ...renderOptions });
  document.querySelectorAll('[data-sensei-action]').forEach((button) => {
    button.addEventListener('click', () => applyExplicitAction(button.dataset.senseiAction));
  });
  $('#sensei-action-menu')?.addEventListener('change', (event) => {
    const input = $('#chat-input');
    if (!input) return;
    if (event.target.value) applyExplicitAction(event.target.value);
    else {
      delete input.dataset.explicitIntent;
      input.placeholder = '質問してください… Задайте вопрос';
    }
  });
  const wordSourceMenu = $('#sensei-wordsource-menu');
  if (wordSourceMenu) {
    wordSourceMenu.addEventListener('change', () => {
      wordSourceMenu.dataset.explicit = 'true';
    });
    const repository =
      dependencies.userDictionaryRepository ||
      (dependencies.createUserDictionaryRepository?.() ?? new UserDictionaryRepository());
    Promise.resolve(repository.listDictionaries())
      .then((dictionaries) => {
        if (!dictionaries || !dictionaries.length) return;
        const extraDicts = dictionaries.filter((d) => d.id !== PERSONAL_DICTIONARY_ID);
        if (extraDicts.length > 0) {
          const selectedValue = wordSourceMenu.value;
          const isExplicit = wordSourceMenu.dataset.explicit;
          wordSourceMenu.innerHTML = `
          <option value="mixed">Смешанный источник</option>
          <option value="${PERSONAL_DICTIONARY_ID}">Мой словарь</option>
          ${extraDicts.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
          <option value="current_lesson">Текущий урок</option>
          <option value="fsrs_difficult">Трудные слова</option>
          <option value="fsrs_learned">Изученные слова</option>
        `;
          if (selectedValue) wordSourceMenu.value = selectedValue;
          if (isExplicit) wordSourceMenu.dataset.explicit = isExplicit;
        }
      })
      .catch(() => {});
  }
  $('#chat-send').onclick = () => sendChat(state, dependencies);
  $('#chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendChat(state, dependencies);
  });
  $('#sensei-clear-history').addEventListener('click', () => {
    if (!globalThis.window?.confirm?.('Очистить всю историю AI Сенсея?')) return;
    chatHistory = clearChatHistory();
    state.chatHistory = chatHistory;
    dependencies.save?.();
    renderSensei(state, dependencies);
  });
  syncAvatars();
}

function typingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap';
  wrap.innerHTML = '<div class="msg bot"><div class="typing"><i></i><i></i><i></i></div></div>';
  $('#chat-area')?.append(wrap);
  return wrap;
}

function setChatDisabled(disabled) {
  const send = $('#chat-send');
  const input = $('#chat-input');
  if (send) send.disabled = disabled;
  if (input) input.disabled = disabled;
}

export async function sendChat(state, dependencies = {}) {
  if (chatSending) {
    getToast()('⏳ Дождитесь ответа на предыдущий вопрос');
    return;
  }
  const input = $('#chat-input');
  const text = input?.value.trim();
  if (!text) return;
  if (!state.settings?.openrouterKey && !dependencies.aiRequest) {
    getToast()('⚠️ Укажите API-ключ OpenRouter в настройках');
    return;
  }
  const accepted = await ensureAIPrivacyDisclosure(state, dependencies.save);
  if (!accepted) return;
  const explicitIntent = input.dataset.explicitIntent || null;
  let storyContext = null;
  if (input.dataset.storyContext) {
    try {
      storyContext = JSON.parse(input.dataset.storyContext);
    } catch (error) {
      void error;
    }
    delete input.dataset.storyContext;
  }
  const wordSourceSelect = $('#sensei-wordsource-menu');
  const rawValue = wordSourceSelect?.value || 'mixed';
  const isExplicit =
    wordSourceSelect?.dataset.explicit === 'true' ||
    (rawValue !== 'mixed' && rawValue !== 'user_dictionary');

  let wordSource = rawValue;
  let dictionaryId = null;
  if (rawValue === 'user_dictionary' || rawValue === PERSONAL_DICTIONARY_ID) {
    wordSource = 'user_dictionary';
    dictionaryId = PERSONAL_DICTIONARY_ID;
  } else if (rawValue.startsWith('user-dict:')) {
    wordSource = 'user_dictionary';
    dictionaryId = rawValue;
  }

  input.value = '';
  chatSending = true;
  chatHistory.push(createUserChatMessage(text, explicitIntent));
  state.chatHistory = chatHistory;
  renderSensei(state, dependencies);
  const typing = typingIndicator();
  setChatDisabled(true);
  try {
    const request = dependencies.aiRequest || createAIRequestClient(state.settings);
    const repository =
      dependencies.userDictionaryRepository ||
      (dependencies.createUserDictionaryRepository?.() ?? new UserDictionaryRepository());
    const result = await runSenseiPipeline({
      text,
      explicitIntent,
      state,
      lessons: dependencies.LESSONS || [],
      repository,
      request,
      overrides: {
        wordSource,
        ...(dictionaryId ? { dictionaryId } : {}),
        wordSourceExplicit: isExplicit,
        ...(storyContext ? { storyContext } : {}),
      },
    });
    let assistant;
    if (result.status === 'clarify') {
      assistant = createAssistantChatMessage({
        text: result.intentResult.question || 'Что сделать со словами?',
        intent: AI_INTENTS.CLARIFY_REQUEST,
        type: 'explanation',
        context: { clarify: true, originalText: text, missing: result.intentResult.missing },
      });
    } else if (result.status === 'success') {
      assistant = createAssistantChatMessage({
        text: result.artifact.message,
        intent: result.intentResult.intent,
        type: result.artifact.type,
        artifact: result.artifact,
        context: {
          jlptTarget: result.context.jlptTarget || null,
          wordTokens: result.context.words?.map((word) => word.token) || [],
        },
      });
    } else {
      assistant = createAssistantChatMessage({
        text: result.text,
        intent: result.intentResult?.intent,
        type: 'error',
      });
    }
    chatHistory.push(assistant);
  } catch (error) {
    chatHistory.push(
      createAssistantChatMessage({
        text: `⚠️ ${error.message}`,
        type: 'error',
      })
    );
  } finally {
    typing.remove();
    state.chatHistory = chatHistory;
    await dependencies.save?.();
    chatSending = false;
    renderSensei(state, dependencies);
    setChatDisabled(false);
  }
}

function renderSenseiTools(state, dependencies) {
  const body = $('#sensei-body');
  const toast = dependencies?.toast || globalThis.window?.toast || (() => {});
  const nav = dependencies?.nav || globalThis.window?.nav || (() => {});
  const availableLessons = getAvailableChapterCount(state);
  const crosswordUnlocked = availableLessons >= 3;
  body.innerHTML = `
    <div class="sensei-tools-list">
      <button type="button" class="tool-card" data-nav="ai-story">
        <span class="tool-icon">✨</span><span class="tool-info"><strong>AI-история</strong><small>Старый генератор остаётся доступен</small></span><span class="tool-arrow">›</span>
      </button>
      <button type="button" class="tool-card ${crosswordUnlocked ? '' : 'tool-locked'}" data-nav="crossword" data-locked="${!crosswordUnlocked}">
        <span class="tool-icon">🧩</span><span class="tool-info"><strong>Кроссворд</strong><small>${crosswordUnlocked ? 'Закрепляйте изученные слова' : 'Откроется после 3 глав'}</small></span><span>${crosswordUnlocked ? '›' : '🔒'}</span>
      </button>
      <button type="button" class="tool-card" data-nav="word-search" data-testid="tool-card-word-search">
        <span class="tool-icon">🔍</span><span class="tool-info"><strong>Охота на слова</strong><small>Поиск слов в сетке</small></span><span class="tool-arrow">›</span>
      </button>
    </div>`;
  body.querySelectorAll('.tool-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.dataset.locked === 'true') {
        toast('🔒 Кроссворды откроются после изучения или начала 3 глав!');
        return;
      }
      nav(card.dataset.nav);
    });
  });
}

export function setChatHistory(history) {
  chatHistory = normalizeChatHistory(history);
}

export function setSenseiTab(tab) {
  senseiTab = tab;
}

export function getChatHistory() {
  return chatHistory;
}

export function getSenseiTab() {
  return senseiTab;
}

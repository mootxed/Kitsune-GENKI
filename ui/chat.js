// ui/chat.js - Модуль AI-чата с сенсеем

import { $, todayStr as getTodayStr } from '../src/utils.js';
import { syncAvatars } from './shared.js';
import { API } from '../services.js';

// Локальный контекст зависимостей
let deps = null;

// Глобальные переменные модуля
let chatHistory = [];
let senseiTab = 'chat';
let chatSending = false;

// Функция рендеринга главного экрана сенсея
export function renderSensei(state, dependencies) {
  if (dependencies) deps = dependencies;
  const { CHECK_ITEMS, save, todayStr } = deps;
  const $$ = deps?.$$ || window.$$ || ((s) => Array.from(document.querySelectorAll(s)));
  const toast = deps?.toast || window.toast || (() => {});
  const nav = deps?.nav || window.nav || (() => {});
  const markActivity = deps?.markActivity || window.markActivity || ((toastFn) => {});

  $$('[data-senseitab]').forEach((t) => {
    t.classList.toggle('active', t.dataset.senseitab === senseiTab);
    t.onclick = () => {
      senseiTab = t.dataset.senseitab;
      renderSensei(state, deps);
    };
  });

  const body = $('#sensei-body');

  if (senseiTab === 'tools') {
    renderSenseiTools(state, dependencies);
    return;
  }

  body.innerHTML = `
    <div class="chat-area" id="chat-area" data-testid="chat-area"></div>
    <div class="chat-input-bar">
      <input type="text" id="chat-input" class="chat-input" placeholder="質問してください… Задайте вопрос" data-testid="chat-input" />
      <button class="chat-send" id="chat-send" data-testid="chat-send-btn" aria-label="Отправить">➤</button>
    </div>
  `;

  const area = $('#chat-area');
  if (chatHistory.length === 0) {
    addBotMessage(
      'こんにちは！Я — Kitsune Sensei 🦊 Спросите что угодно про японский язык или учебник Genki!',
      state,
      dependencies
    );
  } else {
    chatHistory.forEach((msg) => {
      if (msg.role === 'user') {
        const wrap = document.createElement('div');
        wrap.className = 'msg-wrap user';
        wrap.innerHTML = `<div class="msg user">${escapeHtml(msg.content)}</div>`;
        area.appendChild(wrap);
      } else if (msg.role === 'assistant') {
        addBotMessage(msg.content, state, dependencies, false);
      }
    });
    requestAnimationFrame(() => (area.scrollTop = area.scrollHeight));
  }

  $('#chat-send').onclick = () => sendChat(state, dependencies);
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat(state, dependencies);
  });

  syncAvatars();
}

// Функция рендеринга вкладки инструментов
function renderSenseiTools(state, dependencies) {
  const { CHECK_ITEMS } = dependencies;
  const body = $('#sensei-body');

  const inputBar = body.querySelector('.chat-input-bar');
  if (inputBar) {
    inputBar.remove();
  }

  const startedLessons = Object.keys(state.chapters).filter((id) => {
    return state.chapters[id].started === true;
  }).length;
  const crosswordUnlocked = startedLessons >= 3;

  body.innerHTML = `
  <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
    <!-- AI Сенсей (бывший AI-история) -->
    <div class="tool-card" data-nav="ai-story">
      <span class="tool-icon">✨</span>
      <div class="tool-info">
        <h3>AI Сенсей</h3>
        <p>Генерируйте интерактивные истории на основе ваших слабых слов</p>
      </div>
      <span class="tool-arrow">›</span>
    </div>

    <!-- Кроссворд -->
    <div class="tool-card ${crosswordUnlocked ? '' : 'tool-locked'}" data-nav="crossword" data-locked="${!crosswordUnlocked}">
      <span class="tool-icon">🧩</span>
      <div class="tool-info">
        <h3>Кроссворд</h3>
        <p>${crosswordUnlocked ? 'Закрепляйте изученные слова в игровой форме' : '🔒 Откроется после начала 3 глав'}</p>
      </div>
      <span class="${crosswordUnlocked ? 'tool-arrow' : 'tool-lock'}">${crosswordUnlocked ? '›' : '🔒'}</span>
    </div>
  </div>
  `;

  body.querySelectorAll('.tool-card').forEach((card) => {
    card.onclick = () => {
      const targetNav = card.dataset.nav;
      const isLocked = card.dataset.locked === 'true';

      if (isLocked) {
        toast('🔒 Кроссворды откроются после начала 3 глав!');
        return;
      }

      nav(targetNav);
    };
  });
}

// Функция экранирования HTML
function escapeHtml(s) {
  var a = String.fromCharCode(38);
  return s.replace(/[&<>"']/g, function (c) {
    if (c === '&') return a + 'amp;';
    if (c === '<') return a + 'lt;';
    if (c === '>') return a + 'gt;';
    if (c === '"') return a + 'quot;';
    if (c === "'") return a + '#39;';
    return c;
  });
}

// Функция парсинга Markdown
function md(text) {
  const codeBlocks = [];
  const preserved = text.replace(/```([\s\S]*?)```/g, (_, c) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre>${escapeHtml(c.trim())}</pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });
  let h = escapeHtml(preserved);
  h = h.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx, 10)]);
  h = h.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  h = h.replace(/^\s*[-*_]{3,}\s*$/gm, '<hr>');
  h = h.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>');
  h = h.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>');
  h = h.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
  h = h.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
  h = h.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
  h = h.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
  h = h.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/((?:^\s*\d+\.\s+.*\n?)+)/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line) => line.replace(/^\s*\d+\.\s+(.*)$/, '<li>$1</li>'))
      .join('');
    return '<ol>' + items + '</ol>';
  });
  h = h.replace(/((?:^\s*[-*]\s+.*\n?)+)/gm, (match) => {
    const items = match
      .trim()
      .split('\n')
      .map((line) => line.replace(/^\s*[-*]\s+(.*)$/, '<li>$1</li>'))
      .join('');
    return '<ul>' + items + '</ul>';
  });
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/((?:^\|.*\|\n?)+)/gm, (match) => {
    const lines = match
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length < 2) return match;
    const sep = lines[1];
    if (!/^\|[-:\s|]+\|$/.test(sep)) return match;
    const header = parseTableRow(lines[0], 'th');
    const body = lines
      .slice(2)
      .map((l) => parseTableRow(l, 'td'))
      .join('');
    return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
  });
  function parseTableRow(line, tag) {
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c);
    return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
  }
  h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  h = h.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  h = h.replace(/\n{2,}/g, '\n\n');
  const parts = h.split(/\n{2,}/);
  const blockTags = /^(<pre>|<h[1-6]>|<hr>|<blockquote>|<ul>|<ol>|<div class="table-wrap">)/;
  const out = parts
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      if (blockTags.test(trimmed)) return trimmed;
      return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
    })
    .join('\n');
  return out;
}

// Функция добавления сообщения бота
function addBotMessage(content, state, dependencies, saveable = true) {
  const { save } = dependencies;
  // Fallback: deps могут не содержать todayStr — берём утилиту напрямую
  const todayStr = dependencies?.todayStr || getTodayStr;

  const area = $('#chat-area');
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap';
  wrap.innerHTML = `<div class="msg bot">${md(content)}</div>`;
  if (saveable) {
    const btn = document.createElement('button');
    btn.className = 'save-note-btn';
    btn.textContent = '＋ Сохранить в учебник';
    btn.dataset.testid = 'save-note-btn';
    btn.onclick = () => {
      const title = content.replace(/[#*`]/g, '').split('\n')[0].slice(0, 48) || 'Заметка AI';
      state.savedNotes.unshift({ id: 'n' + Date.now(), title, content, date: todayStr() });
      save();
      btn.textContent = '✓ Сохранено';
      btn.disabled = true;
      toast('Сохранено в Мини-учебник 📚');
    };
    wrap.appendChild(btn);
  }
  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
}

// Функция добавления сообщения пользователя
function addUserMessage(text) {
  const area = $('#chat-area');
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap user';
  wrap.innerHTML = `<div class="msg user">${escapeHtml(text)}</div>`;
  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
}

// Функция отправки сообщения в чат
async function sendChat(state, dependencies) {
  const { save } = dependencies;

  if (chatSending) {
    toast('⏳ Дождитесь ответа на предыдущий вопрос');
    return;
  }

  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  if (!state.settings.openrouterKey) {
    toast('⚠️ Укажите API-ключ OpenRouter в настройках');
    return;
  }

  chatSending = true;
  addUserMessage(text);
  chatHistory.push({ role: 'user', content: text });
  const area = $('#chat-area');
  const t = document.createElement('div');
  t.className = 'msg-wrap';
  t.innerHTML = `<div class="msg bot"><div class="typing"><i></i><i></i><i></i></div></div>`;
  area.appendChild(t);
  area.scrollTop = area.scrollHeight;
  $('#chat-send').disabled = true;
  $('#chat-input').disabled = true;
  try {
    const reply = await API.askSensei(chatHistory, state.settings);
    chatHistory.push({ role: 'assistant', content: reply });
    t.remove();
    addBotMessage(reply, state, dependencies, true);
    markActivity(deps?.toast || window.toast);
  } catch (e) {
    t.remove();
    addBotMessage('⚠️ ' + e.message, state, dependencies, false);
  } finally {
    state.chatHistory = chatHistory;
    save();
    $('#chat-send').disabled = false;
    $('#chat-input').disabled = false;
    chatSending = false;
  }
}

// Экспорт функций для установки глобальных переменных
export function setChatHistory(history) {
  chatHistory = history;
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

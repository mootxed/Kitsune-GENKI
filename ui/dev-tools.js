// ui/dev-tools.js - Модуль интерфейса инструментов разработчика

import { $ } from '../src/utils.js';
import {
  getLogs,
  clearLogs,
  downloadLogsAsText,
  copyLogsToClipboard,
  generateDiagnosticReport,
  copyDiagnosticReportToClipboard,
  downloadDiagnosticReportAsText,
  setDevModeEnabled,
} from '../src/dev-tools.js';

let currentFilter = 'ALL';
let currentSearch = '';

export function renderDevTools(state, dependencies = {}) {
  const toast = dependencies?.toast || window.toast || (() => {});
  const container = $('#dev-tools-body');
  if (!container) return;

  container.innerHTML = `
    <div class="set-group" style="margin-bottom: 12px;">
      <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="dev-tools-toolbar">
        <button class="btn-ghost" id="btn-copy-logs" data-testid="dev-copy-logs-btn" style="flex: 1; min-width: 140px;">📋 Скопировать все логи</button>
        <button class="btn-ghost" id="btn-download-logs" data-testid="dev-download-logs-btn" style="flex: 1; min-width: 140px;">📥 Скачать журнал (.txt)</button>
        <button class="btn-ghost" id="btn-clear-logs" data-testid="dev-clear-logs-btn" style="color: var(--danger, #ff4d4f);">🗑️ Очистить журнал</button>
        <button class="btn-ghost" id="btn-refresh-logs" data-testid="dev-refresh-logs-btn">🔄 Обновить</button>
      </div>
    </div>

    <div class="set-group" style="margin-bottom: 12px;">
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 8px;">
        <button class="btn-ghost dev-filter-btn ${currentFilter === 'ALL' ? 'active-filter' : ''}" data-filter="ALL">Все</button>
        <button class="btn-ghost dev-filter-btn ${currentFilter === 'INFO' ? 'active-filter' : ''}" data-filter="INFO" style="color: var(--info, #3b82f6);">INFO</button>
        <button class="btn-ghost dev-filter-btn ${currentFilter === 'WARN' ? 'active-filter' : ''}" data-filter="WARN" style="color: var(--warning, #f59e0b);">WARN</button>
        <button class="btn-ghost dev-filter-btn ${currentFilter === 'ERROR' ? 'active-filter' : ''}" data-filter="ERROR" style="color: var(--danger, #ef4444);">ERROR</button>
        <button class="btn-ghost dev-filter-btn ${currentFilter === 'LOG' ? 'active-filter' : ''}" data-filter="LOG">LOG</button>
      </div>
      <input type="text" id="dev-search-input" value="${currentSearch}" placeholder="🔍 Поиск по логам..." style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border, #ccc); background: var(--bg-card, #fff); color: var(--text-color, #333);" />
    </div>

    <div class="set-group" style="margin-bottom: 16px;">
      <div class="set-item" style="padding: 0;">
        <label style="padding: 12px 12px 6px; font-weight: bold;">📟 Журнал логов</label>
        <div id="dev-logs-container" style="max-height: 420px; overflow-y: auto; padding: 8px; background: var(--bg-secondary, rgba(0,0,0,0.03)); border-radius: 8px; font-family: monospace; font-size: 12px;">
          <!-- Логи рендерятся тут -->
        </div>
      </div>
    </div>

    <div class="set-group" style="margin-bottom: 16px;">
      <div class="set-item">
        <label style="font-weight: bold; margin-bottom: 8px; display: block;">📊 Диагностика и статус системы</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
          <button class="btn-ghost" id="btn-copy-report" data-testid="dev-copy-report-btn" style="flex: 1; min-width: 160px;">📋 Скопировать диагностический отчёт</button>
          <button class="btn-ghost" id="btn-download-report" data-testid="dev-download-report-btn" style="flex: 1; min-width: 160px;">📥 Экспортировать диагностику (.txt)</button>
        </div>
        <pre id="dev-diagnostic-preview" style="max-height: 240px; overflow-y: auto; padding: 10px; background: var(--bg-card, #fff); border: 1px solid var(--border, #ddd); border-radius: 8px; font-size: 11px; white-space: pre-wrap; line-height: 1.5;"></pre>
      </div>
    </div>

    <div class="set-group" style="margin-bottom: 24px;">
      <div class="set-item row-between">
        <div>
          <label style="margin:0;">🛠️ Режим разработчика</label>
          <div class="set-hint">Отключить инструменты разработчика в настройках</div>
        </div>
        <button class="btn-ghost" id="btn-disable-dev-mode" style="color: var(--danger, #ff4d4f);">Отключить</button>
      </div>
    </div>
    <div class="bottom-pad"></div>
  `;

  renderLogsList();
  renderDiagnosticPreview(state);

  // Bind toolbar listeners
  $('#btn-copy-logs')?.addEventListener('click', async () => {
    await copyLogsToClipboard();
    toast('📋 Логи скопированы в буфер обмена');
  });

  $('#btn-download-logs')?.addEventListener('click', () => {
    downloadLogsAsText();
    toast('📥 Журнал логов скачан');
  });

  $('#btn-clear-logs')?.addEventListener('click', () => {
    clearLogs();
    renderLogsList();
    toast('🗑️ Журнал логов очищен');
  });

  $('#btn-refresh-logs')?.addEventListener('click', () => {
    renderLogsList();
    renderDiagnosticPreview(state);
    toast('🔄 Отображение обновлено');
  });

  // Filter buttons
  container.querySelectorAll('.dev-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container
        .querySelectorAll('.dev-filter-btn')
        .forEach((b) => b.classList.remove('active-filter'));
      btn.classList.add('active-filter');
      currentFilter = btn.dataset.filter;
      renderLogsList();
    });
  });

  // Search input
  const searchInput = $('#dev-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderLogsList();
    });
  }

  // Diagnostic buttons
  $('#btn-copy-report')?.addEventListener('click', async () => {
    await copyDiagnosticReportToClipboard(state);
    toast('📋 Диагностический отчёт скопирован');
  });

  $('#btn-download-report')?.addEventListener('click', () => {
    downloadDiagnosticReportAsText(state);
    toast('📥 Диагностический отчёт скачан');
  });

  // Disable Dev Mode
  $('#btn-disable-dev-mode')?.addEventListener('click', () => {
    setDevModeEnabled(false);
    toast('🛠️ Режим разработчика отключён');
    if (window.nav) window.nav('settings');
  });
}

function renderLogsList() {
  const container = $('#dev-logs-container');
  if (!container) return;

  const entries = getLogs(currentFilter, currentSearch);
  if (entries.length === 0) {
    container.innerHTML =
      '<div style="padding: 16px; text-align: center; color: var(--text-secondary, #888);">Записи в журнале отсутствуют</div>';
    return;
  }

  container.innerHTML = entries
    .slice()
    .reverse()
    .map((entry) => {
      let badgeStyle = 'background: rgba(128,128,128,0.2); color: var(--text-color, #333);';
      if (entry.level === 'INFO') badgeStyle = 'background: rgba(59,130,246,0.2); color: #2563eb;';
      if (entry.level === 'WARN') badgeStyle = 'background: rgba(245,158,11,0.2); color: #d97706;';
      if (entry.level === 'ERROR') badgeStyle = 'background: rgba(239,68,68,0.2); color: #dc2626;';

      const hasStack = Boolean(entry.stack);
      const stackId = `stack-${String(entry.id).replace('.', '-')}`;

      return `
        <div class="dev-log-item" style="padding: 8px; border-bottom: 1px dashed var(--border, rgba(0,0,0,0.1));">
          <div style="display: flex; gap: 8px; align-items: baseline;">
            <span style="color: var(--text-secondary, #888); font-size: 11px;">[${entry.timeStr}]</span>
            <span style="padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; ${badgeStyle}">${entry.level}</span>
          </div>
          <div style="margin-top: 4px; white-space: pre-wrap; word-break: break-word; line-height: 1.4;">${escapeHtml(entry.message)}</div>
          ${
            hasStack
              ? `<button class="btn-ghost dev-stack-toggle" data-stack-target="${stackId}" style="padding: 2px 6px; font-size: 10px; margin-top: 4px; color: var(--text-secondary, #666);">Показать стек вызова</button>
                 <pre id="${stackId}" class="hidden" style="margin-top: 4px; padding: 6px; background: rgba(0,0,0,0.06); border-radius: 4px; font-size: 10px; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(entry.stack)}</pre>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  // Bind stack toggles
  container.querySelectorAll('.dev-stack-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.stackTarget;
      const target = $(`#${targetId}`);
      if (target) {
        target.classList.toggle('hidden');
        btn.textContent = target.classList.contains('hidden')
          ? 'Показать стек вызова'
          : 'Скрыть стек вызова';
      }
    });
  });
}

function renderDiagnosticPreview(state) {
  const preview = $('#dev-diagnostic-preview');
  if (!preview) return;
  preview.textContent = generateDiagnosticReport(state);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

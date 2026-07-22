// ui/settings.js - Модуль настроек приложения

import { $ } from '../src/utils.js';
import {
  exportFullProgress,
  importFullProgress,
  validateImportData,
  shareJSON,
  downloadJSON,
} from '../src/backup-manager.js';
import { db, STORES } from '../src/db.js';
import { clearReviewLogs } from '../src/review-log.js';
import { localDateKey } from '../src/local-date.js';

// Локальный контекст зависимостей
let deps = null;

// Константа localStorage (ключ темы; ключи state/lessons см. state/store.js и src/backup-manager.js)
const LS_THEME = 'kitsune_theme';

// Функция рендеринга настроек
export function renderSettings(state, dependencies) {
  if (dependencies) deps = dependencies;
  const {
    save,
    nav,
    loadState,
    scheduleNotify,
    showNotification,
    applyTheme,
    applyCustomTheme,
    applyStreakSkin,
  } = deps;
  const toast = deps?.toast || window.toast || (() => {});

  const s = state.settings;
  const body = $('#settings-body');
  body.innerHTML = `
    <div class="set-group">
      <div class="set-item">
        <label>🔑 API-ключ OpenRouter</label>
        <input type="password" id="set-key" value="${s.openrouterKey || ''}" placeholder="sk-or-v1-..." data-testid="set-openrouter-key" />
        <div class="set-hint">Получите ключ на openrouter.ai. Хранится только на этом устройстве.</div>
        <div class="set-warning">⚠️ Ключ хранится в браузере. Не делитесь файлом бэкапа, если используете платный ключ.</div>
      </div>
      <div class="set-item">
        <label>🤖 Модель</label>
        <input type="text" id="set-model" value="${s.model || ''}" placeholder="deepseek/deepseek-v4-flash" data-testid="set-model" />
        <div class="set-hint">По умолчанию deepseek v4 flash. Можно указать любую модель OpenRouter (напр. добавить «:free»).</div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-item">
        <label> Полный экспорт прогресса</label>
        <div class="set-hint">
          Экспорт всего localStorage включая достижения, квесты и историю чата.
          <strong>⚠️ Внимание:</strong> Включает API-ключ OpenRouter!
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <button class="btn-ghost" id="btn-export-full" data-testid="export-full-btn">📦 Скачать прогресс (.json)</button>
          <button class="btn-ghost" id="btn-import-full" data-testid="import-full-btn">📥 Восстановить из файла</button>
        </div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-item row-between">
        <div><label style="margin:0">🔔 Ежедневное напоминание</label><div class="set-hint">Напомнить продолжить учёбу, если стрик под угрозой.</div></div>
        <label class="switch"><input type="checkbox" id="set-notify" ${s.notifyEnabled ? 'checked' : ''} data-testid="set-notify" /><span class="slider"></span></label>
      </div>
      <div class="set-item">
        <label>Время напоминания</label>
        <input type="time" id="set-notify-time" value="${s.notifyTime || '12:00'}" data-testid="set-notify-time" />
        <div class="set-hint">Напоминание сработает, пока приложение открыто/в фоне. Кнопка ниже — проверить.</div>
      </div>
      <div class="set-item"><button class="btn-ghost" id="btn-test-notif" data-testid="test-notif-btn">Тестовое уведомление</button></div>
    </div>

    <div class="set-group">
      <div class="set-item">
        <label>🎨 Тема оформления</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-ghost" id="theme-auto" style="flex:1;${s.darkMode === 'auto' ? 'background:var(--orange);color:#fff' : ''}">Авто</button>
          <button class="btn-ghost" id="theme-light" style="flex:1;${s.darkMode === 'light' ? 'background:var(--orange);color:#fff' : ''}">☀️ Светлая</button>
          <button class="btn-ghost" id="theme-dark" style="flex:1;${s.darkMode === 'dark' ? 'background:var(--orange);color:#fff' : ''}">🌙 Тёмная</button>
          <button class="btn-ghost" id="theme-custom" style="flex:1;${s.darkMode === 'custom' ? 'background:var(--orange);color:#fff' : ''}">🎨 Кастомная</button>
        </div>
        <div class="set-hint">Авто — следует за системной темой устройства. Кастомная — выбранная в магазине тема.</div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-item row-between">
        <div><label style="margin:0">🔤 Скрыть Ромадзи</label><div class="set-hint">В карточках будет скрыто латинское чтение.</div></div>
        <label class="switch"><input type="checkbox" id="set-hide-romaji" ${s.hideRomaji ? 'checked' : ''} data-testid="set-hide-romaji" /><span class="slider"></span></label>
      </div>
    </div>

    <div class="set-group">
      <div class="set-item"><button class="btn-ghost" id="btn-reset" style="color:var(--danger)" data-testid="reset-btn">Сбросить весь прогресс</button></div>
    </div>
    <div class="bottom-pad"></div>`;

  const bindEvent = (id, event, fn) => {
    const e = $(id);
    if (e) e.addEventListener(event, fn);
  };
  const persist = () => {
    s.openrouterKey = $('#set-key').value.trim();
    s.model = $('#set-model').value.trim() || 'deepseek/deepseek-v4-flash';
    s.notifyTime = $('#set-notify-time').value || '12:00';
    save();
  };
  ['#set-key', '#set-model', '#set-notify-time'].forEach((id) => bindEvent(id, 'change', persist));

  bindEvent('#set-notify', 'change', async (e) => {
    if (e.target.checked) {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        e.target.checked = false;
        toast('Разрешение на уведомления не выдано');
        return;
      }
      s.notifyEnabled = true;
      scheduleNotify();
    } else s.notifyEnabled = false;
    save();
  });
  bindEvent('#btn-test-notif', 'click', () =>
    showNotification('Kitsune Genki 🦊', 'Пора продолжить изучение японского!')
  );
  bindEvent('#set-hide-romaji', 'change', (e) => {
    s.hideRomaji = e.target.checked;
    save();
  });
  bindEvent('#theme-auto', 'click', () => setThemeAndSave('auto', state, dependencies));
  bindEvent('#theme-light', 'click', () => setThemeAndSave('light', state, dependencies));
  bindEvent('#theme-dark', 'click', () => setThemeAndSave('dark', state, dependencies));
  bindEvent('#theme-custom', 'click', () => setThemeAndSave('custom', state, dependencies));

  bindEvent('#btn-reset', 'click', async () => {
    if (confirm('Сбросить весь прогресс? Это действие необратимо.')) {
      try {
        // 1. Очищаем IndexedDB (основное хранилище данных)
        await db.clear(STORES.APP_STATE);
        await db.clear(STORES.CONTENT_CACHE);
        await clearReviewLogs();

        // Очищаем флаг миграции, но сохраняем тему
        await db.delete(STORES.UI_PREFERENCES, 'idb_migrated');

        // 2. Очищаем localStorage (для обратной совместимости)
        Object.keys(localStorage)
          .filter((k) => k.startsWith('kitsune_') && k !== LS_THEME)
          .forEach((k) => localStorage.removeItem(k));

        // 3. Перезагружаем состояние (получаем чистый defaultState)
        await loadState();

        // 4. Сохраняем чистое состояние в IndexedDB
        save(true);

        toast('Прогресс сброшен. Доступна только Глава 1');
        nav('home');
      } catch (error) {
        console.error('Ошибка при сбросе прогресса:', error);
        toast('Ошибка при сбросе прогресса. Попробуйте перезагрузить страницу.');
      }
    }
  });

  bindEvent('#btn-export-full', 'click', () => handleFullExport(state, toast));
  bindEvent('#btn-import-full', 'click', () => handleFullImport(state, dependencies, toast));
}

// Функция сохранения темы
function saveTheme(theme, state, save) {
  state.settings.darkMode = theme;
  localStorage.setItem(LS_THEME, theme);
  save();
}

// Функция установки темы с сохранением
function setThemeAndSave(theme, state, dependencies) {
  const { save, applyTheme, applyCustomTheme, applyStreakSkin } = dependencies;

  saveTheme(theme, state, save);
  if (theme === 'custom') {
    applyCustomTheme();
  } else {
    applyTheme();
    if (state.currentStreakSkin !== 'default') {
      state.currentStreakSkin = 'default';
      applyStreakSkin();
      save();
    }
  }
  renderSettings(state, dependencies);
}

// Обработчик полного экспорта
async function handleFullExport(state, toastFn) {
  try {
    // exportFullProgress теперь async
    const data = await exportFullProgress();
    const filename = `kitsune_genki_full_${localDateKey()}.json`;

    const shared = await shareJSON(data, filename);

    if (!shared) {
      downloadJSON(data, filename);
      toastFn('📦 Файл сохранён в Загрузки');
    } else {
      toastFn('✓ Меню «Поделиться» открыто');
    }
  } catch (error) {
    console.error('Ошибка экспорта:', error);
    toastFn('⚠️ Ошибка экспорта: ' + error.message);
  }
}

// Обработчик полного импорта
function handleFullImport(state, dependencies, toastFn) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const validation = validateImportData(data);
      if (!validation.valid) {
        toastFn('⚠️ ' + validation.error);
        return;
      }

      showImportConfirmDialog(data, state, dependencies, toastFn);
    } catch (error) {
      console.error('Ошибка импорта:', error);
      toastFn('⚠️ Неверный формат файла');
    }
  };

  input.click();
}

// Диалог подтверждения импорта
function showImportConfirmDialog(data, state, dependencies, toastFn) {
  const { save, loadState } = dependencies;
  const currentState = state;
  const importState = data.data.state;

  const hasApiKey = importState?.settings?.openrouterKey;
  const hasCurrentApiKey = currentState.settings.openrouterKey;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog">
      <h2>Восстановить прогресс?</h2>
      <div class="modal-content">
        <div class="import-comparison">
          <div class="import-col">
            <h3>Текущий прогресс</h3>
            <p>Уровень: ${currentState.level}</p>
            <p>XP: ${currentState.xp}</p>
            <p>Стрик: ${currentState.streak.count} дней</p>
            <p>Монеты: ${currentState.coins} 🪙</p>
          </div>
          <div class="import-col">
            <h3>Импортируемый</h3>
            <p>Уровень: ${importState.level || 1}</p>
            <p>XP: ${importState.xp || 0}</p>
            <p>Стрик: ${importState.streak?.count || 0} дней</p>
            <p>Монеты: ${importState.coins || 0} 🪙</p>
          </div>
        </div>
        ${
          hasApiKey && hasCurrentApiKey
            ? `
          <label class="import-checkbox">
            <input type="checkbox" id="preserve-api-key" checked />
            <span>Сохранить мой текущий API-ключ OpenRouter</span>
          </label>
        `
            : ''
        }
        <p class="import-warning">⚠️ Текущий прогресс будет полностью заменён!</p>
      </div>
      <div class="modal-buttons">
        <button class="btn-ghost" id="btn-cancel-import">Отмена</button>
        <button class="btn-primary" id="btn-confirm-import">Восстановить</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cancelBtn = overlay.querySelector('#btn-cancel-import');
  cancelBtn.onclick = () => overlay.remove();

  const confirmBtn = overlay.querySelector('#btn-confirm-import');
  confirmBtn.onclick = async () => {
    const preserveApiKey = overlay.querySelector('#preserve-api-key')?.checked || false;

    // importFullProgress теперь async
    const result = await importFullProgress(data, preserveApiKey);

    if (result.success) {
      // loadState теперь async
      await loadState();
      save();

      overlay.remove();
      toastFn('✓ Данные восстановлены');

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      toastFn('⚠️ Ошибка импорта: ' + result.error);
      overlay.remove();
    }
  };
}

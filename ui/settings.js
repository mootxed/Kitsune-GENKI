// ui/settings.js - Модуль настроек приложения

import { $ } from '../src/utils.js';
import {
  exportFullProgress,
  importFullProgress,
  validateImportData,
  shareJSON,
  downloadJSON,
} from '../src/backup-manager.js';
import { localDateKey } from '../src/local-date.js';
import { getDailyStudyDigest } from '../src/daily-study-digest.js';
import { resetApplicationData, commitState } from '../state/store.js';
import { updateThemeCommand } from '../src/domain-commands.js';
import { getOpenRouterKey, setOpenRouterKey } from '../src/openrouter-key.js';

// Локальный контекст зависимостей
let deps = null;

// Константа localStorage (ключ темы; ключи state/lessons см. state/store.js и src/backup-manager.js)
const LS_THEME = 'kitsune_theme';

// Функция рендеринга настроек
export function renderSettings(state, dependencies) {
  if (dependencies) deps = dependencies;
  const { save, nav, scheduleNotify, showNotification } = deps;
  const toast = deps?.toast || window.toast || (() => {});

  const s = state.settings;
  const body = $('#settings-body');
  body.innerHTML = `
    <div class="set-group">
      <div class="set-item settings-destination">
        <div>
          <label>📅 План обучения</label>
          <div class="set-hint">Расписание, дедлайн, нагрузка и управление планом.</div>
        </div>
        <button class="btn-ghost" id="btn-study-plan" data-testid="settings-plan-btn">Открыть</button>
      </div>
      <div class="set-item settings-destination">
        <div>
          <label>📚 Все главы</label>
          <div class="set-hint">Открывайте начатые и уже завершённые главы курса.</div>
        </div>
        <button class="btn-ghost" id="btn-course" data-testid="settings-course-btn">Открыть</button>
      </div>
    </div>

    <div class="set-group">
      <div class="set-item">
        <label>🔑 API-ключ OpenRouter</label>
        <input type="password" id="set-key" value="" placeholder="sk-or-v1-..." data-testid="set-openrouter-key" />
        <div class="set-hint">Получите ключ на openrouter.ai. Хранится только на этом устройстве.</div>
        <div class="set-warning">⚠️ Ключ хранится локально в браузере. Не сохраняйте его на общем или чужом устройстве.</div>
      </div>
      <div class="set-item">
        <label>🤖 Модель</label>
        <input type="text" id="set-model" value="${s.model || ''}" placeholder="deepseek/deepseek-v4-flash" data-testid="set-model" />
        <div class="set-hint">По умолчанию deepseek v4 flash. Можно указать любую модель OpenRouter (напр. добавить «:free»).</div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-item">
        <label>📦 Полный экспорт прогресса</label>
        <div class="set-hint">
          Экспорт всех данных обучения, карточек, истории повторений и настроек. API-ключ в бэкап не включается.
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <button class="btn-ghost" id="btn-export-full" data-testid="export-full-btn">📦 Скачать прогресс (.json)</button>
          <button class="btn-ghost" id="btn-import-full" data-testid="import-full-btn">📥 Восстановить из файла</button>
        </div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-item row-between">
        <div><label for="set-notify" style="margin:0">🔔 Ежедневное напоминание</label><div class="set-hint">Напомнить продолжить учёбу, если стрик под угрозой.</div></div>
        <label class="switch"><input type="checkbox" id="set-notify" ${s.notifyEnabled ? 'checked' : ''} aria-label="Включить напоминания об учёбе" data-testid="set-notify" /><span class="slider"></span></label>
      </div>
      <div class="set-item">
        <label for="set-notify-time">Время напоминания</label>
        <input type="time" id="set-notify-time" value="${s.notifyTime || '12:00'}" aria-label="Время напоминаний" data-testid="set-notify-time" />
        <div class="set-hint">Напоминание работает, пока приложение открыто или доступно в фоне. Для гарантированных уведомлений при полностью закрытом приложении потребуется серверный Web Push.</div>
      </div>
      <div class="set-item">
        <label>Дни недели</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px" id="notify-days-container">
          ${[
            { id: 1, label: 'Пн' },
            { id: 2, label: 'Вт' },
            { id: 3, label: 'Ср' },
            { id: 4, label: 'Чт' },
            { id: 5, label: 'Пт' },
            { id: 6, label: 'Сб' },
            { id: 0, label: 'Вс' },
          ]
            .map((day) => {
              const active = (s.notifyDays || [1, 2, 3, 4, 5, 6, 0]).includes(day.id);
              return `<button type="button" class="btn-ghost day-toggle-btn" data-day="${day.id}" style="padding:6px 12px;font-size:12px;border-radius:6px;${active ? 'background:var(--primary, #ff8a2b);color:#fff;font-weight:700' : ''}">${day.label}</button>`;
            })
            .join('')}
        </div>
      </div>
      <div class="set-item" style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-ghost" id="btn-test-notif" data-testid="test-notif-btn" style="flex:1">Тестовое уведомление</button>
        <button class="btn-ghost" id="btn-remind-hour" data-testid="remind-hour-btn" style="flex:1">⏰ Напомнить через час</button>
      </div>
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
      <div class="set-item settings-destination">
        <div>
          <label>⚖️ Правовая информация</label>
          <div class="set-hint">Лицензия GPL-3.0, сторонние компоненты, происхождение ресурсов и отказ от аффилиации.</div>
        </div>
        <button class="btn-ghost" id="btn-legal-info" data-testid="settings-legal-btn">Открыть</button>
      </div>
    </div>

    <div class="set-group">
      <div class="set-item"><button class="btn-ghost" id="btn-reset" style="color:var(--danger)" data-testid="reset-btn">Сбросить весь прогресс</button></div>
    </div>
    <div class="bottom-pad"></div>`;

  const keyInput = $('#set-key');
  if (keyInput) {
    keyInput.value = getOpenRouterKey();
  }

  const bindEvent = (id, event, fn) => {
    const e = $(id);
    if (e) e.addEventListener(event, fn);
  };
  const persist = () => {
    setOpenRouterKey($('#set-key').value.trim());
    s.model = $('#set-model').value.trim() || 'deepseek/deepseek-v4-flash';
    s.notifyTime = $('#set-notify-time').value || '12:00';
    save();
    if (scheduleNotify) scheduleNotify();
  };
  ['#set-key', '#set-model', '#set-notify-time'].forEach((id) => bindEvent(id, 'change', persist));

  const dayBtns = body.querySelectorAll('.day-toggle-btn');
  dayBtns.forEach((btn) => {
    btn.onclick = () => {
      const dayId = parseInt(btn.dataset.day, 10);
      let currentDays = Array.isArray(s.notifyDays) ? [...s.notifyDays] : [1, 2, 3, 4, 5, 6, 0];
      if (currentDays.includes(dayId)) {
        if (currentDays.length <= 1) {
          toast('⚠️ Выберите хотя бы один день недели');
          return;
        }
        currentDays = currentDays.filter((d) => d !== dayId);
      } else {
        currentDays = [...currentDays, dayId];
      }
      s.notifyDays = currentDays;
      save();
      if (scheduleNotify) scheduleNotify();
      renderSettings(state, dependencies);
    };
  });

  bindEvent('#set-notify', 'change', async (e) => {
    if (e.target.checked) {
      if (typeof Notification !== 'undefined') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') {
          e.target.checked = false;
          toast('Разрешение на уведомления не выдано');
          return;
        }
      }
      s.notifyEnabled = true;
      if (scheduleNotify) scheduleNotify();
    } else {
      s.notifyEnabled = false;
    }
    save();
  });

  bindEvent('#btn-test-notif', 'click', () => {
    const digest = getDailyStudyDigest(state);
    const text = digest.isComplete
      ? 'Тест: на сегодня всё выполнено 🎉'
      : `Тест: ${digest.summaryText} — ${digest.durationText}`;
    if (showNotification) {
      showNotification('KotoKitsu 🦊', text, { isTest: true });
    }
  });

  bindEvent('#btn-remind-hour', 'click', () => {
    if (window.scheduleOneHourReminder) {
      window.scheduleOneHourReminder();
    } else {
      toast('⏰ Напоминание установлено через 1 час');
    }
  });
  bindEvent('#btn-study-plan', 'click', () => nav('plan'));
  bindEvent('#btn-course', 'click', () => nav('course'));
  bindEvent('#btn-legal-info', 'click', () => showLegalInfoModal());
  bindEvent('#set-hide-romaji', 'change', (e) => {
    s.hideRomaji = e.target.checked;
    save();
  });
  bindEvent('#theme-auto', 'click', () => setThemeAndSave('auto', state, dependencies));
  bindEvent('#theme-light', 'click', () => setThemeAndSave('light', state, dependencies));
  bindEvent('#theme-dark', 'click', () => setThemeAndSave('dark', state, dependencies));
  bindEvent('#theme-custom', 'click', () => setThemeAndSave('custom', state, dependencies));

  bindEvent('#btn-reset', 'click', async () => {
    if (!confirm('Сбросить весь прогресс? Это действие необратимо.')) {
      return;
    }

    await resetApplicationData({
      preserveTheme: true,
    });
  });

  bindEvent('#btn-export-full', 'click', () => handleFullExport(state, toast));
  bindEvent('#btn-import-full', 'click', () => handleFullImport(state, dependencies, toast));
}

// Функция установки темы с сохранением
async function setThemeAndSave(theme, state, dependencies) {
  const { applyTheme, applyCustomTheme, applyStreakSkin } = dependencies;

  const cmd = updateThemeCommand(
    state,
    theme === 'custom' ? state.currentTheme : state.currentTheme,
    theme
  );
  await commitState(cmd.events);
  localStorage.setItem(LS_THEME, theme);

  if (theme === 'custom') {
    applyCustomTheme();
  } else {
    applyTheme();
    if (state.currentStreakSkin !== 'default') {
      state.currentStreakSkin = 'default';
      applyStreakSkin();
      await commitState([]);
    }
  }
  renderSettings(state, dependencies);
}

// Обработчик полного экспорта
async function handleFullExport(state, toastFn) {
  try {
    const data = await exportFullProgress();
    const filename = `kotokitsu_full_${localDateKey()}.json`;

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

  const hasCurrentApiKey = !!getOpenRouterKey();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog">
      <h2>Восстановить прогресс?</h2>
      <div class="modal-content">
        <div class="import-comparison">
          <div class="import-col" id="import-col-current">
            <h3>Текущий прогресс</h3>
            <p>Уровень: <span class="val-level"></span></p>
            <p>XP: <span class="val-xp"></span></p>
            <p>Стрик: <span class="val-streak"></span> дней</p>
            <p>Монеты: <span class="val-coins"></span> 🪙</p>
          </div>
          <div class="import-col" id="import-col-imported">
            <h3>Импортируемый</h3>
            <p>Уровень: <span class="val-level"></span></p>
            <p>XP: <span class="val-xp"></span></p>
            <p>Стрик: <span class="val-streak"></span> дней</p>
            <p>Монеты: <span class="val-coins"></span> 🪙</p>
          </div>
        </div>
        ${
          hasCurrentApiKey
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

  const colCurrent = overlay.querySelector('#import-col-current');
  if (colCurrent) {
    colCurrent.querySelector('.val-level').textContent = String(currentState?.level ?? 1);
    colCurrent.querySelector('.val-xp').textContent = String(currentState?.xp ?? 0);
    colCurrent.querySelector('.val-streak').textContent = String(currentState?.streak?.count ?? 0);
    colCurrent.querySelector('.val-coins').textContent = String(currentState?.coins ?? 0);
  }

  const colImported = overlay.querySelector('#import-col-imported');
  if (colImported) {
    colImported.querySelector('.val-level').textContent = String(importState?.level ?? 1);
    colImported.querySelector('.val-xp').textContent = String(importState?.xp ?? 0);
    colImported.querySelector('.val-streak').textContent = String(importState?.streak?.count ?? 0);
    colImported.querySelector('.val-coins').textContent = String(importState?.coins ?? 0);
  }

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

// Модальное окно правовой информации
function showLegalInfoModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'legal-modal-title');
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width: 600px; max-height: 85vh; overflow-y: auto;">
      <h2 id="legal-modal-title">⚖️ Правовая информация — KotoKitsu</h2>
      <div class="modal-content" style="text-align: left; font-size: 13px; line-height: 1.6;">
        <div style="background: var(--bg-secondary, rgba(0,0,0,0.04)); padding: 12px; border-radius: 8px; margin-bottom: 14px;">
          <h4 style="margin: 0 0 6px;">📢 Отказ от аффилиации / Non-Affiliation Disclaimer</h4>
          <p style="margin: 0 0 6px;"><b>RU:</b> KotoKitsu — независимый open-source тренажёр японского языка. Приложение можно использовать самостоятельно или параллельно с внешними учебными материалами.</p>
          <p style="margin: 0;"><b>EN:</b> KotoKitsu is an independent open-source project for Japanese language learning.</p>
        </div>

        <h4 style="margin: 12px 0 4px;">💻 Лицензия кода</h4>
        <p style="margin: 0 0 10px;">Программный код приложения распространяется под лицензией <b>GNU General Public License v3.0 or later (GPL-3.0-or-later)</b>. Автор: Mootxed. Версия: <code>v0.1.0-alpha</code> (Разработка: Российская Федерация).</p>

        <h4 style="margin: 12px 0 4px;">🎨 Сторонние ресурсы и графика</h4>
        <ul style="margin: 0 0 10px; padding-left: 20px;">
          <li><b>Vector Ranks</b> (иконки рангов): RhosGFX — <a href="https://rhosgfx.itch.io/vector-ranks" target="_blank" rel="noopener">CC0 1.0 Universal</a>. Преобразованы из PNG в WebP.</li>
          <li><b>Обложки историй</b>: Сгенерированы ИИ по коммиссионным запросам автора Mootxed. Не являются иллюстрациями GENKI.</li>
          <li><b>Данные кандзи</b>: hanzi-writer (MIT / Arphic PL) и @k1low/hanzi-writer-data-jp (LGPL-3.0 / Arphic PL / Unicode / OFL).</li>
        </ul>

        <h4 style="margin: 12px 0 4px;">🔒 Данные и Конфиденциальность</h4>
        <p style="margin: 0 0 10px;">Все данные обучения и настройки хранятся локально в вашем браузере. Аналитика и следящие трекеры отсутствуют. Запросы к ИИ (OpenRouter) выполняются только по вашему прямому действию.</p>

        <div id="legal-notices-expand" class="hidden" style="margin-top: 10px; padding: 10px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;">
          <h4 style="margin: 0 0 6px;">📜 THIRD_PARTY_NOTICES</h4>
          <pre style="white-space: pre-wrap; font-size: 11px; max-height: 200px; overflow-y: auto; background: var(--bg-secondary); padding: 8px; border-radius: 4px;">Vector Ranks — RhosGFX (CC0 1.0)
hanzi-writer v3.7.3 — David Chanin (MIT)
@k1low/hanzi-writer-data-jp v0.8.0 — (LGPL-3.0 / Arphic PL / Unicode / OFL)
ts-fsrs v5.4.1 — (MIT)
zod v4.4.3 — (MIT)</pre>
        </div>
      </div>

      <div class="modal-buttons" style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn-ghost" id="btn-toggle-notices" style="flex: 1;">📜 Сторонние уведомления</button>
        <button class="btn-primary" id="btn-close-legal" style="flex: 1;">Закрыть</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('#btn-close-legal');
  closeBtn.focus();
  closeBtn.onclick = () => overlay.remove();

  const toggleBtn = overlay.querySelector('#btn-toggle-notices');
  const noticesDiv = overlay.querySelector('#legal-notices-expand');
  toggleBtn.onclick = () => {
    noticesDiv.classList.toggle('hidden');
  };

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
  });
}

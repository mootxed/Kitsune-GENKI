/* ui/storage-recovery.js — Safe Storage Recovery Screen */

import {
  exportFullProgress,
  validateImportData,
  importFullProgress,
  downloadJSON,
} from '../src/backup-manager.js';
import { exportRedactedDiagnosticsJournal } from '../src/action-journal.js';

export function renderStorageRecoveryScreen(
  containerEl,
  {
    reason = 'STATE_CORRUPTED',
    error = null,
    context = {},
    onRetry = () => location.reload(),
    onRestoreBackup = null,
  } = {}
) {
  if (!containerEl) return;

  const reasonTitles = {
    STORAGE_UNAVAILABLE: 'Хранилище недоступно',
    STATE_CORRUPTED: 'Обнаружено повреждение данных',
    IDB_UPGRADE_FAILED: 'Ошибка обновления базы данных',
    BACKUP_AVAILABLE: 'Доступна резервная копия',
    IDB_FALLBACK_CONFLICT: 'Конфликт локального и браузерного хранилищ',
    UNSUPPORTED_FUTURE_VERSION: 'Версия данных новее текущего приложения',
    MIGRATION_FAILED: 'Ошибка миграции данных',
  };

  const title = reasonTitles[reason] || 'Критическая ошибка хранилища';
  const errorMessage =
    error?.message || (typeof error === 'string' ? error : 'Неизвестный сбой хранилища');

  containerEl.innerHTML = `
    <div class="storage-recovery-backdrop" style="
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--bg-main, #0F0F1A);
      color: var(--ink, #F0F0F8);
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px;
    ">
      <div class="storage-recovery-card" style="
        max-width: 560px;
        width: 100%;
        background: var(--bg-card, #1A1A2E);
        border: 1px solid var(--border-color, rgba(255,255,255,0.1));
        border-radius: 20px;
        padding: 32px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      ">
        <div style="font-size: 48px; text-align: center; margin-bottom: 16px;">🛡️</div>
        <h1 style="font-size: 22px; font-weight: 700; text-align: center; margin-bottom: 12px; color: var(--accent-orange, #FF7A1A);">
          ${title}
        </h1>
        <p style="font-size: 14px; line-height: 1.6; color: var(--ink-secondary, #A0A0B8); text-align: center; margin-bottom: 20px;">
          Ваш учебный прогресс защищён. Выберите безопасное действие для восстановления работы KotoKitsu.
        </p>

        <div style="
          background: rgba(244, 67, 54, 0.1);
          border: 1px solid rgba(244, 67, 54, 0.3);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
          font-size: 13px;
          font-family: monospace;
          color: #FF8A80;
          word-break: break-word;
        ">
          ${errorMessage}
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button id="btn-recovery-retry" style="
            width: 100%;
            padding: 14px 20px;
            background: var(--primary, #FF7A1A);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
          ">
            ↻ Повторить загрузку приложения
          </button>

          <button id="btn-recovery-restore-backup" style="
            width: 100%;
            padding: 14px 20px;
            background: rgba(255, 255, 255, 0.08);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          ">
            📦 Восстановить из резервной копии
          </button>

          <button id="btn-recovery-export-diag" style="
            width: 100%;
            padding: 12px 20px;
            background: transparent;
            color: var(--ink-secondary, #A0A0B8);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            font-size: 13px;
            cursor: pointer;
          ">
            📄 Скачать диагностический отчёт
          </button>

          <input type="file" id="input-recovery-file" accept=".json" style="display: none;" />

          <button id="btn-recovery-import-file" style="
            width: 100%;
            padding: 12px 20px;
            background: transparent;
            color: var(--ink-secondary, #A0A0B8);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            font-size: 13px;
            cursor: pointer;
          ">
            📥 Импортировать файл бэкапа (.json)
          </button>
        </div>

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center;">
          <button id="btn-recovery-reset-danger" style="
            background: transparent;
            color: #FF5252;
            border: none;
            font-size: 12px;
            text-decoration: underline;
            cursor: pointer;
            opacity: 0.8;
          ">
            Сброс данных (крайний случай)
          </button>
        </div>
      </div>
    </div>
  `;

  const btnRetry = containerEl.querySelector('#btn-recovery-retry');
  if (btnRetry) btnRetry.onclick = () => onRetry();

  const btnRestore = containerEl.querySelector('#btn-recovery-restore-backup');
  if (btnRestore) {
    btnRestore.onclick = async () => {
      if (onRestoreBackup) {
        await onRestoreBackup();
      } else {
        alert('Попытка восстановления из последней точки сохранения...');
        location.reload();
      }
    };
  }

  const btnDiag = containerEl.querySelector('#btn-recovery-export-diag');
  if (btnDiag) {
    btnDiag.onclick = async () => {
      try {
        const full = await exportFullProgress().catch(() => ({}));
        const diagData = {
          app: 'kotokitsu-diagnostics',
          timestamp: new Date().toISOString(),
          error: errorMessage,
          reason,
          actionJournal: exportRedactedDiagnosticsJournal(context.state || {}),
          summary: full.data?.state
            ? { xp: full.data.state.xp, level: full.data.state.level }
            : null,
        };
        downloadJSON(diagData, `kotokitsu-diagnostics-${Date.now()}.json`);
      } catch (err) {
        alert('Не удалось сформировать отчёт: ' + err.message);
      }
    };
  }

  const btnImport = containerEl.querySelector('#btn-recovery-import-file');
  const fileInput = containerEl.querySelector('#input-recovery-file');
  if (btnImport && fileInput) {
    btnImport.onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const val = validateImportData(json, file.size);
        if (!val.valid) {
          alert('Ошибка импорта: ' + val.error);
          return;
        }
        const res = await importFullProgress(val.data, true);
        if (res.success) {
          alert('Данные успешно восстановлены из файла!');
          location.reload();
        } else {
          alert('Не удалось восстановить: ' + res.error);
        }
      } catch (err) {
        alert('Ошибка при чтении файла бэкапа: ' + err.message);
      }
    };
  }

  const btnReset = containerEl.querySelector('#btn-recovery-reset-danger');
  if (btnReset) {
    btnReset.onclick = () => {
      const confirm1 = confirm(
        'ВНИМАНИЕ! Вы собираетесь сбросить все локальные данные приложения.\n\nПрогресс будет удалён, если у вас нет файла экспорта.\nПродолжить?'
      );
      if (!confirm1) return;
      const confirm2 = confirm('Вы АБСОЛЮТНО уверены? Данное действие НЕОБРАТИМО.');
      if (confirm2) {
        localStorage.clear();
        indexedDB.deleteDatabase('kotokitsu_db');
        location.reload();
      }
    };
  }
}

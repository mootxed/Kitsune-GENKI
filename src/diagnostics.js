/* src/diagnostics.js — Telemetry-free, privacy-safe local diagnostics exporter */

import {
  generateDiagnosticReport,
  copyDiagnosticReportToClipboard,
  downloadDiagnosticReportAsText,
} from './dev-tools.js';

export {
  generateDiagnosticReport,
  copyDiagnosticReportToClipboard,
  downloadDiagnosticReportAsText,
};

/**
 * Clean facade for UI components to export diagnostic reports.
 *
 * @param {Object} appState - Application state.
 * @param {Object} options - { method: 'download'|'clipboard', toastFn: function }
 */
export async function exportDiagnosticReport(
  appState,
  { method = 'download', toastFn = null } = {}
) {
  try {
    if (method === 'clipboard') {
      await copyDiagnosticReportToClipboard(appState);
      if (typeof toastFn === 'function')
        toastFn('📋 Диагностический отчёт скопирован в буфер обмена');
      return true;
    }
    downloadDiagnosticReportAsText(appState);
    if (typeof toastFn === 'function') toastFn('💾 Диагностический отчёт скачан');
    return true;
  } catch (err) {
    console.error('[Diagnostics] Failed to export diagnostic report:', err);
    if (typeof toastFn === 'function') toastFn('⚠️ Не удалось экспортировать диагностику');
    return false;
  }
}

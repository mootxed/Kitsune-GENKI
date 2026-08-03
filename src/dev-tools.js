/* src/dev-tools.js — Developer mode, log interceptor, log exporter, and diagnostic report generator */

import { state, CURRENT_VERSION, isStoragePersisted, isStorageDegraded } from '../state/store.js';
import { DB_VERSION } from './db.js';

const LS_DEV_MODE = 'kitsune_dev_mode';
const MAX_LOGS = 500;

// Internal log store (ring buffer capped at MAX_LOGS)
const logs = [];
let originalConsole = null;
let isInitialized = false;

// 7-tap gesture tracker
let tapCount = 0;
let lastTapTime = 0;

/**
 * Initializes log interception and global error listeners.
 * Safe to call multiple times.
 */
export function initDevTools() {
  if (isInitialized) return;
  isInitialized = true;

  // Intercept window location ?dev=true / ?dev=1
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const devParam = params.get('dev');
      if (devParam === 'true' || devParam === '1') {
        setDevModeEnabled(true);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  // Preserve original console methods
  if (typeof console !== 'undefined') {
    originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    console.log = (...args) => {
      addLogEntry('LOG', args);
      originalConsole.log(...args);
    };

    console.info = (...args) => {
      addLogEntry('INFO', args);
      originalConsole.info(...args);
    };

    console.warn = (...args) => {
      addLogEntry('WARN', args);
      originalConsole.warn(...args);
    };

    console.error = (...args) => {
      addLogEntry('ERROR', args);
      originalConsole.error(...args);
    };
  }

  // Catch unhandled errors & promise rejections
  if (typeof window !== 'undefined') {
    window.addEventListener(
      'error',
      (event) => {
        if (event.error) {
          addLogEntry('ERROR', [event.error.message || String(event.error)], event.error.stack);
        } else if (event.message) {
          const source = event.filename
            ? ` (${event.filename}:${event.lineno}:${event.colno})`
            : '';
          addLogEntry('ERROR', [`Unhandled error: ${event.message}${source}`]);
        } else if (event.target && event.target !== window) {
          // Resource load error (e.g. <img> or <script>)
          const tag = event.target.tagName || 'ELEMENT';
          const src = event.target.src || event.target.href || '';
          addLogEntry('WARN', [`Failed to load resource <${tag}>: ${src}`]);
        }
      },
      true
    );

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const msg = reason?.message || String(reason || 'Unhandled Promise Rejection');
      const stack = reason?.stack || null;
      addLogEntry('ERROR', [`Unhandled Rejection: ${msg}`], stack);
    });
  }

  // Log startup message
  addLogEntry('INFO', [`Application started (DevTools logger active)`]);
}

/**
 * Appends a formatted log entry to the buffer and enforces MAX_LOGS limit.
 */
export function addLogEntry(level, args, explicitStack = null) {
  const timestamp = new Date();
  let stack = explicitStack;

  const formattedMessage = args
    .map((arg) => {
      if (arg instanceof Error) {
        if (!stack && arg.stack) stack = arg.stack;
        return `${arg.name || 'Error'}: ${arg.message}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  logs.push({
    id: Date.now() + Math.random(),
    timestamp,
    timeStr: timestamp.toLocaleTimeString('ru-RU', { hour12: false }),
    level: level.toUpperCase(),
    message: formattedMessage,
    stack: stack || null,
  });

  // Enforce memory limit by dropping oldest logs
  while (logs.length > MAX_LOGS) {
    logs.shift();
  }
}

/**
 * Returns filtered log entries.
 */
export function getLogs(levelFilter = 'ALL', searchText = '') {
  let filtered = logs;

  if (levelFilter && levelFilter !== 'ALL') {
    filtered = filtered.filter((item) => item.level === levelFilter.toUpperCase());
  }

  if (searchText && searchText.trim()) {
    const q = searchText.trim().toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.message.toLowerCase().includes(q) ||
        item.level.toLowerCase().includes(q) ||
        item.timeStr.toLowerCase().includes(q) ||
        (item.stack && item.stack.toLowerCase().includes(q))
    );
  }

  return filtered;
}

/**
 * Clears all log entries in memory.
 */
export function clearLogs() {
  logs.length = 0;
}

/**
 * Developer Mode status check.
 */
export function isDevModeEnabled() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(LS_DEV_MODE) === 'true';
}

/**
 * Enables or disables developer mode.
 */
export function setDevModeEnabled(enabled) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LS_DEV_MODE, enabled ? 'true' : 'false');
  }
  return enabled;
}

/**
 * Toggles developer mode.
 */
export function toggleDevMode() {
  const current = isDevModeEnabled();
  return setDevModeEnabled(!current);
}

/**
 * Handles 7-tap gesture for hidden activation.
 * Returns object: { triggered: boolean, count: number, enabled: boolean }
 */
export function recordDevTap() {
  const now = Date.now();
  if (now - lastTapTime > 3000) {
    tapCount = 0;
  }
  lastTapTime = now;
  tapCount += 1;

  if (tapCount >= 7) {
    tapCount = 0;
    const newState = toggleDevMode();
    return { triggered: true, count: 7, enabled: newState };
  }

  return { triggered: false, count: tapCount, enabled: isDevModeEnabled() };
}

/**
 * Formats all logs into plain text format.
 */
export function formatLogsText(levelFilter = 'ALL', searchText = '') {
  const logEntries = getLogs(levelFilter, searchText);
  if (logEntries.length === 0) {
    return '=== KotoKitsu Log Journal ===\n(No logs recorded)\n';
  }

  const lines = ['=== KotoKitsu Log Journal ===', `Exported: ${new Date().toISOString()}`, ''];

  logEntries.forEach((entry) => {
    lines.push(`[${entry.timeStr}] ${entry.level}`);
    lines.push(entry.message);
    if (entry.stack) {
      lines.push(`Stack:\n${entry.stack}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Downloads logs as a .txt file.
 */
export function downloadLogsAsText() {
  const text = formatLogsText();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kotokitsu_logs_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copies logs to clipboard.
 */
export function copyLogsToClipboard() {
  const text = formatLogsText();
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve(text);
}

/**
 * Generates structured diagnostic report string according to prompt requirements.
 */
export function generateDiagnosticReport(appState = state) {
  const srsCards = appState?.srs ? Object.values(appState.srs) : [];
  const chapters = appState?.chapters ? Object.values(appState.chapters) : [];

  const totalCards = srsCards.length;
  const wordCount = srsCards.filter((c) => c.type === 'word' || c.wordId || c.expression).length;
  const completedLessons = chapters.filter((c) => c?.completedAt).length;

  const isPwaInstalled =
    typeof window !== 'undefined' &&
    ((typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)')?.matches) ||
      window.navigator?.standalone === true);

  const swStatus =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? navigator.serviceWorker.controller
        ? 'Active'
        : 'Supported (Inactive)'
      : 'Not Supported';

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  const language = typeof navigator !== 'undefined' ? navigator.language : 'Unknown';
  const timeZone = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || 'Unknown';
  const isOnline = typeof navigator !== 'undefined' && navigator.onLine ? 'Online' : 'Offline';

  let platform = 'Unknown';
  if (typeof navigator !== 'undefined') {
    if (/android/i.test(userAgent)) platform = 'Android';
    else if (/iphone|ipad|ipod/i.test(userAgent)) platform = 'iOS';
    else if (/mac/i.test(userAgent)) platform = 'macOS';
    else if (/win/i.test(userAgent)) platform = 'Windows';
    else if (/linux/i.test(userAgent)) platform = 'Linux';
  }

  let memoryInfo = 'N/A';
  if (typeof performance !== 'undefined' && performance.memory) {
    const usedMB = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const totalMB = (performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
    memoryInfo = `${usedMB} MB / ${totalMB} MB`;
  }

  const logsText = formatLogsText();

  const reportText = `=== KotoKitsu Diagnostic Report ===

App Version:
${appState?.version || CURRENT_VERSION || '0.1.0-alpha'}

Build Date:
${new Date().toISOString().slice(0, 10)}

Database:
Version ${DB_VERSION}

Platform:
${platform}

Browser:
${userAgent}

Language:
${language}

Timezone:
${timeZone}

PWA:
${isPwaInstalled ? 'Installed' : 'Browser Mode'} (${isOnline})

Service Worker:
${swStatus}

Storage Persistence:
${isStoragePersisted() ? 'Persisted' : 'Not Persisted'} (Degraded: ${isStorageDegraded() ? 'Yes' : 'No'})

Memory Usage:
${memoryInfo}

Storage Summary:
Cards: ${totalCards}
Words: ${wordCount}
Lessons/Chapters: ${completedLessons}

===== LOGS =====
${logsText}`;

  return reportText;
}

/**
 * Copies diagnostic report to clipboard.
 */
export function copyDiagnosticReportToClipboard(appState = state) {
  const report = generateDiagnosticReport(appState);
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(report).then(() => report);
  }
  const textarea = document.createElement('textarea');
  textarea.value = report;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve(report);
}

/**
 * Downloads diagnostic report as .txt file.
 */
export function downloadDiagnosticReportAsText(appState = state) {
  const text = generateDiagnosticReport(appState);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kotokitsu_diagnostics_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

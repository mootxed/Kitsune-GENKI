/* src/diagnostics.js — Telemetry-free, privacy-safe local diagnostics exporter */

import { state, CURRENT_VERSION, isStoragePersisted, isStorageDegraded } from '../state/store.js';
import { DB_VERSION } from './db.js';

/**
 * Generates a clean, privacy-sanitized diagnostic snapshot.
 * NO API keys, user notes, AI chat history, or personal study answers are included.
 */
export function generateDiagnosticReport() {
  const srsCards = state?.srs ? Object.values(state.srs) : [];
  const now = Date.now();

  const cardCounts = {
    totalCards: srsCards.length,
    dueCards: srsCards.filter((c) => c.nextReview && c.nextReview <= now).length,
    learningCards: srsCards.filter((c) => c.state === 'learning' || c.reps < 3).length,
    masteredCards: srsCards.filter((c) => c.state === 'review' && c.reps >= 3).length,
  };

  const sanitizedErrors = Array.isArray(state?.lastErrors)
    ? state.lastErrors.slice(0, 50).map((err) => ({
        timestamp: err.timestamp,
        type: err.type || 'ERROR',
        message: err.message ? String(err.message).slice(0, 200) : 'Unknown error',
      }))
    : [];

  return {
    appVersion: '0.1.0-alpha',
    stateVersion: state?.version || CURRENT_VERSION,
    revision: state?.revision || 1,
    dbVersion: DB_VERSION,
    browser: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    serviceWorker:
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'active' : 'unavailable',
    storagePersistence: isStoragePersisted(),
    storageDegraded: isStorageDegraded(),
    cardCounts,
    completedChaptersCount: Object.values(state?.chapters || {}).filter((ch) => ch?.completedAt)
      .length,
    unlockedAchievementsCount: Array.isArray(state?.unlockedAchievements)
      ? state.unlockedAchievements.length
      : 0,
    lastErrors: sanitizedErrors,
    generatedAt: new Date().toISOString(),
  };
}

export function copyDiagnosticReportToClipboard() {
  const report = generateDiagnosticReport();
  const jsonString = JSON.stringify(report, null, 2);

  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(jsonString).then(() => jsonString);
  } else {
    // Fallback if clipboard API is not available
    const textarea = document.createElement('textarea');
    textarea.value = jsonString;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return Promise.resolve(jsonString);
  }
}

// tests/dev-tools.test.js — Unit tests for Developer Mode and DevTools logger

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addLogEntry,
  getLogs,
  clearLogs,
  formatLogsText,
  isDevModeEnabled,
  setDevModeEnabled,
  toggleDevMode,
  recordDevTap,
  generateDiagnosticReport,
} from '../src/dev-tools.js';

describe('DevTools & Logger Module', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLogs();
  });

  it('toggles and persists dev mode state in localStorage', () => {
    expect(isDevModeEnabled()).toBe(false);

    setDevModeEnabled(true);
    expect(isDevModeEnabled()).toBe(true);
    expect(localStorage.getItem('kitsune_dev_mode')).toBe('true');

    toggleDevMode();
    expect(isDevModeEnabled()).toBe(false);
    expect(localStorage.getItem('kitsune_dev_mode')).toBe('false');
  });

  it('triggers dev mode activation on 7th tap within 3 seconds', () => {
    setDevModeEnabled(false);

    for (let i = 1; i <= 6; i++) {
      const res = recordDevTap();
      expect(res.triggered).toBe(false);
      expect(res.count).toBe(i);
    }

    const seventhRes = recordDevTap();
    expect(seventhRes.triggered).toBe(true);
    expect(seventhRes.enabled).toBe(true);
    expect(isDevModeEnabled()).toBe(true);
  });

  it('resets tap count if delay between taps exceeds 3 seconds', async () => {
    setDevModeEnabled(false);

    recordDevTap();
    recordDevTap();
    expect(recordDevTap().count).toBe(3);

    // Simulate delay > 3000ms
    vi.useFakeTimers();
    vi.advanceTimersByTime(3500);

    const afterDelayRes = recordDevTap();
    expect(afterDelayRes.count).toBe(1);

    vi.useRealTimers();
  });

  it('records logs with level, timestamp, message, and enforces MAX_LOGS limit', () => {
    clearLogs();

    addLogEntry('INFO', ['Test info message']);
    addLogEntry('WARN', ['Test warning message']);
    addLogEntry('ERROR', ['Test error message']);

    const logs = getLogs();
    expect(logs.length).toBe(3);
    expect(logs[0].level).toBe('INFO');
    expect(logs[0].message).toBe('Test info message');
    expect(logs[1].level).toBe('WARN');
    expect(logs[2].level).toBe('ERROR');

    // Test MAX_LOGS limit (500)
    for (let i = 0; i < 600; i++) {
      addLogEntry('LOG', [`Bulk log item ${i}`]);
    }

    const allLogs = getLogs();
    expect(allLogs.length).toBe(500);
    // Oldest items should be dropped, last item should be item 599
    expect(allLogs[allLogs.length - 1].message).toBe('Bulk log item 599');
  });

  it('filters logs by level and search text', () => {
    clearLogs();

    addLogEntry('INFO', ['System initialized successfully']);
    addLogEntry('WARN', ['Dictionary returned empty result']);
    addLogEntry('ERROR', ['Failed to fetch remote asset']);

    const infoOnly = getLogs('INFO');
    expect(infoOnly.length).toBe(1);
    expect(infoOnly[0].message).toContain('initialized');

    const errorOnly = getLogs('ERROR');
    expect(errorOnly.length).toBe(1);
    expect(errorOnly[0].message).toContain('asset');

    const searchMatch = getLogs('ALL', 'Dictionary');
    expect(searchMatch.length).toBe(1);
    expect(searchMatch[0].level).toBe('WARN');
  });

  it('formats plain text logs export correctly', () => {
    clearLogs();
    addLogEntry('INFO', ['FSRS review completed']);
    addLogEntry('ERROR', ['TypeError: Cannot read property of null'], 'At flashcards.js:417');

    const formatted = formatLogsText();
    expect(formatted).toContain('=== KotoKitsu Log Journal ===');
    expect(formatted).toContain('INFO');
    expect(formatted).toContain('FSRS review completed');
    expect(formatted).toContain('ERROR');
    expect(formatted).toContain('TypeError: Cannot read property of null');
    expect(formatted).toContain('At flashcards.js:417');
  });

  it('generates diagnostic report with state metrics', () => {
    clearLogs();
    addLogEntry('INFO', ['Diagnostic test log']);

    const mockState = {
      version: '0.1.0-alpha',
      srs: {
        card1: { type: 'word', reps: 5, state: 'review' },
        card2: { type: 'word', reps: 1, state: 'learning' },
      },
      chapters: {
        ch1: { completedAt: '2026-08-01T12:00:00Z' },
      },
    };

    const report = generateDiagnosticReport(mockState);
    expect(report).toContain('=== KotoKitsu Diagnostic Report ===');
    expect(report).toContain('App Version:');
    expect(report).toContain('Database:');
    expect(report).toContain('Storage Summary:');
    expect(report).toContain('Cards: 2');
    expect(report).toContain('Words: 2');
    expect(report).toContain('Lessons/Chapters: 1');
    expect(report).toContain('===== LOGS =====');
    expect(report).toContain('Diagnostic test log');
  });
});

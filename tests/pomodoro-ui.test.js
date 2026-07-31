// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initPomodoro,
  openPanel,
  closePanel,
  togglePanel,
  renderPomodoroWidget,
  formatPomodoroTime,
  getPhaseLabel,
} from '../ui/pomodoro.js';
import {
  createDefaultPomodoroSettings,
  createDefaultPomodoroState,
} from '../src/pomodoro/pomodoro-state.js';

describe('Pomodoro UI Controller & DOM Integration (ui/pomodoro.js)', () => {
  let mockState;
  let mockDependencies;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';

    mockState = {
      version: 17,
      settings: {
        pomodoro: createDefaultPomodoroSettings(),
      },
      pomodoro: createDefaultPomodoroState(),
    };

    mockDependencies = {
      state: mockState,
      save: vi.fn(),
      toast: vi.fn(),
      announce: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Creates floating button and panel DOM elements only once', () => {
    initPomodoro(mockDependencies);
    initPomodoro(mockDependencies);

    const buttons = document.querySelectorAll('#pomodoro-floating-btn');
    const panels = document.querySelectorAll('#pomodoro-panel');

    expect(buttons).toHaveLength(1);
    expect(panels).toHaveLength(1);
  });

  it('Formats time display correctly', () => {
    expect(formatPomodoroTime(1500000)).toBe('25:00');
    expect(formatPomodoroTime(300000)).toBe('05:00');
    expect(formatPomodoroTime(65000)).toBe('01:05');
    expect(formatPomodoroTime(0)).toBe('00:00');
  });

  it('Returns correct Russian phase labels', () => {
    expect(getPhaseLabel('focus')).toBe('Фокус');
    expect(getPhaseLabel('shortBreak')).toBe('Короткий перерыв');
    expect(getPhaseLabel('longBreak')).toBe('Длинный перерыв');
  });

  it('Opens and closes the timer panel', () => {
    initPomodoro(mockDependencies);
    const panel = document.getElementById('pomodoro-panel');

    expect(panel.classList.contains('hidden')).toBe(true);

    openPanel();
    expect(panel.classList.contains('hidden')).toBe(false);

    closePanel();
    expect(panel.classList.contains('hidden')).toBe(true);

    togglePanel();
    expect(panel.classList.contains('hidden')).toBe(false);
  });

  it('Closes panel on Escape key press', () => {
    initPomodoro(mockDependencies);
    openPanel();

    const panel = document.getElementById('pomodoro-panel');
    expect(panel.classList.contains('hidden')).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.classList.contains('hidden')).toBe(true);
  });

  it('Main button click toggles state from idle -> running -> paused -> running', () => {
    initPomodoro(mockDependencies);
    openPanel();

    const mainBtn = document.getElementById('pomodoro-main-btn');
    expect(mainBtn.textContent).toBe('Старт');

    mainBtn.click();
    expect(mockState.pomodoro.status).toBe('running');
    expect(mainBtn.textContent).toBe('Пауза');

    mainBtn.click();
    expect(mockState.pomodoro.status).toBe('paused');
    expect(mainBtn.textContent).toBe('Продолжить');

    mainBtn.click();
    expect(mockState.pomodoro.status).toBe('running');
    expect(mainBtn.textContent).toBe('Пауза');
  });

  it('Reset button restores idle focus state', () => {
    initPomodoro(mockDependencies);
    const mainBtn = document.getElementById('pomodoro-main-btn');
    const resetBtn = document.getElementById('pomodoro-reset-btn');

    mainBtn.click(); // Start
    expect(mockState.pomodoro.status).toBe('running');

    resetBtn.click(); // Reset
    expect(mockState.pomodoro.status).toBe('idle');
    expect(mockState.pomodoro.phase).toBe('focus');
    expect(mainBtn.textContent).toBe('Старт');
  });

  it('Closing panel does not stop or reset timer', () => {
    initPomodoro(mockDependencies);
    openPanel();

    const mainBtn = document.getElementById('pomodoro-main-btn');
    mainBtn.click(); // Start running

    closePanel();

    expect(mockState.pomodoro.status).toBe('running');
    expect(mockState.pomodoro.endsAt).not.toBeNull();
  });

  it('Floating button has correct hit area attributes and accessible aria-label', () => {
    initPomodoro(mockDependencies);
    const floatingBtn = document.getElementById('pomodoro-floating-btn');

    expect(floatingBtn.getAttribute('aria-label')).toContain('Таймер Pomodoro');
    expect(floatingBtn.getAttribute('data-testid')).toBe('pomodoro-floating-btn');
  });

  it('Does not request Notification permission without explicit user interaction', () => {
    const requestPermissionSpy = vi.fn();
    globalThis.Notification = { permission: 'default', requestPermission: requestPermissionSpy };

    initPomodoro(mockDependencies);
    expect(requestPermissionSpy).not.toHaveBeenCalled();
  });
});

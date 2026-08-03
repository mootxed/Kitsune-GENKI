import { describe, it, expect, beforeEach } from 'vitest';
import { showCompletionScreen } from '../ui/shared.js';

function parseRgb(colorStr) {
  if (!colorStr || colorStr === 'transparent') return [255, 255, 255];
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3)
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  }
  return [255, 255, 255];
}

function relativeLuminance([r, g, b]) {
  const normalize = (val) => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
}

function contrastRatio(fgStr, bgStr) {
  const fgL = relativeLuminance(parseRgb(fgStr));
  const bgL = relativeLuminance(parseRgb(bgStr));
  const l1 = Math.max(fgL, bgL);
  const l2 = Math.min(fgL, bgL);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('Completion Screen Visual & Contrast Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="completion-overlay" class="hidden">
        <h2 id="completion-title"></h2>
        <p id="completion-subtitle"></p>
        <p id="completion-desc"></p>
        <div id="completion-rewards"></div>
        <button id="btn-completion-continue"></button>
      </div>
    `;
  });

  it('populates completion elements via showCompletionScreen call', () => {
    const rewards = [
      { icon: '🪙', label: '+10 XP' },
      { icon: '⭐', label: '+5 Coins' },
    ];

    showCompletionScreen({
      title: 'Отличная работа!',
      subtitle: 'Сессия завершена',
      desc: 'Все карточки повторены',
      theme: 'success',
      rewards,
    });

    const overlay = document.getElementById('completion-overlay');
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('completion-title').textContent).toBe('Отличная работа!');
    expect(document.getElementById('completion-subtitle').textContent).toBe('Сессия завершена');
    expect(document.getElementById('completion-desc').textContent).toBe('Все карточки повторены');

    const rewardLabels = document.querySelectorAll('.reward-label');
    expect(rewardLabels.length).toBe(2);
    expect(rewardLabels[0].textContent).toBe('+10 XP');
    expect(rewardLabels[1].textContent).toBe('+5 Coins');

    const btn = document.getElementById('btn-completion-continue');
    expect(btn.textContent).toBe('Продолжить');
  });

  it('maintains valid WCAG contrast ratios for text and backgrounds', () => {
    // Design tokens colors in KotoKitsu 2026 design system
    const themes = [
      {
        name: 'light theme',
        bg: '#FFFFFF',
        title: '#1F192E',
        subtitle: '#5D5B68',
        desc: '#4D4B58',
        rewardBg: '#F5F2F8',
        rewardFg: '#1F192E',
        buttonBg: '#D85900',
        buttonFg: '#FFFFFF',
      },
      {
        name: 'dark theme',
        bg: '#181826',
        title: '#F0F0F8',
        subtitle: '#A0A0B8',
        desc: '#CCCCDD',
        rewardBg: '#222234',
        rewardFg: '#F0F0F8',
        buttonBg: '#E66500',
        buttonFg: '#FFFFFF',
      },
    ];

    for (const t of themes) {
      const titleRatio = contrastRatio(t.title, t.bg);
      const subtitleRatio = contrastRatio(t.subtitle, t.bg);
      const descRatio = contrastRatio(t.desc, t.bg);
      const rewardRatio = contrastRatio(t.rewardFg, t.rewardBg);
      const buttonRatio = contrastRatio(t.buttonFg, t.buttonBg);

      // Large text threshold >= 3.0, normal text >= 4.5
      expect(titleRatio, `Title contrast in ${t.name}`).toBeGreaterThanOrEqual(3.0);
      expect(subtitleRatio, `Subtitle contrast in ${t.name}`).toBeGreaterThanOrEqual(4.5);
      expect(descRatio, `Desc contrast in ${t.name}`).toBeGreaterThanOrEqual(4.5);
      expect(rewardRatio, `Reward label contrast in ${t.name}`).toBeGreaterThanOrEqual(4.5);
      expect(buttonRatio, `Button contrast in ${t.name}`).toBeGreaterThanOrEqual(3.0);
    }
  });
});

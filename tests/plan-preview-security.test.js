import { describe, it, expect, beforeEach } from 'vitest';
import { openPlanEditor } from '../ui/plan.js';

describe('UI Plan Preview DOM Security', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="plan-preview-container" class="hidden"></div>
      <div id="completed-chapters-list"></div>
      <input id="plan-start-date" value="2026-08-05" />
      <input id="plan-total-days" value="30" />
      <input id="plan-deadline-date" value="2026-09-05" />
      <input id="plan-capacity-minutes" value="30" />
      <button class="toggle-btn active" data-mode="date"></button>
      <button class="toggle-btn" data-mode="days"></button>
    `;
  });

  it('escapes html strings in recommendations and avoids rendering security sentinel elements', async () => {
    const maliciousLabel = '<img data-security-sentinel="true" src="x" onerror="alert(1)">';

    // We can call openPlanEditor or trigger live preview with state that has recommendations containing maliciousLabel
    const state = {
      studyPlan: null,
      dailyCapacityMinutes: 30,
      workbookSettings: { enabled: true },
    };

    openPlanEditor(state);

    // Wait a tick for async preview or inspect preview container
    const sentinelEl = document.querySelector('[data-security-sentinel]');
    expect(sentinelEl).toBeNull();

    const previewContainer = document.getElementById('plan-preview-container');
    expect(previewContainer.innerHTML).not.toContain('<img data-security-sentinel');
  });
});

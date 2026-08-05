import { describe, it, expect, beforeEach } from 'vitest';
import { renderPlanPreview } from '../ui/plan.js';

describe('UI Plan Preview DOM Security', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="plan-preview-container" class="hidden"></div>
    `;
    delete window.__xssExecuted;
  });

  it('escapes html strings in recommendations and avoids rendering security sentinel elements', () => {
    const container = document.getElementById('plan-preview-container');
    const maliciousPayload =
      '<img data-security-sentinel="true" src="x" onerror="window.__xssExecuted=true">';

    const previewMock = {
      valid: true,
      isTight: true,
      requiredStudyDays: 15,
      totalRequiredMinutes: 450,
      estimatedCompletionDate: '2026-09-01',
      recommendedTargetDate: '2026-09-10',
      recommendations: [
        {
          type: 'extend-deadline',
          label: maliciousPayload,
          recommendedDate: '2026-09-10',
        },
      ],
    };

    renderPlanPreview(container, previewMock, {}, {});

    expect(container.querySelector('[data-security-sentinel]')).toBeNull();
    expect(window.__xssExecuted).not.toBe(true);
    expect(container.textContent).toContain('<img');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeHTML, setSafeHTML } from '../../src/security-helpers.js';

describe('Sanitizer Unit Tests (sanitizeHTML & setSafeHTML)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="test-container"></div>';
    delete window.__xssExecuted;
  });

  const dangerousPayloads = [
    '<script>window.__xssExecuted=true</script>',
    '<img src=x onerror="window.__xssExecuted=true">',
    '<svg onload="window.__xssExecuted=true"></svg>',
    '<a href="javascript:window.__xssExecuted=true">link</a>',
    '<iframe srcdoc="<script>window.__xssExecuted=true</script>"></iframe>',
    '<object data="javascript:alert(1)"></object>',
  ];

  const safeMarkup = `
    <div
      class="card"
      id="safe-card"
      data-testid="safe-card"
      aria-label="Карточка"
    >
      <ruby>日本<rt>にほん</rt></ruby>
      <button type="button">Открыть</button>
    </div>
  `.trim();

  describe('Dangerous Payloads Sanitization', () => {
    dangerousPayloads.forEach((payload, index) => {
      it(`sanitizes dangerous payload #${index + 1}: ${payload.slice(0, 40)}...`, () => {
        const container = document.getElementById('test-container');
        window.__xssExecuted = false;

        const sanitized = sanitizeHTML(payload);

        // 1. Check absence of dangerous tags
        expect(sanitized).not.toMatch(/<script\b/i);
        expect(sanitized).not.toMatch(/<iframe\b/i);
        expect(sanitized).not.toMatch(/<object\b/i);

        // 2. Check absence of all event handlers (on*)
        expect(sanitized).not.toMatch(/\bon[a-z]+\s*=/i);

        // 3. Check absence of dangerous URL schemes
        expect(sanitized).not.toMatch(/javascript:/i);
        expect(sanitized).not.toMatch(/vbscript:/i);
        expect(sanitized).not.toMatch(/data:text\/html/i);

        // 4. Verify setSafeHTML rendering and execution prevention
        setSafeHTML(container, payload);

        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('iframe')).toBeNull();
        expect(container.querySelector('object')).toBeNull();

        // Ensure no element has an on* attribute
        const allElements = container.querySelectorAll('*');
        allElements.forEach((el) => {
          Array.from(el.attributes).forEach((attr) => {
            expect(attr.name.toLowerCase().startsWith('on')).toBe(false);
            expect(attr.value.toLowerCase().includes('javascript:')).toBe(false);
            expect(attr.value.toLowerCase().includes('vbscript:')).toBe(false);
          });
        });

        // 5. Impossibility of execution
        expect(window.__xssExecuted).not.toBe(true);
      });
    });
  });

  describe('Safe Markup Preservation', () => {
    it('preserves valid tags, ruby, rt, button, class, id, ARIA, and safe data-* attributes', () => {
      const container = document.getElementById('test-container');

      const sanitized = sanitizeHTML(safeMarkup);
      expect(sanitized).toContain('class="card"');
      expect(sanitized).toContain('id="safe-card"');
      expect(sanitized).toContain('data-testid="safe-card"');
      expect(sanitized).toContain('aria-label="Карточка"');
      expect(sanitized).toContain('<ruby>');
      expect(sanitized).toContain('<rt>');
      expect(sanitized).toContain('<button');

      setSafeHTML(container, safeMarkup);

      const card = container.querySelector('#safe-card');
      expect(card).not.toBeNull();
      expect(card.classList.contains('card')).toBe(true);
      expect(card.getAttribute('data-testid')).toBe('safe-card');
      expect(card.getAttribute('aria-label')).toBe('Карточка');

      const ruby = card.querySelector('ruby');
      expect(ruby).not.toBeNull();
      expect(ruby.querySelector('rt')).not.toBeNull();
      expect(ruby.querySelector('rt').textContent).toBe('にほん');

      const button = card.querySelector('button');
      expect(button).not.toBeNull();
      expect(button.getAttribute('type')).toBe('button');
      expect(button.textContent).toBe('Открыть');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { auditCode } from '../scripts/security-audit.js';

describe('DOM Security Audit AST Hardening', () => {
  it('allows direct string literal assignment', () => {
    const code = "container.innerHTML = '<div>static</div>';";
    const result = auditCode(code, 'test.js');
    expect(result.violations).toHaveLength(0);
    expect(result.clearedMatches).toBe(1);
  });

  it('allows direct static template literal without interpolation', () => {
    const code = 'container.innerHTML = `<div>static</div>`;';
    const result = auditCode(code, 'test.js');
    expect(result.violations).toHaveLength(0);
    expect(result.clearedMatches).toBe(1);
  });

  it('rejects direct template literal with interpolation', () => {
    const code = 'container.innerHTML = `<div>${value}</div>`;';
    const result = auditCode(code, 'test.js');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].api).toContain('innerHTML');
  });

  it('rejects indirect variable assignment', () => {
    const code = `
      const html = \`<div>\${value}</div>\`;
      container.innerHTML = html;
    `;
    const result = auditCode(code, 'test.js');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toContain('container.innerHTML = html');
  });

  it('rejects function call assignment', () => {
    const code = 'container.innerHTML = getMarkup();';
    const result = auditCode(code, 'test.js');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toContain('container.innerHTML = getMarkup()');
  });

  it('rejects string concatenation assignment', () => {
    const code = 'container.innerHTML = prefix + value;';
    const result = auditCode(code, 'test.js');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toContain('container.innerHTML = prefix + value');
  });
});

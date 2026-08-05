import { describe, expect, it, vi } from 'vitest';
import { validateExternalUrl, safeOpenExternalUrl } from '../../src/security-helpers.js';

describe('Security: URL Validation and Execution', () => {
  it('accepts valid HTTPS, HTTP, and mailto URLs', () => {
    expect(validateExternalUrl('https://example.com')).toBe('https://example.com/');
    expect(validateExternalUrl('http://localhost:3000/path')).toBe('http://localhost:3000/path');
    expect(validateExternalUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('rejects javascript: and dangerous schemes', () => {
    expect(validateExternalUrl('javascript:alert(1)')).toBeNull();
    expect(validateExternalUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(validateExternalUrl('  javascript:alert(1) ')).toBeNull();
    expect(validateExternalUrl('java%73cript:alert(1)')).toBeNull();
    expect(validateExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(validateExternalUrl('vbscript:msgbox(1)')).toBeNull();
    expect(validateExternalUrl('file:///etc/passwd')).toBeNull();
  });

  it('safeOpenExternalUrl opens window with noopener and noreferrer', () => {
    const mockWindow = {
      open: vi.fn().mockReturnValue({ opener: {} }),
    };

    const res = safeOpenExternalUrl('https://example.com', mockWindow);
    expect(res).toBe(true);
    expect(mockWindow.open).toHaveBeenCalledWith(
      'https://example.com/',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('safeOpenExternalUrl refuses to open dangerous javascript: links', () => {
    const mockWindow = {
      open: vi.fn(),
    };

    const res = safeOpenExternalUrl('javascript:alert(1)', mockWindow);
    expect(res).toBe(false);
    expect(mockWindow.open).not.toHaveBeenCalled();
  });
});

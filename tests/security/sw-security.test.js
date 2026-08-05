import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Security: Service Worker Security Inspection', () => {
  const swPath = path.resolve(process.cwd(), 'public/sw.js');

  it('verifies Service Worker restricts fetch handler to same-origin GET requests', () => {
    expect(fs.existsSync(swPath)).toBe(true);

    const swCode = fs.readFileSync(swPath, 'utf8');

    // Check non-GET ignore rule
    expect(swCode).toMatch(/request\.method\s*!==\s*['"]GET['"]/u);

    // Check cross-origin ignore rule
    expect(swCode).toMatch(/url\.origin\s*!==\s*self\.location\.origin/u);

    // Check MIME type strictness (refusing HTML cached as JS/JSON)
    expect(swCode).toContain('Refusing to cache HTML response as JavaScript');
    expect(swCode).toContain('Refusing to cache HTML response as JSON');
  });
});

import { describe, it, expect } from 'vitest';
import { secureRandomId } from '../src/utils.js';

describe('secureRandomId Cryptographically Secure ID Generator', () => {
  it('returns a non-empty string', () => {
    const id = secureRandomId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(10);
  });

  it('generates 1000 unique IDs without collision', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      const id = secureRandomId();
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });

  it('works with getRandomValues fallback if randomUUID is unavailable', () => {
    const originalRandomUUID = globalThis.crypto?.randomUUID;
    try {
      if (globalThis.crypto) {
        // Temporarily hide randomUUID
        globalThis.crypto.randomUUID = undefined;
      }
      const fallbackId = secureRandomId();
      expect(typeof fallbackId).toBe('string');
      expect(fallbackId.length).toBe(32);
    } finally {
      if (globalThis.crypto && originalRandomUUID) {
        globalThis.crypto.randomUUID = originalRandomUUID;
      }
    }
  });

  it('throws an error if no crypto is available at all', () => {
    const originalCrypto = globalThis.crypto;
    try {
      // @ts-ignore
      delete globalThis.crypto;
      expect(() => secureRandomId()).toThrow('Secure random generator is unavailable');
    } finally {
      globalThis.crypto = originalCrypto;
    }
  });
});

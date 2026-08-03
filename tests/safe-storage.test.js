/* eslint-disable no-undef */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeStorage } from '../src/safe-storage.js';

describe('safeStorage module', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('safely gets, sets, and removes items', () => {
    safeStorage.setItem('test_key', 'hello');
    expect(safeStorage.getItem('test_key')).toBe('hello');
    safeStorage.removeItem('test_key');
    expect(safeStorage.getItem('test_key')).toBe(null);
  });

  it('does not throw when localStorage throws SecurityError', () => {
    const spySet = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: Access denied');
    });
    const spyGet = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: Access denied');
    });

    expect(() => safeStorage.setItem('key', 'val')).not.toThrow();
    expect(() => safeStorage.getItem('key')).not.toThrow();
    expect(safeStorage.getItem('key')).toBe(null);

    spySet.mockRestore();
    spyGet.mockRestore();
  });
});

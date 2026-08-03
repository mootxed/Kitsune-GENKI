/* src/safe-storage.js — Resilient wrapper around localStorage for degraded storage conditions */

export const safeStorage = {
  getItem(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('[safeStorage] getItem failed for key:', key, e);
      return null;
    }
  },

  setItem(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn('[safeStorage] setItem failed for key:', key, e);
    }
  },

  removeItem(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('[safeStorage] removeItem failed for key:', key, e);
    }
  },

  clear() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
    } catch (e) {
      console.warn('[safeStorage] clear failed:', e);
    }
  },
};

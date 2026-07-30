/**
 * setup-mocks.js — Global mocks for Vitest test environment
 * Provides browser API mocks that are not available in jsdom
 */

import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';

// ===== Web Speech API Mock =====
// Необходим для тестирования функций озвучки без реального speechSynthesis

global.SpeechSynthesisUtterance = vi.fn(function (text) {
  this.text = text;
  this.lang = 'ja-JP';
  this.voice = null;
  this.volume = 1.0;
  this.rate = 1.0;
  this.pitch = 1.0;
  this.onstart = null;
  this.onend = null;
  this.onerror = null;
  this.onpause = null;
  this.onresume = null;
  this.onmark = null;
  this.onboundary = null;
});

global.speechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => [
    {
      voiceURI: 'ja-JP-mock',
      name: 'Japanese Mock Voice',
      lang: 'ja-JP',
      localService: true,
      default: false,
    },
  ]),
  pending: false,
  speaking: false,
  paused: false,
  onvoiceschanged: null,
};

// ===== LocalStorage Mock =====
// jsdom предоставляет localStorage, но иногда требуется переопределение

if (typeof global.localStorage === 'undefined') {
  const localStorageMock = (() => {
    let store = {};
    return {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => {
        store[key] = String(value);
      }),
      removeItem: vi.fn((key) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      get length() {
        return Object.keys(store).length;
      },
      key: vi.fn((index) => {
        const keys = Object.keys(store);
        return keys[index] || null;
      }),
    };
  })();

  global.localStorage = localStorageMock;
}

// ===== matchMedia Mock =====
// Необходим для тестирования темной/светлой темы

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ===== IntersectionObserver Mock =====
// Необходим для компонентов с ленивой загрузкой

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(() => []),
  root: null,
  rootMargin: '',
  thresholds: [],
}));

// ===== ResizeObserver Mock =====
// Необходим для компонентов с адаптивными размерами

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ===== Fetch Mock for Local Assets =====
const mockFetch = async (input, options) => {
  const urlStr = String(input);
  try {
    const url = new URL(urlStr, 'http://localhost/');
    if (
      url.hostname === 'localhost' ||
      url.hostname === 'example.test' ||
      !/^https?:\/\//i.test(urlStr)
    ) {
      const relPath = url.pathname.replace(/^\/+/u, '');
      let fullPath = path.join(process.cwd(), 'public', relPath);
      if (!fs.existsSync(fullPath)) {
        fullPath = path.join(process.cwd(), relPath);
      }
      if (fs.existsSync(fullPath)) {
        const raw = fs.readFileSync(fullPath, 'utf8');
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => JSON.parse(raw),
          text: async () => raw,
        };
      }
    }
  } catch {
    /* fallback */
  }
  return { ok: false, status: 404, json: async () => null, text: async () => '' };
};

globalThis.fetch = mockFetch;
if (typeof window !== 'undefined') {
  window.fetch = mockFetch;
}
if (typeof global !== 'undefined') {
  global.fetch = mockFetch;
}

console.log('✅ Global mocks initialized for test environment');

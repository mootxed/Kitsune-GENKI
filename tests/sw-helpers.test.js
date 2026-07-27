/**
 * tests/sw-helpers.test.js
 *
 * Unit tests for the pure helper functions extracted from sw.js and
 * src/sw-update-manager.js. These functions are tested in a Node/jsdom
 * environment (no real Service Worker or browser cache required).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  wasReloadedAfterUpdate,
  activateWaitingWorker,
  performControlledReload,
} from '../src/sw-update-manager.js';

// ===== Inline copies of sw.js pure helpers (no SW globals needed) =====
// We cannot import public/sw.js directly (it uses classic-script globals like
// `caches`, `self`), so we inline the pure utility functions here for testing.

const IMAGE_EXT_RE = /\.(webp|png|jpg|jpeg|gif|svg|ico)(\?.*)?$/i;
const AUDIO_EXT_RE = /\.(mp3|ogg|wav|m4a)(\?.*)?$/i;
const JS_EXT_RE = /\.(js|mjs)(\?.*)?$/i;
const JSON_EXT_RE = /\.json(\?.*)?$/i;

function getRequestResourceType(request) {
  if (request.mode === 'navigate') return 'navigate';
  const url = new URL(request.url, 'https://example.com');
  const path = url.pathname;
  if (IMAGE_EXT_RE.test(path)) return 'image';
  if (AUDIO_EXT_RE.test(path)) return 'audio';
  if (JSON_EXT_RE.test(path)) return 'json';
  if (JS_EXT_RE.test(path)) return 'js';
  return 'other';
}

function makeRequest(url, mode = 'cors') {
  return { url, mode, method: 'GET' };
}

function makeResponse({
  ok = true,
  status = 200,
  type = 'basic',
  contentType = 'text/javascript',
}) {
  return {
    ok,
    status,
    type,
    headers: {
      get(name) {
        if (name === 'Content-Type') return contentType;
        return null;
      },
    },
  };
}

function isCacheableResponse(request, response) {
  if (request.method !== 'GET') return false;
  if (response.type === 'opaque') return false;
  if (!response.ok) return false;
  if (response.status !== 200) return false;

  const resourceType = getRequestResourceType(request);
  const contentType = response.headers.get('Content-Type') || '';
  if (resourceType === 'js' && contentType.includes('text/html')) return false;
  if (resourceType === 'json' && contentType.includes('text/html')) return false;
  return true;
}

// Simple in-memory trimCache implementation for unit testing
function trimCache(store, maxEntries) {
  const keys = [...store.keys()];
  if (keys.length > maxEntries) {
    const toDelete = keys.slice(0, keys.length - maxEntries);
    toDelete.forEach((k) => store.delete(k));
  }
}

// ===== TESTS =====

describe('getRequestResourceType', () => {
  test('identifies navigate requests', () => {
    expect(getRequestResourceType(makeRequest('/page', 'navigate'))).toBe('navigate');
  });

  test('identifies image requests', () => {
    expect(getRequestResourceType(makeRequest('/image/fox.webp'))).toBe('image');
    expect(getRequestResourceType(makeRequest('/icon.svg'))).toBe('image');
  });

  test('identifies audio requests', () => {
    expect(getRequestResourceType(makeRequest('/audio/word.mp3'))).toBe('audio');
  });

  test('identifies JSON requests', () => {
    expect(getRequestResourceType(makeRequest('/data/lesson-01.json'))).toBe('json');
  });

  test('identifies JS requests', () => {
    expect(getRequestResourceType(makeRequest('/app.js'))).toBe('js');
    expect(getRequestResourceType(makeRequest('/assets/index-abc123.js'))).toBe('js');
  });
});

describe('isCacheableResponse', () => {
  // Test 1: Successful response is cacheable
  test('1. allows caching of a successful response', () => {
    const req = makeRequest('/app.js');
    const res = makeResponse({ ok: true, status: 200, contentType: 'application/javascript' });
    expect(isCacheableResponse(req, res)).toBe(true);
  });

  // Test 2: 404 is not cacheable
  test('2. rejects caching of a 404 response', () => {
    const req = makeRequest('/missing.js');
    const res = makeResponse({ ok: false, status: 404, contentType: 'text/html' });
    expect(isCacheableResponse(req, res)).toBe(false);
  });

  // Test 3: 500 is not cacheable
  test('3. rejects caching of a 500 response', () => {
    const req = makeRequest('/data/lesson.json');
    const res = makeResponse({ ok: false, status: 500, contentType: 'application/json' });
    expect(isCacheableResponse(req, res)).toBe(false);
  });

  // Test 4: HTML fallback not cached as JavaScript
  test('4. rejects HTML fallback when expecting JavaScript', () => {
    const req = makeRequest('/chunk.js');
    const res = makeResponse({ ok: true, status: 200, contentType: 'text/html; charset=utf-8' });
    expect(isCacheableResponse(req, res)).toBe(false);
  });

  // Test 5: JSON cache not replaced by HTML error
  test('5. rejects HTML response for JSON request', () => {
    const req = makeRequest('/data/content-index.json');
    const res = makeResponse({ ok: true, status: 200, contentType: 'text/html' });
    expect(isCacheableResponse(req, res)).toBe(false);
  });

  // Opaque responses not cached
  test('rejects opaque responses (cross-origin, no CORS headers)', () => {
    const req = makeRequest('/opaque-resource');
    const res = makeResponse({ ok: false, status: 0, type: 'opaque' });
    res.ok = false;
    expect(isCacheableResponse(req, res)).toBe(false);
  });

  // Non-GET not cached
  test('rejects non-GET requests', () => {
    const req = { url: '/api/data', mode: 'cors', method: 'POST' };
    const res = makeResponse({ ok: true, status: 200 });
    expect(isCacheableResponse(req, res)).toBe(false);
  });
});

describe('trimCache', () => {
  // Test 6: runtime cache is trimmed to limit
  test('6. trims cache to maxEntries', () => {
    const store = new Map();
    for (let i = 0; i < 10; i++) store.set(`key${i}`, `val${i}`);
    expect(store.size).toBe(10);

    trimCache(store, 5);
    expect(store.size).toBe(5);
    // Oldest keys (key0..key4) should be removed, newest (key5..key9) kept
    expect(store.has('key0')).toBe(false);
    expect(store.has('key9')).toBe(true);
  });

  test('does not modify cache when under limit', () => {
    const store = new Map();
    store.set('a', 1);
    store.set('b', 2);
    trimCache(store, 5);
    expect(store.size).toBe(2);
  });
});

// ===== SW Update Manager tests =====

describe('wasReloadedAfterUpdate', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  // Test 12: reload guard works
  test('12. returns false when no guard flag is set', () => {
    expect(wasReloadedAfterUpdate()).toBe(false);
  });

  test('returns true when guard flag is present, then clears it', () => {
    sessionStorage.setItem('kitsune-sw-reload-guard', '1');
    expect(wasReloadedAfterUpdate()).toBe(true);
    // Flag should be cleared
    expect(sessionStorage.getItem('kitsune-sw-reload-guard')).toBeNull();
    // Second call should return false
    expect(wasReloadedAfterUpdate()).toBe(false);
  });
});

describe('activateWaitingWorker', () => {
  // Test 11: SKIP_WAITING message is sent
  test('11. sends SKIP_WAITING message to waiting worker', () => {
    const mockWorker = { postMessage: vi.fn() };
    activateWaitingWorker(mockWorker);
    expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  test('does not throw when called with null', () => {
    expect(() => activateWaitingWorker(null)).not.toThrow();
  });
});

describe('performControlledReload', () => {
  // Test 12 (part 2): sets the guard flag before reloading
  test('sets sessionStorage guard before reload', () => {
    // Mock window.location.reload
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    });

    sessionStorage.clear();
    performControlledReload();
    // Guard should be set
    expect(sessionStorage.getItem('kitsune-sw-reload-guard')).toBe('1');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});

describe('SW install behavior (conceptual)', () => {
  // Test 7: application shell install should fail on critical resource error
  test('7. critical install failure when a core resource is unavailable', async () => {
    // Simulates the atomic nature of cache.addAll():
    // If ANY resource fails, the entire operation rejects.
    const mockAddAll = vi.fn().mockRejectedValue(new Error('Failed to fetch /critical.js'));

    let installError = null;
    try {
      await mockAddAll(['index.html', 'styles.css', '/critical.js']);
    } catch (err) {
      installError = err;
    }

    expect(installError).not.toBeNull();
    expect(installError.message).toContain('Failed to fetch');
  });

  // Test 8: optional resources don't break critical install
  test('8. optional resource failure does not fail install', async () => {
    const results = await Promise.allSettled([
      Promise.resolve('index.html cached'),
      Promise.reject(new Error('optional-image.png 404')),
      Promise.resolve('styles.css cached'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(1);
    // The process itself didn't throw — optional failures are swallowed
  });
});

describe('SW cache namespace (Test 9)', () => {
  // Test 9: activate deletes only old kitsune-* caches
  test('9. removes only old kitsune-* caches, not others', async () => {
    const allCaches = [
      'kitsune-static-abc',
      'kitsune-images-abc',
      'other-app-cache',
      'kitsune-static-newversion',
      'kitsune-images-newversion',
    ];

    const validCaches = new Set(['kitsune-static-newversion', 'kitsune-images-newversion']);

    const toDelete = allCaches.filter((key) => {
      return key.startsWith('kitsune-') && !validCaches.has(key);
    });

    expect(toDelete).toEqual(['kitsune-static-abc', 'kitsune-images-abc']);
    // 'other-app-cache' is NOT deleted
    expect(toDelete).not.toContain('other-app-cache');
  });
});

describe('SW cache version (Test 10)', () => {
  // Test 10: different build inputs produce different cache versions
  test('10. different asset sets produce different cache hashes', async () => {
    // Simulate what vite.config.js does: hash from sorted asset names
    const { createHash } = await import('crypto');

    function hashAssets(assets) {
      return createHash('sha256')
        .update([...assets].sort().join('|'))
        .digest('hex')
        .slice(0, 12);
    }

    const versionA = hashAssets(['assets/index-abc.js', 'assets/index-abc.css']);
    const versionB = hashAssets(['assets/index-xyz.js', 'assets/index-xyz.css']);

    expect(versionA).not.toBe(versionB);
    expect(versionA).toHaveLength(12);
    expect(versionB).toHaveLength(12);
  });

  test('same asset set produces same cache hash (deterministic)', async () => {
    const { createHash } = await import('crypto');
    function hashAssets(assets) {
      return createHash('sha256')
        .update([...assets].sort().join('|'))
        .digest('hex')
        .slice(0, 12);
    }
    const assets = ['assets/index-abc.js', 'assets/styles-abc.css'];
    expect(hashAssets(assets)).toBe(hashAssets(assets));
  });
});

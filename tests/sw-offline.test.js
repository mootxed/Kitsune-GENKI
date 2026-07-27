import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Service Worker Offline Hardening', () => {
  const swPath = path.resolve(__dirname, '../public/sw.js');

  it('verifies atomic core shell caching and response.ok checks', () => {
    const swContent = fs.readFileSync(swPath, 'utf8');

    // 1. Core shell assets defined and addAll used
    expect(swContent).toContain('CORE_SHELL_ASSETS');
    expect(swContent).toContain('cache.addAll(coreUrls)');

    // 2. response.ok checks present for caching
    expect(swContent).toContain('networkResponse.ok');

    // 3. Dynamic cache size limits
    expect(swContent).toContain('limitCacheSize');
    expect(swContent).toContain('CACHE_DYNAMIC');
  });
});

# Lazy Loading, Chunk Strategy & Performance Budgets in KotoKitsu

## Overview

KotoKitsu is an offline-first Japanese learning PWA designed for instantaneous startup and minimal initial bundle size. Heavy and infrequently used screens, sub-systems, and third-party libraries are code-split and lazily loaded on demand via dynamic imports (`import()`).

---

## 1. Startup Dependency Graph vs. Lazy Candidates

### Core Startup Graph (Static Entry Points)

The initial startup bundle (`app.js` and `bootstrap/bootstrap-application.js`) includes **only** the critical path:

- Core application shell and main navigation (`ui/app-shell.js`, `router.js`);
- State hydration and IndexedDB storage adapter (`state/store.js`);
- Home screen and active session continuation (`ui/home.js`);
- SRS card review core (`ui/flashcards.js`);
- Theme, accessibility live regions, and toast notifications.

### Lazy Candidates (Code-Split Chunks)

The following screens and sub-systems are loaded dynamically on demand:

- **Statistics**: `ui/statistics.js`
- **Shop & Catalog**: `ui/shop.js`
- **AI Sensei & AI Stories**: `ui/chat.js`, `ui/ai-story.js`
- **Stories / Library**: `ui/stories.js`
- **User Dictionaries**: `ui/user-dictionaries.js`
- **Word Details**: `ui/word-details.js`
- **Study Plan & Goals Editor**: `ui/plan.js`
- **DevTools & Diagnostics**: `ui/dev-tools.js`
- **Minigames**: `ui/crossword.js`, `ui/word-search.js`
- **HanziWriter Library**: `vendor-hanziwriter` chunk loaded dynamically upon entering character drawing mode or dictionary kanji view.

---

## 2. Infrastructure & Dynamic HTML Generation

### `ui/lazy-screen-loader.js`

Provides a central lazy loading coordinator:

- `loadScreenModule(screenId, importFn, options)`: Handles dynamic module resolution with Promise deduplication (prevents duplicate network fetches for concurrent navigations).
- **Error Classification**:
  - `LAZY_CHUNK_LOAD_FAILED`: Generic network / chunk failure;
  - `OFFLINE_CHUNK_NOT_CACHED`: User is offline and chunk was never cached;
  - `STALE_SERVICE_WORKER_CHUNK`: Chunk hash changed after SW update.
- **Loading & Retry UI**: Renders non-intrusive loading skeleton and offline retry controls.
- **Controlled Prefetching**: `prefetchScreen(screenId)` prefetches screens during idle periods (`requestIdleCallback`) only when `Save-Data` network restriction is inactive.

### `ui/screen-templates.js`

Reduces static `index.html` size by dynamically injecting screen `<section>` DOM containers on first navigation:

- `getOrCreateScreenContainer(screenId)`: Returns existing DOM container or constructs `<section class="screen hidden" id="screen-${screenId}">` with dynamic skeleton templates on demand.

---

## 3. Performance Budgets

Performance budgets are version-controlled in `performance-budgets.json`:

```json
{
  "initialJavaScript": {
    "rawBytes": 800000,
    "gzipBytes": 230000,
    "maxInitialChunks": 3
  },
  "initialCss": {
    "rawBytes": 250000,
    "gzipBytes": 45000
  },
  "initialHtml": {
    "rawBytes": 15000,
    "gzipBytes": 5000
  },
  "forbiddenInitialModules": [
    "ui/chat.js",
    "ui/ai-story.js",
    "hanzi-writer",
    "ui/dev-tools.js",
    "ui/statistics.js",
    "ui/crossword.js",
    "ui/word-search.js",
    "ui/plan.js",
    "ui/shop.js"
  ]
}
```

### Verification Command

Run build-time budget validation locally or in CI:

```bash
npm run performance:check
```

---

## 4. Production Sourcemaps Policy (Option B: Hidden Sourcemaps)

KotoKitsu enforces **Option B: Hidden Sourcemaps** for production builds:

1. `vite.config.js` sets `build: { sourcemap: 'hidden' }`. Vite emits `.map` files to disk without inserting public `sourceMappingURL` comments in compiled `.js` or `.css` files.
2. `npm run build:isolate-sourcemaps` moves all `.map` files out of `dist/` into `.sourcemaps/` for closed CI artifact archiving.
3. `npm run build:check-sourcemaps` verifies that zero `.map` files or `sourceMappingURL` references exist in public deployment output.

---

## 5. Developer Guide: Adding a New Lazy Screen or Heavy Library

### Step 1: Create Screen Module

Place the screen UI code in `ui/my-feature.js`. Ensure it exports a primary render function (e.g. `export function renderMyFeature(state, options)`).

### Step 2: Register Dynamic Route in `ui/app-shell.js`

```javascript
'my-feature': async (options, context) => {
  const { renderMyFeature } = await import('./my-feature.js');
  return renderMyFeature(state, dependencies, options, context);
}
```

### Step 3: Add Dynamic Container Template in `ui/screen-templates.js`

Add a template definition in `SCREEN_TEMPLATES['my-feature']` if custom skeleton markup is required.

### Step 4: Include Heavy Libraries Dynamically

Never statically import heavy npm libraries at module top level. Use dynamic getters:

```javascript
let cachedLib = null;
async function getHeavyLibrary() {
  if (!cachedLib) {
    const mod = await import('heavy-library');
    cachedLib = mod.default || mod;
  }
  return cachedLib;
}
```

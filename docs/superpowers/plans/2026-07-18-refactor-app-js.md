# Refactor app.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the first set of testable, pure/stateless modules from the 5691-line `app.js` main controller while preserving all runtime behavior and keeping tests passing.

**Architecture:** Pull domain-agnostic utilities, the XP/level/rank rules, and SRS query helpers into focused ES modules under `src/`. `app.js` becomes a thinner controller that imports these modules and wires them to global state and the DOM. Existing tests are updated to import the real functions instead of duplicating them.

**Tech Stack:** Vanilla ES modules, Vite, Vitest, jsdom.

## Global Constraints

- No new runtime dependencies.
- Existing public API of `app.js` (global window bindings, DOM element IDs, event handlers) must remain unchanged.
- All existing tests must pass after each task.
- New modules live under `src/` and use named exports.
- File paths in the project root are relative to `vite.config.js` root (`.`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/utils.js` | DOM selectors (`$`, `$$`), date formatting (`todayStr`, `formatTimeUntilReset`, `monthLabel`), Russian pluralization (`pluralDays`). |
| `src/xp-system.js` | XP/level/rank constants and rules (`addXP`, `getUserRankData`, `xpToNextLevel`). |
| `src/srs-helpers.js` | Pure queries over SRS records (`dueCards`, `allCards`, `cardChapter`, `wordById`, `isWordUnlocked`). |
| `app.js` | Main controller; imports the modules above and removes the extracted definitions. |
| `tests/app.test.js` | Updated to import `addXP`, `getUserRankData`, etc. from the new modules. |

---

### Task 1: Extract utility functions to `src/utils.js`

**Files:**
- Create: `src/utils.js`
- Modify: `app.js:18-20`, `app.js:396-400`, `app.js:540-551`, `app.js:925-935`

**Interfaces:**
- Produces: `export const $`, `export const $$`, `export const todayStr`, `export const formatTimeUntilReset`, `export const pluralDays`, `export const monthLabel`, `export const heatmapLevel`.

- [ ] **Step 1: Create `src/utils.js`**

```javascript
/* src/utils.js — small, stateless helpers */

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

export const todayStr = () => new Date().toISOString().slice(0, 10);

export function formatTimeUntilReset() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const diff = tomorrow - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `⏰ ${hours}ч ${minutes}м`;
}

export function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "день";
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return "дня";
  return "дней";
}

const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function monthLabel(date) {
  return `${MONTHS_RU[date.getMonth()]} ${date.getFullYear()}`;
}

export function heatmapLevel(count) {
  if (count === 0) return "0";
  if (count <= 2) return "1";
  if (count <= 5) return "2";
  if (count <= 10) return "3";
  return "4";
}
```

- [ ] **Step 2: Remove duplicated definitions from `app.js`**

Delete these lines from `app.js`:
- `const $ = (s, r) => ...;`
- `const $$ = (s, r) => ...;`
- `const todayStr = () => ...;`
- `function formatTimeUntilReset() { ... }`
- `function pluralDays(n) { ... }`
- `function monthLabel(date) { ... }`
- `function heatmapLevel(count) { ... }`
- `const MONTHS_RU = [...];` (after extracting it into `utils.js`)

Add at the top of `app.js` (after existing imports):

```javascript
import { $, $$, todayStr, formatTimeUntilReset, pluralDays, monthLabel, heatmapLevel } from './src/utils.js';
```

- [ ] **Step 3: Run the existing test suite**

Run: `npm test`
Expected: PASS (Task 1 does not change behavior).

- [ ] **Step 4: Commit**

```bash
git add src/utils.js app.js docs/superpowers/plans/2026-07-18-refactor-app-js.md
git commit -m "refactor: extract stateless utilities into src/utils.js"
```

---

### Task 2: Extract XP/Level/Rank system to `src/xp-system.js`

**Files:**
- Create: `src/xp-system.js`
- Modify: `app.js:21-25`, `app.js:150-195`
- Modify: `tests/app.test.js`

**Interfaces:**
- Produces:
  - `XP_PER_LEVEL`, `XP_CARD`, `XP_CHECK`, `XP_CHAPTER_FULL`, `COINS_PER_LEVEL`
  - `addXP(amount, state, callbacks)` — mutates `state.xp`, `state.level`, `state.coins`; calls `callbacks.onLevelUp(level)` and `callbacks.onSave()` when level changes.
  - `getUserRankData(level)`
  - `xpToNextLevel(currentXP)`

- [ ] **Step 1: Create `src/xp-system.js`**

```javascript
/* src/xp-system.js — XP, level, rank rules */

export const XP_PER_LEVEL = 100;
export const XP_CARD = 1;
export const XP_CHECK = 20;
export const XP_CHAPTER_FULL = 100;
export const COINS_PER_LEVEL = 50;

/**
 * Add XP to the player, level up as needed, and award coins.
 * @param {number} amount
 * @param {object} state — mutable state with xp, level, coins
 * @param {object} callbacks — { onLevelUp(level), onSave() }
 */
export function addXP(amount, state, callbacks = {}) {
  state.xp += amount;
  let leveledUp = false;
  while (state.xp >= XP_PER_LEVEL) {
    state.xp -= XP_PER_LEVEL;
    state.level += 1;
    state.coins += COINS_PER_LEVEL;
    leveledUp = true;
    if (callbacks.onLevelUp) callbacks.onLevelUp(state.level);
  }
  if (leveledUp && callbacks.onSave) callbacks.onSave();
}

export function xpToNextLevel(currentXP) {
  return XP_PER_LEVEL - currentXP;
}

export function getUserRankData(level) {
  const effectiveLevel = Math.max(1, Math.min(96, level));

  let league = "alpha";
  let leagueName = "Альфа";
  let baseLevel = effectiveLevel;

  if (effectiveLevel > 72) {
    league = "delta";
    leagueName = "Дельта Мастер";
    baseLevel = effectiveLevel - 72;
  } else if (effectiveLevel > 48) {
    league = "gamma";
    leagueName = "Гамма";
    baseLevel = effectiveLevel - 48;
  } else if (effectiveLevel > 24) {
    league = "beta";
    leagueName = "Бета";
    baseLevel = effectiveLevel - 24;
  }

  const iconNumber = Math.ceil(baseLevel / 2);
  const paddedNumber = String(iconNumber).padStart(2, '0');

  return {
    name: `${leagueName} — Ранг ${iconNumber}`,
    leagueName,
    levelSuffix: `Ранг ${iconNumber}`,
    icon: `${league}_${paddedNumber}.png`,
  };
}
```

- [ ] **Step 2: Update `app.js`**

Add import:

```javascript
import {
  XP_PER_LEVEL, XP_CARD, XP_CHECK, XP_CHAPTER_FULL, COINS_PER_LEVEL,
  addXP, getUserRankData, xpToNextLevel,
} from './src/xp-system.js';
```

Delete from `app.js`:
- `const XP_PER_LEVEL = 100;` and the other XP/COIN constants
- `function addXP(amount) { ... }`
- `function getUserRankData(level) { ... }`

Replace the old `addXP` body with:

```javascript
function appAddXP(amount) {
  addXP(amount, state, {
    onLevelUp: (level) => toast(`🎉 Уровень ${level}! +${COINS_PER_LEVEL} 🪙`),
    onSave: save,
  });
}
```

Then replace every internal call to `addXP(...)` with `appAddXP(...)`. There should be only a few call sites.

- [ ] **Step 3: Update `tests/app.test.js`**

Replace the duplicated `addXP` and `getUserRankData` implementations with imports:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { XP_PER_LEVEL, COINS_PER_LEVEL, addXP, getUserRankData, xpToNextLevel } from '../src/xp-system.js';
```

Update the test helpers to use the imported functions. The existing test state object stays the same, but `addXP` now requires the state to be passed:

```javascript
function testAddXP(amount) {
  addXP(amount, state, {
    onLevelUp: (level) => levelUpCallbacks.forEach(cb => cb(level)),
  });
}
```

Replace all `addXP(...)` calls inside tests with `testAddXP(...)`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/xp-system.js app.js tests/app.test.js
git commit -m "refactor: extract XP/level/rank system into src/xp-system.js"
```

---

### Task 3: Extract SRS helpers to `src/srs-helpers.js`

**Files:**
- Create: `src/srs-helpers.js`
- Modify: `app.js:479-522`

**Interfaces:**
- Produces:
  - `cardChapter(cardId)`
  - `wordById(wordId, lessons)`
  - `isWordUnlocked(wordId, chapters)`
  - `dueCards(srsRecords, chapterId, now)`
  - `allCards(srsRecords, chapterId)`
- Consumes: `SRS` from `srs.js` (imported inside `srs-helpers.js`).

- [ ] **Step 1: Create `src/srs-helpers.js`**

```javascript
/* src/srs-helpers.js — pure queries over SRS records */
import { SRS } from './srs.js';

export function cardChapter(cardId) {
  const m = /^L(\d+)_/.exec(cardId);
  return m ? parseInt(m[1], 10) : null;
}

export function wordById(wordId, lessons) {
  for (const l of lessons) {
    const w = l.words.find((x) => x.id === wordId);
    if (w) return w;
  }
  return null;
}

export function isWordUnlocked(wordId, chapters) {
  const chapterId = cardChapter(wordId);
  if (!chapterId) return true;
  const chapter = chapters[chapterId];
  if (!chapter) return false;

  const completedLessons = Object.values(chapter.checklist || {}).filter(val => val === true).length;
  return completedLessons >= 3;
}

export function dueCards(srsRecords, chapterId, now = Date.now()) {
  const seen = new Set();
  return Object.values(srsRecords).filter((c) => {
    if (chapterId && cardChapter(c.id) !== chapterId) return false;
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return SRS.isDue(c, now);
  });
}

export function allCards(srsRecords, chapterId) {
  return Object.values(srsRecords).filter((c) => !chapterId || cardChapter(c.id) === chapterId);
}
```

- [ ] **Step 2: Update `app.js`**

Add import:

```javascript
import { cardChapter, wordById, isWordUnlocked, dueCards, allCards } from './src/srs-helpers.js';
```

Delete the old definitions of `cardChapter`, `wordById`, `isWordUnlocked`, `dueCards`, `allCards`.

Replace call sites to pass state explicitly:
- `dueCards(chapterId)` → `dueCards(state.srs, chapterId)`
- `allCards(chapterId)` → `allCards(state.srs, chapterId)`
- `wordById(id)` → `wordById(id, LESSONS)`
- `isWordUnlocked(wordId)` → `isWordUnlocked(wordId, state.chapters)`

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/srs-helpers.js app.js
git commit -m "refactor: extract SRS query helpers into src/srs-helpers.js"
```

---

### Task 4: Remove dead code and verify build

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Remove any now-unused imports or variables**

Run the test suite and the build; if any constants (e.g. `XP_CARD`, `XP_CHECK`) are no longer referenced inside `app.js` but still needed elsewhere, keep them. If they are truly unused, remove them from the import.

- [ ] **Step 2: Run full verification**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: clean up imports after module extraction"
```

---

## Self-Review

**Spec coverage:** The implicit spec is "make app.js more maintainable and testable without changing behavior". Task 1 covers utilities, Task 2 covers XP/level/rank, Task 3 covers SRS queries. Task 4 verifies the build.

**Placeholder scan:** No TBD/TODO. All code blocks contain complete implementations.

**Type consistency:** Functions keep the same names and signatures except where state is now passed as an explicit parameter (`addXP`, `dueCards`, etc.). The `state`/`LESSONS` objects are the same shapes as before.

**Risk note:** `app.js` still contains 5000+ lines of render and event-handling code. This plan is intentionally a first phase; further extraction should happen after this phase is merged.

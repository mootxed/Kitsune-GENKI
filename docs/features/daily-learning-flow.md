# Daily Learning Flow & Core UX Guarantees

## Overview

KotoKitsu unifies all core learning features into a single, predictable daily learning flow before the first public alpha.

## Core User Guarantees

1. **What to do now**: Home screen presents a single, deterministic primary CTA ("Продолжить обучение" / "Продолжить сессию").
2. **Why tasks are scheduled**: Flashcards display a explicit "Почему эта карточка сейчас" badge with real FSRS retrievability, due status, or new plan source.
3. **Time estimate**: Daily load is predicted in minutes (~20–30 min default) and shown in a 7-day forecast.
4. **FSRS vs Practice separation**: Mandatory memory retention reviews are visually and logically separated from supplemental exercises.
5. **Missed days handling**: Backlog is automatically redistributed across days via Recovery Mode without penalizing or shaming the user.
6. **Data safety & Interrupted sessions**: Interrupted study sessions restore with one click. Critical storage failures present a dedicated Storage Recovery Screen with backups and diagnostic export.

## Subsystem Architecture

### 1. Home View Model & State Machine (`ui/home.js`)

States: `FIRST_RUN`, `PLAN_REQUIRED`, `SESSION_INTERRUPTED`, `STORAGE_RECOVERY_REQUIRED`, `TODAY_IN_PROGRESS`, `TODAY_COMPLETED`, `PLAN_RECOVERY`, `NO_DUE_TASKS`.

### 2. Card Scheduling Reason Model (`src/reason-model.js`)

Structured reason codes:

- `FSRS_DUE_REVIEW`
- `FSRS_OVERDUE`
- `FSRS_RELEARNING`
- `NEW_PLAN_ITEM`
- `SKILL_PROGRESSION`
- `ACTIVE_SESSION_RESTORE`
- `SUPPLEMENTAL_PRACTICE`
- `MANUAL_PRACTICE`
- `COURSE_REQUIREMENT`

### 3. Load Forecast Service (`src/forecast-service.js`)

Calculates a 7-day outlook combining scheduled due dates, planned new cards, historical response speed (ms/card), and daily capacity limits.

### 4. Plan Risk & Automatic Load Adaptation (`src/plan-risk-adaptation.js`)

Evaluates risk levels (`normal`, `elevated`, `unrealistic`, `recovery`) and throttles new card intake when review backlog builds up. FSRS due reviews are never postponed automatically.

### 5. Local Action Journal & Undo (`src/action-journal.js`)

Maintains a local journal of app and user actions for Undo (daily load adjustments, goal changes, auto adaptation reverts) and diagnostic report exports with sensitive information redacted.

### 6. Storage Recovery Screen (`ui/storage-recovery.js`)

Presented when storage or database migrations fail, allowing users to retry loading, restore from automated pre-migration backups, or export diagnostics safely.

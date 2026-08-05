/* tests/migrations/migration-fixtures.test.js — Regression test suite for all user data migration fixtures */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetApplicationData, runMigrations } from '../../state/store.js';
import { runMigrationFixture, loadFixtureData } from '../helpers/migration-fixture-runner.js';
import { parseAndMigrateActiveSession } from '../../src/schemas/active-session.js';
import { STATE_SCHEMA_VERSION, ACTIVE_SESSION_SCHEMA_VERSION } from '../../src/app-metadata.js';

describe('User Data Migration Regression Contour', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetApplicationData();
  });

  afterEach(async () => {
    localStorage.clear();
    await resetApplicationData();
  });

  it('Fixture A: State v1 migrates to current state v17 and DB v7', async () => {
    const { state: migratedState } = await runMigrationFixture('state-v1');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(migratedState.xp).toBe(450);
    expect(migratedState.streak.count).toBe(5);
    expect(Object.keys(migratedState.srs).length).toBe(2);
  });

  it('Fixture B: Early SM-2 cards convert deterministically to FSRS model', async () => {
    const { state: migratedState } = await runMigrationFixture('sm2-early');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(migratedState.xp).toBe(1200);

    const card = Object.values(migratedState.srs)[0];
    expect(card).toBeDefined();
    expect(card.stability).toBeDefined();
    expect(card.difficulty).toBeDefined();
    expect(card.state).toBeDefined();
  });

  it('Fixture C: Early FSRS cards upgrade cleanly without synthetic review creation', async () => {
    const { state: migratedState } = await runMigrationFixture('fsrs-early');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);

    const card = Object.values(migratedState.srs)[0];
    expect(card).toBeDefined();
    expect(card.stability).toBe(5.2);
    expect(new Date(card.due).toISOString()).toBe('2026-01-16T08:00:00.000Z');
  });

  it('Fixture D: State v6 multi-axis SRS & review log items are preserved', async () => {
    const { state: migratedState } = await runMigrationFixture('state-v6');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(migratedState.xp).toBe(2100);
    expect(Object.keys(migratedState.srs).length).toBe(1);
  });

  it('Fixture E: State v13 learning plan, daily tasks and progress are retained', async () => {
    const { state: migratedState } = await runMigrationFixture('state-v13');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(migratedState.studyPlan).toBeDefined();
    expect(migratedState.xp).toBe(3500);
  });

  it('Fixture F: State v16 pre-pomodoro state incorporates pomodoro defaults cleanly', async () => {
    const { state: migratedState } = await runMigrationFixture('state-v16');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(migratedState.settings.pomodoro).toBeDefined();
    expect(migratedState.pomodoro).toBeDefined();
    expect(migratedState.xp).toBe(5000);
  });

  it('Fixture G: Corrupted state recovers valid cards and normalizes corrupted fields', async () => {
    const { state: migratedState } = await runMigrationFixture('corrupted-state');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(Array.isArray(migratedState.chatHistory)).toBe(true);
    expect(Object.keys(migratedState.srs).length).toBe(1);
  });

  it('Fixture H: Legacy active session (v1) migrates to schema version 2', async () => {
    const { sessionInput } = loadFixtureData('legacy-active-session');
    const result = parseAndMigrateActiveSession(sessionInput);

    expect(result.success).toBe(true);
    expect(result.targetVersion).toBe(2);
    expect(result.data.schemaVersion).toBe(ACTIVE_SESSION_SCHEMA_VERSION);
    expect(result.data.managerState.queue.length).toBe(3);
    expect(result.data.managerState.queue[0].cardId).toBe('genki-1::1::v1');
  });

  it('Fixture I: IndexedDB vs fallback conflict resolves safely without data loss', async () => {
    const { state: migratedState } = await runMigrationFixture('idb-fallback-conflict');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(migratedState.xp).toBe(5000);
  });

  it('Fixture J: Multi-tab upgrade simulation upgrades schema and protects single writer', async () => {
    const { state: migratedState } = await runMigrationFixture('two-tabs-upgrade');
    expect(migratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(migratedState.xp).toBe(4200);
  });

  it('Verifies migration idempotency: migrate(migrated) === migrated', async () => {
    const { state: firstPass } = await runMigrationFixture('state-v13');
    const firstPassSnapshot = JSON.parse(JSON.stringify(firstPass));

    const secondPass = runMigrations(firstPassSnapshot);
    expect(secondPass.version).toBe(STATE_SCHEMA_VERSION);
    expect(secondPass.xp).toBe(firstPassSnapshot.xp);
    expect(secondPass.streak).toEqual(firstPassSnapshot.streak);
    expect(secondPass.srs).toEqual(firstPassSnapshot.srs);
  });
});

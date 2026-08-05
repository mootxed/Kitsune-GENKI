/* tests/helpers/migration-fixture-runner.js — Test helper to execute real migration path on fixtures */

import fs from 'fs';
import path from 'path';
import { vi, expect } from 'vitest';
import { db, initializeDB, STORES } from '../../src/db.js';
import { loadState, runMigrations, state } from '../../state/store.js';
import { migrateFromLocalStorage } from '../../src/migration.js';
import { loadSessionFromDB } from '../../session-manager.js';
import { STATE_SCHEMA_VERSION, ACTIVE_SESSION_SCHEMA_VERSION } from '../../src/app-metadata.js';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/migrations');

/**
 * Загрузить данные fixture по его ID
 */
export function loadFixtureData(fixtureId) {
  const dirPath = path.join(FIXTURES_DIR, fixtureId);
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Fixture directory not found: ${fixtureId}`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(dirPath, 'manifest.json'), 'utf8'));
  const expected = JSON.parse(fs.readFileSync(path.join(dirPath, 'expected.json'), 'utf8'));

  let stateInput = null;
  let sessionInput = null;
  let idbInput = null;
  let lsInput = null;

  if (fs.existsSync(path.join(dirPath, 'state.json'))) {
    stateInput = JSON.parse(fs.readFileSync(path.join(dirPath, 'state.json'), 'utf8'));
  }
  if (fs.existsSync(path.join(dirPath, 'session.json'))) {
    sessionInput = JSON.parse(fs.readFileSync(path.join(dirPath, 'session.json'), 'utf8'));
  }
  if (fs.existsSync(path.join(dirPath, 'idbState.json'))) {
    idbInput = JSON.parse(fs.readFileSync(path.join(dirPath, 'idbState.json'), 'utf8'));
  }
  if (fs.existsSync(path.join(dirPath, 'lsState.json'))) {
    lsInput = JSON.parse(fs.readFileSync(path.join(dirPath, 'lsState.json'), 'utf8'));
  }

  return { dirPath, manifest, expected, stateInput, sessionInput, idbInput, lsInput };
}

/**
 * Прогнать реальный путь миграции для fixture и проверить семантические инварианты
 */
export async function runMigrationFixture(fixtureId) {
  const { manifest, expected, stateInput, sessionInput, idbInput, lsInput } =
    loadFixtureData(fixtureId);

  // 1. Фиксируем системное время
  if (manifest.fixedNow) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(manifest.fixedNow));
  }

  try {
    // 2. Инициализируем IndexedDB
    const database = await initializeDB();

    // 3. Подготавливаем исходное состояние хранилищ
    if (idbInput) {
      await database.set(STORES.APP_STATE, 'state', idbInput);
      await database.set(STORES.UI_PREFERENCES, 'idb_migrated', true);
    }
    if (lsInput) {
      localStorage.setItem('kitsune_state_v1', JSON.stringify(lsInput));
    }
    if (stateInput && !idbInput) {
      await database.set(STORES.APP_STATE, 'state', stateInput);
      if (!lsInput) {
        localStorage.setItem('kitsune_state_v1', JSON.stringify(stateInput));
      }
    }
    if (sessionInput) {
      await database.set(STORES.ACTIVE_SESSION, 'current', {
        id: 'current',
        data: sessionInput,
        updatedAt: Date.now(),
      });
    }

    // 4. Запускаем production loader / migration path
    if (localStorage.getItem('kitsune_state_v1')) {
      await migrateFromLocalStorage();
    }
    await loadState();

    // 5. Проверяем целевые версии схем
    expect(state.version).toBe(STATE_SCHEMA_VERSION);

    // 6. Проверяем семантические инварианты
    if (expected.xp !== undefined) {
      expect(state.xp).toBe(expected.xp);
    }
    if (expected.streak !== undefined) {
      const streakCount = typeof state.streak === 'object' ? state.streak.count : state.streak;
      expect(streakCount).toBe(expected.streak);
    }
    if (expected.cards !== undefined) {
      const cardCount = Object.keys(state.srs || {}).length;
      expect(cardCount).toBe(expected.cards);
    }

    // 7. Если проверялась активная сессия
    if (sessionInput) {
      const activeSession = await loadSessionFromDB();
      if (expected.activeSessionSchemaVersion) {
        expect(activeSession).not.toBeNull();
        expect(activeSession.schemaVersion).toBe(ACTIVE_SESSION_SCHEMA_VERSION);
      }
      if (expected.queueLength !== undefined) {
        expect(activeSession.managerState.queue.length).toBe(expected.queueLength);
      }
    }

    // 8. Проверка идемпотентности: повторная миграция уже актуального состояния
    const stateBeforeReMigrate = JSON.parse(JSON.stringify(state));
    const reMigratedState = runMigrations(stateBeforeReMigrate);
    expect(reMigratedState.version).toBe(STATE_SCHEMA_VERSION);
    expect(reMigratedState.xp).toBe(stateBeforeReMigrate.xp);
    expect(Object.keys(reMigratedState.srs || {}).length).toBe(
      Object.keys(stateBeforeReMigrate.srs || {}).length
    );

    return { state, manifest, expected };
  } finally {
    if (manifest.fixedNow) {
      vi.useRealTimers();
    }
  }
}

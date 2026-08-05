/* tests/state-migrations-registry.test.js — Structural tests for State migrations registry */

import { describe, test, expect } from 'vitest';
import {
  STATE_MIGRATIONS,
  validateMigrationsRegistry,
  migrateState,
} from '../state/migrations/index.js';

describe('State Migrations Registry & Runner', () => {
  test('default STATE_MIGRATIONS registry is strictly continuous and valid', () => {
    expect(() => validateMigrationsRegistry(STATE_MIGRATIONS)).not.toThrow();
  });

  test('validateMigrationsRegistry throws on version gap', () => {
    const invalidMigrations = [
      { from: 1, to: 2, migrate: (s) => s },
      { from: 3, to: 4, migrate: (s) => s },
    ];
    expect(() => validateMigrationsRegistry(invalidMigrations)).toThrow();
  });

  test('migrateState throws if current version is greater than target version', () => {
    const state = { version: 5 };
    expect(() => migrateState(state, 3)).toThrow();
  });
});

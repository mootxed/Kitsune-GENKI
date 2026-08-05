/* state/migrations/index.js — State Migrations Registry and Runner */

import { migrationV1ToV2 } from './migrate-v1-to-v2.js';
import { migrationV2ToV3 } from './migrate-v2-to-v3.js';
import { migrationV3ToV4 } from './migrate-v3-to-v4.js';
import { migrationV4ToV5 } from './migrate-v4-to-v5.js';
import { migrationV5ToV6 } from './migrate-v5-to-v6.js';
import { migrationV6ToV7 } from './migrate-v6-to-v7.js';
import { migrationV7ToV8 } from './migrate-v7-to-v8.js';
import { migrationV8ToV9 } from './migrate-v8-to-v9.js';
import { migrationV9ToV10 } from './migrate-v9-to-v10.js';
import { migrationV10ToV11 } from './migrate-v10-to-v11.js';
import { migrationV11ToV12 } from './migrate-v11-to-v12.js';
import { migrationV12ToV13 } from './migrate-v12-to-v13.js';
import { migrationV13ToV14 } from './migrate-v13-to-v14.js';
import { migrationV14ToV15 } from './migrate-v14-to-v15.js';
import { migrationV15ToV16 } from './migrate-v15-to-v16.js';
import { migrationV16ToV17 } from './migrate-v16-to-v17.js';

export const STATE_MIGRATIONS = [
  migrationV1ToV2,
  migrationV2ToV3,
  migrationV3ToV4,
  migrationV4ToV5,
  migrationV5ToV6,
  migrationV6ToV7,
  migrationV7ToV8,
  migrationV8ToV9,
  migrationV9ToV10,
  migrationV10ToV11,
  migrationV11ToV12,
  migrationV12ToV13,
  migrationV13ToV14,
  migrationV14ToV15,
  migrationV15ToV16,
  migrationV16ToV17,
];

/**
 * Validates continuity and structure of state migrations registry.
 */
export function validateMigrationsRegistry(migrations = STATE_MIGRATIONS) {
  const seenFrom = new Set();

  for (let i = 0; i < migrations.length; i++) {
    const item = migrations[i];
    if (!item || typeof item.from !== 'number' || typeof item.to !== 'number') {
      throw new Error(`[StateMigrations] Migration at index ${i} has invalid signature.`);
    }
    if (item.to !== item.from + 1) {
      throw new Error(
        `[StateMigrations] Migration step ${item.from} -> ${item.to} is non-sequential.`
      );
    }
    if (seenFrom.has(item.from)) {
      throw new Error(`[StateMigrations] Duplicate migration from version ${item.from}.`);
    }
    seenFrom.add(item.from);

    if (i > 0) {
      const prev = migrations[i - 1];
      if (item.from !== prev.to) {
        throw new Error(
          `[StateMigrations] Version gap detected between ${prev.to} and ${item.from}.`
        );
      }
    }
  }

  return true;
}

// Perform structural check on module load
validateMigrationsRegistry();

/**
 * Applies sequential state migrations to bring old state up to target version.
 *
 * @param {Object} rawState Input state object
 * @param {number} targetVersion Destination schema version
 * @param {Object} [context] Optional migration context
 * @returns {Object} Migrated state object
 */
export function migrateState(rawState, targetVersion, context = {}) {
  if (!rawState) return rawState;
  let currentVersion = rawState.version || 1;

  if (currentVersion === targetVersion) {
    return rawState;
  }

  let currentState = { ...rawState };

  if (currentVersion > targetVersion) {
    throw new Error(
      `[StateMigrations] Cannot migrate state version ${currentVersion} backwards or down to ${targetVersion}.`
    );
  }

  while (currentVersion < targetVersion) {
    const nextVersion = currentVersion + 1;
    const migration = STATE_MIGRATIONS.find((m) => m.from === currentVersion);

    if (!migration) {
      throw new Error(
        `[StateMigrations] Missing migration step for version ${currentVersion} -> ${nextVersion}.`
      );
    }

    currentState = migration.migrate(currentState, context);
    currentState.version = nextVersion;
    currentVersion = nextVersion;
  }

  return currentState;
}

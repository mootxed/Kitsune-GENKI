/* state/migrations/migrate-v3-to-v4.js — Migration v3 -> v4 */

import { SRS } from '../../srs.js';

export const migrationV3ToV4 = {
  from: 3,
  to: 4,
  migrate(oldState) {
    const migratedState = { ...oldState, srs: { ...(oldState.srs || {}) } };
    for (const [cardId, card] of Object.entries(migratedState.srs)) {
      const normalized = SRS.migrateSM2ToFSRS({ ...card, id: card.id || cardId });
      if (
        Object.hasOwn(card, 'progress') ||
        normalized.reps > 0 ||
        Number(normalized.stability) > 0
      ) {
        normalized.legacyMasteryEstimated = true;
      }
      migratedState.srs[cardId] = normalized;
    }
    migratedState.reviewEvents = Array.isArray(oldState.reviewEvents) ? oldState.reviewEvents : [];
    migratedState.version = 4;
    return migratedState;
  },
};

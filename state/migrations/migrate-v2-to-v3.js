/* state/migrations/migrate-v2-to-v3.js — Migration v2 -> v3 */

import { SRS } from '../../srs.js';

export const migrationV2ToV3 = {
  from: 2,
  to: 3,
  migrate(oldState) {
    const migratedState = { ...oldState };
    const srs = migratedState.srs || {};

    Object.keys(srs).forEach((cardId) => {
      try {
        srs[cardId] = SRS.migrateSM2ToFSRS(srs[cardId]);
      } catch (err) {
        console.error(`[Store] Ошибка миграции карточки ${cardId} на FSRS:`, err);
      }
    });

    migratedState.srs = srs;
    migratedState.version = 3;

    return migratedState;
  },
};

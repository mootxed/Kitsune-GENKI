/* state/migrations/migrate-v14-to-v15.js — Migration v14 -> v15 */

import { migrateGenki1StateV15 } from '../../src/courses/genki-1/migrations/state-v15.js';

export const migrationV14ToV15 = {
  from: 14,
  to: 15,
  migrate(oldState) {
    return migrateGenki1StateV15(oldState);
  },
};

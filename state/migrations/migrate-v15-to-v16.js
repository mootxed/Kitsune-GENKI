/* state/migrations/migrate-v15-to-v16.js — Migration v15 -> v16 */

import { migrateDictionaryStateV16 } from '../../src/dictionary/state-v16.js';

export const migrationV15ToV16 = {
  from: 15,
  to: 16,
  migrate(oldState) {
    return migrateDictionaryStateV16(oldState);
  },
};

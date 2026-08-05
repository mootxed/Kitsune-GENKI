/* state/migrations/migrate-v13-to-v14.js — Migration v13 -> v14 */

import { migrateGenkiVocabularyState } from '../../src/courses/genki-1/migrations/vocabulary-state.js';

export const migrationV13ToV14 = {
  from: 13,
  to: 14,
  migrate(oldState) {
    return {
      ...migrateGenkiVocabularyState(oldState),
      version: 14,
    };
  },
};

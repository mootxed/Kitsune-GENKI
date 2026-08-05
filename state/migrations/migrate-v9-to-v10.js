/* state/migrations/migrate-v9-to-v10.js — Migration v9 -> v10 */

import { normalizeVocabularyLockState } from '../../src/vocabulary-unlock-plan.js';

export const migrationV9ToV10 = {
  from: 9,
  to: 10,
  migrate(oldState) {
    const baseState = { ...oldState };
    baseState.vocabularyUnlocks =
      baseState.vocabularyUnlocks && typeof baseState.vocabularyUnlocks === 'object'
        ? baseState.vocabularyUnlocks
        : {};
    baseState.version = 10;
    return normalizeVocabularyLockState(baseState);
  },
};

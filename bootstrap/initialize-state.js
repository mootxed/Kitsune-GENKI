/* bootstrap/initialize-state.js — Storage and state initialization */

import { initializeDB } from '../src/db.js';
import { loadOpenRouterKeyFromDB } from '../src/openrouter-key.js';
import { migrateFromLocalStorage } from '../src/migration.js';
import { initTabSync } from '../src/tab-sync.js';
import { toast } from '../ui/app-shell.js';

export async function initializeState(dependencies) {
  await initializeDB();
  await loadOpenRouterKeyFromDB();
  dependencies.SRS.setReviewLogger(null);

  await migrateFromLocalStorage();
  await dependencies.loadState();

  initTabSync(() => {
    toast('⚠️ Приложение уже открыто в другой вкладке. Автосохранение отключено.', {
      duration: 8000,
    });
  });
}

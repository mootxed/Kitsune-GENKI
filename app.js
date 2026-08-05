/* app.js — Pure Composition Root for KotoKitsu */

import './styles.css';

import { bootstrapApplication } from './bootstrap/bootstrap-application.js';
import { createProductionDependencies } from './bootstrap/production-dependencies.js';
import { handleFatalBootstrapError } from './bootstrap/handle-bootstrap-error.js';
import { calculateNextNotificationDate } from './ui/app-shell.js';

export { calculateNextNotificationDate };

function startApp() {
  try {
    const dependencies = createProductionDependencies();
    bootstrapApplication(dependencies).catch(handleFatalBootstrapError);
  } catch (error) {
    handleFatalBootstrapError(error);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
}

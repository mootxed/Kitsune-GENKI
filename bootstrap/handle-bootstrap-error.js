/* bootstrap/handle-bootstrap-error.js — Fatal initialization error handler */

/**
 * Handles fatal startup/bootstrap errors safely by presenting a dedicated recovery screen to the user.
 *
 * @param {Error} error Initialization error
 * @param {Object} [context] Optional diagnostic context
 */
export async function handleFatalBootstrapError(error, context = {}) {
  console.error('[Bootstrap] ❌ Fatal application initialization error:', error, context);

  if (typeof document === 'undefined') return;

  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.innerHTML =
      '<div id="storage-recovery-container" style="width: 100%; height: 100%;"></div>';
    const container = document.getElementById('storage-recovery-container');
    try {
      const { renderStorageRecoveryScreen } = await import('../ui/storage-recovery.js');
      renderStorageRecoveryScreen(container, {
        reason: context.reason || 'STORAGE_UNAVAILABLE',
        error,
        context,
        onRetry: () => location.reload(),
      });
    } catch (err) {
      console.error('[Bootstrap] Recovery UI render failed:', err);
    }
  }
}

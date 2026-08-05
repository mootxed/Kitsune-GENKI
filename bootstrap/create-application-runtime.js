/* bootstrap/create-application-runtime.js — Structured runtime container for application dependencies */

/**
 * Creates a structured runtime container to avoid anti-patterns like generic service locators or global monolithic objects.
 *
 * @param {Object} params
 * @param {Object} params.stateStore
 * @param {Object} [params.database]
 * @param {Object} [params.courseRegistry]
 * @param {Object} [params.diagnostics]
 * @param {Object} [params.clock]
 * @param {Object} [params.storage]
 * @param {Object} [params.serviceWorker]
 * @returns {Object} Application runtime container
 */
export function createApplicationRuntime({
  stateStore,
  database = null,
  courseRegistry = null,
  diagnostics = null,
  clock = Date,
  storage = null,
  serviceWorker = null,
} = {}) {
  return {
    core: {
      stateStore,
      courseRegistry,
    },
    features: {},
    platform: {
      database,
      storage,
      serviceWorker,
      clock,
    },
    diagnostics,
  };
}

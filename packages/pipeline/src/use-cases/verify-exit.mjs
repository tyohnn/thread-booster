import { evaluateExitCriteria } from '../domain/verify.mjs';

/**
 * @param {{ store: import('../ports/index.mjs').AnalysisStorePort }} deps
 */
export function createVerifyExit(deps) {
  return {
    async run() {
      const stats = await deps.store.stats();
      return { stats, exit: evaluateExitCriteria(stats) };
    },
  };
}

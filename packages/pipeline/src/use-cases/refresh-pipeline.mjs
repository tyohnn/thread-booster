import { computeEarlyRetention } from '../domain/retention.mjs';
import { evaluateExitCriteria } from '../domain/verify.mjs';

/**
 * @param {{
 *   crawler: import('../ports/index.mjs').CrawlerPort,
 *   normalized: import('../ports/index.mjs').NormalizedDataPort,
 *   store: import('../ports/index.mjs').AnalysisStorePort,
 * }} deps
 */
export function createRefreshPipeline(deps) {
  const { crawler, normalized, store } = deps;

  return {
    /**
     * @param {{ skipFetch?: boolean, handle?: string }} [opts]
     */
    async run(opts = {}) {
      const skipFetch = opts.skipFetch !== false; // default: skip live fetch
      await crawler.collectSequential({ skipFetch, handle: opts.handle });
      await crawler.normalize();

      const views = normalized.loadViewsFromRaw();
      const data = normalized.load();
      const retention = computeEarlyRetention(data.chains, views);
      normalized.writeRetention(retention);
      console.log(`retention ${retention.length} (초반 유지율, POL-003)`);

      await store.rebuild({
        accounts: data.accounts,
        chains: data.chains,
        posts: data.posts,
        metricsPath: data.metricsPath,
        retention,
      });

      const stats = await store.stats();
      const exit = evaluateExitCriteria(stats);
      return { stats, exit };
    },
  };
}

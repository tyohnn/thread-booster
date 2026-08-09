/**
 * REL-001 exit criteria (pure).
 */

/**
 * @param {{ accountCount: number, chainCount: number, multiObservationPosts: number }} stats
 * @param {{ minAccounts?: number, minChains?: number }} [opts]
 */
export function evaluateExitCriteria(stats, opts = {}) {
  const minAccounts = opts.minAccounts ?? 3;
  const minChains = opts.minChains ?? 1000;
  const checks = [
    {
      id: 'accounts',
      ok: stats.accountCount >= minAccounts,
      detail: `accounts ${stats.accountCount} (need ≥${minAccounts})`,
    },
    {
      id: 'chains',
      ok: stats.chainCount >= minChains,
      detail: `chains ${stats.chainCount} (need ≥${minChains})`,
    },
    {
      id: 'append_metrics',
      ok: stats.multiObservationPosts >= 1,
      detail: `posts with >1 observation: ${stats.multiObservationPosts}`,
    },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}

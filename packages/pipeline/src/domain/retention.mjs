/**
 * Early retention = second_views / hook_views (POL-003).
 * Single-post chains are excluded.
 */

/**
 * @param {Array<{ chain_id: string, chain_len: number, hook_views?: number|null, member_codes: string[], hook_like?: number|null, hook_text?: string }>} chains
 * @param {Map<string, number>} viewsByCode code -> views
 */
export function computeEarlyRetention(chains, viewsByCode) {
  const rows = [];
  for (const c of chains) {
    if ((c.chain_len ?? 0) < 2 || c.hook_views == null) continue;
    const secondCode = c.member_codes?.[1];
    if (!secondCode) continue;
    const second = viewsByCode.get(secondCode);
    if (second == null) continue;
    rows.push({
      chain_id: c.chain_id,
      hook_views: c.hook_views,
      second_views: second,
      retention: Number((second / c.hook_views).toFixed(4)),
      hook_like: c.hook_like ?? null,
      chain_len: c.chain_len,
      hook: (c.hook_text ?? '').slice(0, 80),
    });
  }
  return rows;
}

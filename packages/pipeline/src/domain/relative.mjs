/**
 * POL-003 relative performance: value ÷ median of same-account neighbors
 * in ±2 weeks (4 weeks total). Self excluded.
 */

/**
 * @param {number[]} xs
 * @returns {number|null}
 */
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * @param {{ id: string, account: string, at: number, value: number|null|undefined }} target
 * @param {Array<{ id: string, account: string, at: number, value: number|null|undefined }>} universe
 * @param {{ windowMs?: number, minNeighbors?: number }} [opts]
 * @returns {{ rel: number|null, baseline: number|null, n: number }}
 */
export function relativeToWindow(target, universe, opts = {}) {
  const windowMs = opts.windowMs ?? 14 * 24 * 60 * 60 * 1000; // ±2 weeks
  const minNeighbors = opts.minNeighbors ?? 5;
  if (target.value == null) return { rel: null, baseline: null, n: 0 };

  const neighbors = universe.filter(
    (p) =>
      p.id !== target.id &&
      p.account === target.account &&
      p.value != null &&
      Math.abs(p.at - target.at) <= windowMs,
  );
  const n = neighbors.length;
  if (n < minNeighbors) return { rel: null, baseline: null, n };

  const baseline = median(neighbors.map((p) => p.value));
  if (baseline == null || baseline === 0) return { rel: null, baseline, n };
  return {
    rel: Number((target.value / baseline).toFixed(3)),
    baseline,
    n,
  };
}

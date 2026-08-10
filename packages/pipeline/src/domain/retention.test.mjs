import { describe, expect, it } from 'vitest';
import { computeEarlyRetention } from './retention.mjs';

describe('computeEarlyRetention', () => {
  it('skips single-post chains', () => {
    const rows = computeEarlyRetention(
      [{ chain_id: 'a', chain_len: 1, hook_views: 100, member_codes: ['a'] }],
      new Map([['a', 100]]),
    );
    expect(rows).toEqual([]);
  });

  it('skips when hook_views missing', () => {
    const rows = computeEarlyRetention(
      [{ chain_id: 'a', chain_len: 2, hook_views: null, member_codes: ['a', 'b'] }],
      new Map([['b', 50]]),
    );
    expect(rows).toEqual([]);
  });

  it('computes second/hook ratio', () => {
    const rows = computeEarlyRetention(
      [
        {
          chain_id: 'hook1',
          chain_len: 3,
          hook_views: 200,
          hook_like: 10,
          hook_text: 'hello',
          member_codes: ['hook1', 'sec1', 'thr1'],
        },
      ],
      new Map([
        ['hook1', 200],
        ['sec1', 50],
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].retention).toBe(0.25);
    expect(rows[0].second_views).toBe(50);
  });
});

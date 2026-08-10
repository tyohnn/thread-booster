import { describe, expect, it } from 'vitest';
import { median, relativeToWindow } from './relative.mjs';

const day = 24 * 60 * 60 * 1000;

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('relativeToWindow (POL-003 ±2 weeks median)', () => {
  const t0 = Date.parse('2026-06-01T00:00:00Z');

  it('excludes self and uses ±14 day median', () => {
    const posts = [
      { id: 'self', account: 'a', at: t0, value: 200 },
      { id: 'n1', account: 'a', at: t0 - 7 * day, value: 100 },
      { id: 'n2', account: 'a', at: t0 + 3 * day, value: 100 },
      { id: 'n3', account: 'a', at: t0 - 10 * day, value: 100 },
      { id: 'n4', account: 'a', at: t0 + 10 * day, value: 100 },
      { id: 'n5', account: 'a', at: t0 + 1 * day, value: 100 },
      { id: 'far', account: 'a', at: t0 + 30 * day, value: 999 },
      { id: 'other', account: 'b', at: t0, value: 50 },
    ];
    const { rel, baseline, n } = relativeToWindow(posts[0], posts);
    expect(n).toBe(5);
    expect(baseline).toBe(100);
    expect(rel).toBe(2);
  });

  it('returns null when neighbors < 5', () => {
    const posts = [
      { id: 'self', account: 'a', at: t0, value: 200 },
      { id: 'n1', account: 'a', at: t0 - day, value: 100 },
    ];
    expect(relativeToWindow(posts[0], posts).rel).toBeNull();
  });
});

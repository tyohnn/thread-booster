import { describe, expect, it } from 'vitest';
import { evaluateExitCriteria } from './verify.mjs';

describe('evaluateExitCriteria', () => {
  it('passes REL-001 thresholds', () => {
    const { ok, checks } = evaluateExitCriteria({
      accountCount: 3,
      chainCount: 1000,
      multiObservationPosts: 1,
    });
    expect(ok).toBe(true);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it('fails when chains below 1000', () => {
    const { ok, checks } = evaluateExitCriteria({
      accountCount: 8,
      chainCount: 999,
      multiObservationPosts: 10,
    });
    expect(ok).toBe(false);
    expect(checks.find((c) => c.id === 'chains')?.ok).toBe(false);
  });

  it('fails when no append observations', () => {
    const { ok, checks } = evaluateExitCriteria({
      accountCount: 8,
      chainCount: 2000,
      multiObservationPosts: 0,
    });
    expect(ok).toBe(false);
    expect(checks.find((c) => c.id === 'append_metrics')?.ok).toBe(false);
  });
});

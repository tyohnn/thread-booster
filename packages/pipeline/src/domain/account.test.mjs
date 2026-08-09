import { describe, expect, it } from 'vitest';
import { createAccount, isActive, normalizeHandle } from './account.mjs';

describe('normalizeHandle', () => {
  it('strips @, trims, lowercases', () => {
    expect(normalizeHandle(' @Beyond.Cho ')).toBe('beyond.cho');
  });
});

describe('createAccount', () => {
  it('rejects empty handle', () => {
    expect(() => createAccount('')).toThrow(/비어/);
  });

  it('defaults status to active', () => {
    const a = createAccount('Demo_User', { label: '데모' });
    expect(a.handle).toBe('demo_user');
    expect(a.status).toBe('active');
    expect(a.label).toBe('데모');
    expect(a.last_fetched_at).toBeNull();
  });
});

describe('isActive', () => {
  it('treats missing status as active', () => {
    expect(isActive({ handle: 'x' })).toBe(true);
  });

  it('inactive is not active', () => {
    expect(isActive({ handle: 'x', status: 'inactive' })).toBe(false);
  });
});

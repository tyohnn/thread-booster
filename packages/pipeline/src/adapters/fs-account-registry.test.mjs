import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFsAccountRegistry } from './fs-account-registry.mjs';

describe('fs account registry', () => {
  /** @type {string[]} */
  const dirs = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function registry() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-accounts-'));
    dirs.push(dir);
    return createFsAccountRegistry(path.join(dir, 'accounts.json'));
  }

  it('adds and rejects duplicates', () => {
    const r = registry();
    r.add('Foo');
    expect(() => r.add('foo')).toThrow(/중복/);
    expect(r.list()).toHaveLength(1);
  });

  it('deactivates without deleting', () => {
    const r = registry();
    r.add('bar');
    r.deactivate('bar');
    expect(r.list()[0].status).toBe('inactive');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { createAccount, normalizeHandle } from '../domain/account.mjs';

/**
 * @param {string} filePath
 * @returns {import('../ports/index.mjs').AccountRegistryPort}
 */
export function createFsAccountRegistry(filePath) {
  const read = () => {
    if (!fs.existsSync(filePath)) {
      return { _comment: '트래킹 대상 계정 레지스트리', accounts: [] };
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  };

  const write = (doc) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n');
  };

  return {
    list() {
      return (read().accounts ?? []).filter((a) => a.status !== 'removed');
    },

    add(handle, fields = {}) {
      const doc = read();
      const h = normalizeHandle(handle);
      if ((doc.accounts ?? []).some((a) => normalizeHandle(a.handle) === h && a.status !== 'removed')) {
        throw new Error(`중복 핸들: ${h}`);
      }
      const account = createAccount(h, fields);
      doc.accounts = doc.accounts ?? [];
      doc.accounts.push(account);
      write(doc);
      return account;
    },

    deactivate(handle) {
      const doc = read();
      const h = normalizeHandle(handle);
      const account = (doc.accounts ?? []).find((a) => normalizeHandle(a.handle) === h);
      if (!account) throw new Error(`없는 핸들: ${h}`);
      account.status = 'inactive';
      write(doc);
      return account;
    },

    touchFetched(handle, iso) {
      const doc = read();
      const h = normalizeHandle(handle);
      const account = (doc.accounts ?? []).find((a) => normalizeHandle(a.handle) === h);
      if (!account) return;
      account.last_fetched_at = iso;
      write(doc);
    },
  };
}

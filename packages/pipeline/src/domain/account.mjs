/**
 * Account registry domain helpers (no I/O).
 */

/** @typedef {{ handle: string, label?: string|null, topic?: string|null, followers?: number|null, status: string, added_at?: string, last_fetched_at?: string|null, notes?: string|null }} Account */

/**
 * @param {string} handle
 * @returns {string}
 */
export function normalizeHandle(handle) {
  return String(handle ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

/**
 * @param {Account} account
 * @returns {boolean}
 */
export function isActive(account) {
  return (account.status ?? 'active') === 'active';
}

/**
 * @param {string} handle
 * @param {Partial<Account>} [fields]
 * @returns {Account}
 */
export function createAccount(handle, fields = {}) {
  const h = normalizeHandle(handle);
  if (!h) throw new Error('handle이 비어 있습니다');
  return {
    handle: h,
    label: fields.label ?? null,
    topic: fields.topic ?? null,
    followers: fields.followers ?? null,
    status: fields.status ?? 'active',
    added_at: fields.added_at ?? new Date().toISOString().slice(0, 10),
    last_fetched_at: fields.last_fetched_at ?? null,
    notes: fields.notes ?? null,
  };
}

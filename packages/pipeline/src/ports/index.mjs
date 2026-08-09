/**
 * Ports — dependency contracts for use cases.
 * Adapters implement these; core never imports adapters.
 */

/**
 * @typedef {import('../domain/account.mjs').Account} Account
 */

/**
 * @typedef {object} AccountRegistryPort
 * @property {() => Account[]} list
 * @property {(handle: string, fields?: Partial<Account>) => Account} add
 * @property {(handle: string) => Account} deactivate
 * @property {(handle: string, iso: string) => void} touchFetched
 */

/**
 * @typedef {object} CrawlerPort
 * @property {(opts: { skipFetch?: boolean, handle?: string }) => Promise<{ fetched: string[] }>} collectSequential
 * @property {() => Promise<void>} normalize
 */

/**
 * @typedef {object} NormalizedDataPort
 * @property {() => { chains: any[], posts: any[], metricsPath: string, retention: any[], accounts: Account[] }} load
 * @property {(rows: any[]) => void} writeRetention
 * @property {() => Map<string, number>} loadViewsFromRaw
 */

/**
 * @typedef {object} AnalysisStorePort
 * @property {(payload: { accounts: Account[], chains: any[], posts: any[], metricsPath: string, retention: any[] }) => Promise<void>} rebuild
 * @property {() => Promise<{ accountCount: number, chainCount: number, multiObservationPosts: number }>} stats
 */

export {};

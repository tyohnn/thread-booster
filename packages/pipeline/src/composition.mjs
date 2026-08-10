import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsAccountRegistry } from './adapters/fs-account-registry.mjs';
import { createFsNormalizedData } from './adapters/fs-normalized.mjs';
import { createCrawlerProcessAdapter } from './adapters/crawler-process.mjs';
import { createDuckdbAnalysisStore } from './adapters/duckdb-analysis-store.mjs';
import { createRefreshPipeline } from './use-cases/refresh-pipeline.mjs';
import { createManageAccounts } from './use-cases/manage-accounts.mjs';
import { createVerifyExit } from './use-cases/verify-exit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve repo root from packages/pipeline/src → ../../../ */
export function repoRoot() {
  return path.resolve(__dirname, '../../../');
}

export function createApp(root = repoRoot()) {
  const accountsPath = path.join(root, 'shared/crawler/accounts.json');
  const rawDir = path.join(root, 'data_export/raw');
  const normDir = path.join(root, 'data_export/normalized');
  const storePath = path.join(root, 'data_export/store/thread_booster.duckdb');
  const crawlerDir = path.join(root, 'shared/crawler');

  const registry = createFsAccountRegistry(accountsPath);
  const normalized = createFsNormalizedData({ rawDir, normDir, accountsPath });
  const crawler = createCrawlerProcessAdapter({
    repoRoot: root,
    crawlerDir,
    rawDir,
    normDir,
    accountRegistry: registry,
  });
  const store = createDuckdbAnalysisStore(storePath);

  return {
    paths: { root, accountsPath, rawDir, normDir, storePath, crawlerDir },
    accounts: createManageAccounts({ registry }),
    refresh: createRefreshPipeline({ crawler, normalized, store }),
    verify: createVerifyExit({ store }),
  };
}

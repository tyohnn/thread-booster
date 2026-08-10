import fs from 'node:fs';
import path from 'node:path';
import { createFsAccountRegistry } from './fs-account-registry.mjs';

/**
 * @param {{ rawDir: string, normDir: string, accountsPath: string }} paths
 * @returns {import('../ports/index.mjs').NormalizedDataPort}
 */
export function createFsNormalizedData(paths) {
  const { rawDir, normDir, accountsPath } = paths;
  const registry = createFsAccountRegistry(accountsPath);

  return {
    load() {
      const chains = JSON.parse(fs.readFileSync(path.join(normDir, 'chains.json'), 'utf8'));
      const posts = JSON.parse(fs.readFileSync(path.join(normDir, 'posts.json'), 'utf8'));
      const retentionPath = path.join(normDir, 'retention.json');
      const retention = fs.existsSync(retentionPath)
        ? JSON.parse(fs.readFileSync(retentionPath, 'utf8'))
        : [];
      return {
        chains,
        posts,
        metricsPath: path.join(normDir, 'metrics.jsonl'),
        retention,
        accounts: registry.list(),
      };
    },

    writeRetention(rows) {
      fs.mkdirSync(normDir, { recursive: true });
      fs.writeFileSync(path.join(normDir, 'retention.json'), JSON.stringify(rows, null, 2) + '\n');
    },

    loadViewsFromRaw() {
      const views = new Map();
      if (!fs.existsSync(rawDir)) return views;
      for (const fn of fs.readdirSync(rawDir)) {
        if (!fn.endsWith('.jsonl')) continue;
        if (fn.startsWith('feed_')) continue;
        const full = path.join(rawDir, fn);
        for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          try {
            const r = JSON.parse(line);
            if (r.blocked) continue;
            if (r.code && r.views != null) views.set(r.code, r.views);
          } catch {
            /* skip */
          }
        }
      }
      return views;
    },
  };
}

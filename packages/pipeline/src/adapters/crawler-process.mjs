import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isActive } from '../domain/account.mjs';

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd: string }} opts
 */
function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    console.log(`$ ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

/**
 * Wraps shared/crawler scripts (existing SSR adapters).
 *
 * @param {{
 *   repoRoot: string,
 *   crawlerDir: string,
 *   rawDir: string,
 *   normDir: string,
 *   accountRegistry: import('../ports/index.mjs').AccountRegistryPort,
 * }} ctx
 * @returns {import('../ports/index.mjs').CrawlerPort}
 */
export function createCrawlerProcessAdapter(ctx) {
  const { crawlerDir, rawDir, normDir, accountRegistry } = ctx;

  return {
    async collectSequential({ skipFetch = true, handle } = {}) {
      const fetched = [];
      if (skipFetch) {
        console.log('수집 건너뜀 (--skip-fetch). 기존 raw로 정규화·적재만 합니다.');
        return { fetched };
      }

      const accounts = accountRegistry
        .list()
        .filter(isActive)
        .filter((a) => !handle || a.handle === handle);

      // One account at a time (POL-001). Prefer pending backfill seeds if present.
      for (const account of accounts) {
        const seedName = `seeds_backfill_${account.handle.replace(/[^a-z0-9_]/gi, '_')}.txt`;
        const seedPath = path.join(crawlerDir, seedName);
        if (!fs.existsSync(seedPath) || !fs.readFileSync(seedPath, 'utf8').trim()) {
          console.log(`[${account.handle}] 시드 없음 — fetch 생략`);
          continue;
        }
        const stamp = new Date().toISOString().slice(0, 10);
        const out = path.join(
          rawDir,
          `hooks_${account.handle.replace(/[^a-z0-9_]/gi, '_')}_${stamp}.jsonl`,
        );
        console.log(`\n=== 수집 ${account.handle} (한 계정만) ===`);
        await run(
          'node',
          ['fetch.mjs', '--codes', seedName, '--out', out, '--min', '3', '--max', '8'],
          { cwd: crawlerDir },
        );
        accountRegistry.touchFetched(account.handle, new Date().toISOString());
        fetched.push(account.handle);
      }
      return { fetched };
    },

    async normalize() {
      fs.mkdirSync(normDir, { recursive: true });
      const files = fs
        .readdirSync(rawDir)
        .filter((f) => f.endsWith('.jsonl') && !f.startsWith('feed_'))
        .map((f) => path.join(rawDir, f));
      if (!files.length) throw new Error(`raw JSONL 없음: ${rawDir}`);

      // Relative paths from crawler cwd for normalize.mjs defaults style
      const relFiles = files.map((f) => path.relative(crawlerDir, f));
      const outRel = path.relative(crawlerDir, normDir);
      await run('node', ['normalize.mjs', '--raw', ...relFiles, '--out', outRel], {
        cwd: crawlerDir,
      });
    },
  };
}

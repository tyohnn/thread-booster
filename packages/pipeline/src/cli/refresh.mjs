#!/usr/bin/env node
/**
 * pnpm data:refresh
 *
 * Default: skip live Threads fetch (POL-001 soft-block risk); normalize existing
 * raw → retention → DuckDB. Pass --fetch to collect pending seed accounts one-by-one.
 */
import { createApp } from '../composition.mjs';

const args = process.argv.slice(2);
const skipFetch = !args.includes('--fetch');
const handleIdx = args.indexOf('--handle');
const handle = handleIdx >= 0 ? args[handleIdx + 1] : undefined;

const app = createApp();
console.log(`store → ${app.paths.storePath}`);
console.log(skipFetch ? 'mode: normalize + store (no fetch)' : 'mode: fetch → normalize + store');

try {
  const { stats, exit } = await app.refresh.run({ skipFetch, handle });
  console.log('\n=== exit criteria ===');
  for (const c of exit.checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.detail}`);
  }
  if (!exit.ok) {
    console.error('\nREL-001 exit criteria 미충족');
    process.exitCode = 1;
  } else {
    console.log('\nREL-001 exit criteria 충족');
    console.log(stats);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}

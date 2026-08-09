#!/usr/bin/env node
import { createApp } from '../composition.mjs';

const app = createApp();
const { stats, exit } = await app.verify.run();
console.log(stats);
for (const c of exit.checks) {
  console.log(`${c.ok ? '✓' : '✗'} ${c.detail}`);
}
process.exitCode = exit.ok ? 0 : 1;

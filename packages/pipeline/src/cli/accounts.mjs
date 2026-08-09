#!/usr/bin/env node
import { createApp } from '../composition.mjs';

const app = createApp();
const [cmd, ...rest] = process.argv.slice(2);

const usage = () => {
  console.log(`사용:
  node accounts.mjs list
  node accounts.mjs add <handle> [--label ...]
  node accounts.mjs deactivate <handle>`);
};

if (!cmd || cmd === 'help' || cmd === '--help') {
  usage();
  process.exit(0);
}

try {
  if (cmd === 'list') {
    for (const a of app.accounts.list()) {
      const fetched = a.last_fetched_at ? a.last_fetched_at.slice(0, 19) : '—';
      console.log(
        `${a.handle.padEnd(20)} ${(a.status ?? 'active').padEnd(10)} last_fetched=${fetched}  ${a.label ?? ''}`,
      );
    }
  } else if (cmd === 'add') {
    const handle = rest[0];
    if (!handle) throw new Error('handle 필요');
    const labelIdx = rest.indexOf('--label');
    const label = labelIdx >= 0 ? rest[labelIdx + 1] : null;
    const account = app.accounts.add(handle, { label });
    console.log('등록:', account);
  } else if (cmd === 'deactivate') {
    const handle = rest[0];
    if (!handle) throw new Error('handle 필요');
    console.log('비활성:', app.accounts.deactivate(handle));
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (err) {
  console.error(String(err.message || err));
  process.exitCode = 1;
}

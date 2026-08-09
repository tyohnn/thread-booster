/**
 * 퍼머링크 수집기 — 코드 목록을 받아 SSR 페이로드를 append-only JSONL 로 떨군다.
 *
 * 설계 원칙 (2026-08-01 소프트 차단 사고에서 나온 것):
 *  - 요청 사이 지터. 기본 5~9초, 사람 속도.
 *  - 차단·에러 응답을 감지해 지수 백오프. 연속 실패가 한계를 넘으면 **중단한다.**
 *    이전 러너는 이 감지가 없어서 39건 연속 에러에 대고 계속 스크롤했다.
 *  - append-only. 중간에 끊겨도 수집분은 남고, 재실행하면 이미 받은 코드는 건너뛴다.
 *  - 한 번에 한 계정. 두 계정 병렬이 8/1 차단의 결정타였다.
 *  - 로그인하지 않는다. SSR 페이로드는 로그아웃으로도 다 온다 —
 *    사용자 계정에 rate 이력을 남기지 않는 게 이 방식의 가장 큰 이점이다.
 *
 * 사용:
 *   node fetch.mjs --codes hooks.txt --out ../../data_export/raw/hooks_2026-08-08.jsonl
 *   node fetch.mjs --codes hooks.txt --out out.jsonl --limit 200 --min 5 --max 9
 *
 * --codes 파일 형식: 한 줄에 `handle,code` 또는 `code` (code 만이면 --handle 필요)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { parsePosts, parseViewCounts, isBlocked } from './ssr.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const CODES_FILE = arg('codes');
const OUT = arg('out');
const HANDLE = arg('handle', null);
const LIMIT = Number(arg('limit', Infinity));
const MIN = Number(arg('min', 5)) * 1000;
const MAX = Number(arg('max', 9)) * 1000;
const MAX_FAILS = Number(arg('max-fails', 3));

if (!CODES_FILE || !OUT) {
  console.error('사용: node fetch.mjs --codes <file> --out <file.jsonl> [--handle h] [--limit n] [--min s] [--max s]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN + Math.random() * (MAX - MIN);
const stamp = () => new Date().toISOString().slice(11, 19);

// --- 대상 목록 ---
const targets = fs
  .readFileSync(CODES_FILE, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [a, b] = l.split(',').map((s) => s.trim());
    return b ? { handle: a, code: b } : { handle: HANDLE, code: a };
  })
  .filter((t) => t.handle && t.code);

// --- 재개: 이미 받은 코드는 건너뛴다 ---
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const done = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (!r.blocked) done.add(r.code);
    } catch {
      /* 쓰다 만 줄 */
    }
  }
}

const queue = targets.filter((t) => !done.has(t.code)).slice(0, LIMIT);
console.log(`대상 ${targets.length} | 기수집 ${done.size} | 이번 실행 ${queue.length}`);
if (!queue.length) {
  console.log('할 일 없음.');
  process.exit(0);
}
const eta = Math.round((queue.length * ((MIN + MAX) / 2 + 3000)) / 60000);
console.log(`예상 소요 ~${eta}분\n`);

// --- 브라우저 ---
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  viewport: { width: 1280, height: 900 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
});
// 이미지·폰트·미디어는 안 받는다. 우리가 원하는 건 HTML 안의 JSON 뿐이다.
await ctx.route('**/*', (route) =>
  ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue()
);
const page = await ctx.newPage();
const sink = fs.createWriteStream(OUT, { flags: 'a' });

let ok = 0;
let fails = 0;
let consecutive = 0;

const shutdown = async (why) => {
  console.log(`\n[${stamp()}] 종료: ${why} | 성공 ${ok} 실패 ${fails}`);
  sink.end();
  await browser.close();
  process.exit(consecutive >= MAX_FAILS ? 2 : 0);
};
process.on('SIGINT', () => shutdown('사용자 중단(SIGINT)'));

for (const [i, t] of queue.entries()) {
  const url = `https://www.threads.com/@${t.handle}/post/${t.code}`;
  let status = null;
  let html = '';
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = resp?.status() ?? null;
    html = await page.content();
  } catch (e) {
    status = -1;
    html = String(e.message || e);
  }

  const blocked = isBlocked(status, html);
  const posts = blocked ? [] : parsePosts(html);
  const views = blocked ? null : parseViewCounts(html);
  const self = posts.filter((p) => p.author === t.handle);

  sink.write(
    JSON.stringify({
      code: t.code,
      handle: t.handle,
      fetched_at: new Date().toISOString(),
      status,
      blocked,
      views,
      posts: blocked ? [] : posts,
    }) + '\n'
  );

  if (blocked) {
    fails++;
    consecutive++;
    console.log(`[${stamp()}] ${i + 1}/${queue.length} ${t.code} ✗ status=${status} (연속실패 ${consecutive})`);
    if (consecutive >= MAX_FAILS) {
      // 지수 백오프 후 한 번만 더 본다. 그래도 막혀 있으면 그만둔다 —
      // 차단 상태에서 계속 두드리는 게 8/1 에 상황을 악화시켰다.
      const back = 60000 * 2 ** (consecutive - MAX_FAILS);
      if (back > 240000) await shutdown('연속 차단 — 백오프 한계 도달. 시간을 두고 재실행할 것');
      console.log(`   백오프 ${back / 1000}초...`);
      await sleep(back);
    }
  } else {
    ok++;
    consecutive = 0;
    console.log(
      `[${stamp()}] ${i + 1}/${queue.length} ${t.code} ✓ 본인글 ${self.length} · 조회 ${views ?? '—'} · 훅좋아요 ${
        self[0]?.like ?? '—'
      }`
    );
  }

  if (i < queue.length - 1) await sleep(jitter());
}

await shutdown('완료');

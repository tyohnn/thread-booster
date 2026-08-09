/**
 * 프로필 피드 수확기 — 로그인 세션으로 스크롤하며 **네트워크 응답을 가로채** 글을 모은다.
 *
 * 왜 DOM 이 아니라 응답 가로채기인가:
 *   프로필 피드는 forward-only 가상화라 지나간 카드가 DOM 에서 영구 언마운트된다
 *   (NOTION_SYNC.md §5-(2)). 과거 시도가 '한 번에 3개씩' 밖에 못 건진 이유가 이것이다.
 *   하지만 스크롤이 유발하는 페이지네이션 응답에는 배치당 수십 건이 통째로 들어있고,
 *   그건 화면에 무엇이 남아있든 상관없이 잡힌다. 언마운트는 더 이상 문제가 아니다.
 *
 * ⚠️ 이 경로는 로그인 상태로 동작하므로 **계정에 rate 이력이 남는다.**
 *    2026-08-01 소프트 차단이 정확히 이 경로에서 발생했다. 그래서 기본값을 보수적으로 잡았다:
 *      - 배치 사이 8~15초 (퍼머링크 수집의 5~9초보다 느리게)
 *      - 에러 응답이 **1회만 나와도 즉시 중단** (--max-fails 로 조정)
 *      - 새 글이 안 붙는 상태가 3회 이어지면 피드 끝으로 보고 종료
 *      - 한 번에 한 계정
 *
 * 사용:
 *   node harvest.mjs --handle ho_ho_ju_ju --profile ./.profile \
 *                    --out ../../data_export/raw/feed_hohojuju_2026-08-08.jsonl \
 *                    --until 2026-06-01 --max-batches 40
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { parsePosts } from './ssr.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const HANDLE = arg('handle');
const OUT = arg('out');
const PROFILE = arg('profile', './.profile');
const UNTIL = arg('until'); // 이 날짜보다 오래된 글이 나오면 멈춘다 (YYYY-MM-DD)
const MAX_BATCHES = Number(arg('max-batches', 40));
const MAX_FAILS = Number(arg('max-fails', 1));
const MIN = Number(arg('min', 8)) * 1000;
const MAX = Number(arg('max', 15)) * 1000;

if (!HANDLE || !OUT) {
  console.error('사용: node harvest.mjs --handle <handle> --out <file.jsonl> [--profile dir] [--until YYYY-MM-DD]');
  process.exit(1);
}
if (!fs.existsSync(PROFILE)) {
  console.error(`로그인 프로필이 없습니다: ${PROFILE}\n먼저 'node login.mjs' 를 실행하세요.`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN + Math.random() * (MAX - MIN);
const stamp = () => new Date().toISOString().slice(11, 19);
const untilTs = UNTIL ? Date.parse(UNTIL + 'T00:00:00Z') / 1000 : null;

fs.mkdirSync(path.dirname(OUT), { recursive: true });

// 재개: 이미 받은 코드는 다시 기록하지 않는다
const known = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      known.add(JSON.parse(line).code);
    } catch {
      /* 쓰다 만 줄 */
    }
  }
}
console.log(`기수집 ${known.size}건 | 프로필 ${PROFILE}\n`);

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  viewport: { width: 1280, height: 900 },
});
await ctx.route('**/*', (r) =>
  ['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue()
);
const page = ctx.pages()[0] ?? (await ctx.newPage());
const sink = fs.createWriteStream(OUT, { flags: 'a' });

let harvested = 0;
let fails = 0;
let oldest = null;
let reachedUntil = false;

// --- 네트워크 응답 가로채기 ---
// 페이지네이션 응답은 순수 JSON 이라 script 래퍼가 없다. 같은 파서를 쓰기 위해 감싼다.
const record = (posts, source) => {
  for (const p of posts) {
    if (p.author !== HANDLE) continue; // 남의 글·추천 콘텐츠 제외
    if (known.has(p.code)) continue;
    known.add(p.code);
    harvested++;
    if (p.taken_at && (oldest === null || p.taken_at < oldest)) {
      oldest = p.taken_at;
      if (untilTs && oldest < untilTs) reachedUntil = true;
    }
    sink.write(JSON.stringify({ code: p.code, handle: HANDLE, fetched_at: new Date().toISOString(), source, post: p }) + '\n');
  }
};

page.on('response', async (res) => {
  const rt = res.request().resourceType();
  if (rt !== 'xhr' && rt !== 'fetch') return;
  let text;
  try {
    text = await res.text();
  } catch {
    return;
  }
  if (!text.includes('"code"')) return;
  if (res.status() !== 200) {
    fails++;
    return;
  }
  try {
    record(parsePosts(`<script type="application/json">${text}</script>`), 'xhr');
  } catch {
    /* 파싱 실패는 무시 — 다음 배치에서 회복 */
  }
});

const shutdown = async (why) => {
  console.log(`\n[${stamp()}] 종료: ${why}`);
  console.log(`  수집 ${harvested}건 | 가장 오래된 글 ${oldest ? new Date(oldest * 1000).toISOString().slice(0, 10) : '—'}`);
  sink.end();
  await ctx.close();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('사용자 중단(SIGINT)'));

// --- 시작 ---
const resp = await page.goto(`https://www.threads.com/@${HANDLE}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(4000);
const html = await page.content();

const state = await page.evaluate(() => ({
  modal: !!document.querySelector('[role="dialog"]'),
  height: document.documentElement.scrollHeight,
}));
if (resp?.status() !== 200 || (state.modal && state.height <= 1200)) {
  console.error(`로그인 세션이 유효하지 않은 것 같습니다 (status=${resp?.status()}, 모달=${state.modal}, 높이=${state.height}).`);
  console.error("'node login.mjs' 로 다시 로그인하세요.");
  await ctx.close();
  process.exit(1);
}

record(parsePosts(html), 'ssr'); // 초기 SSR 페이로드
console.log(`[${stamp()}] 초기 SSR — ${harvested}건`);

let stalls = 0;
for (let b = 1; b <= MAX_BATCHES; b++) {
  const before = harvested;
  const h0 = await page.evaluate(() => document.documentElement.scrollHeight);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(jitter());

  const h1 = await page.evaluate(() => document.documentElement.scrollHeight);
  const got = harvested - before;
  console.log(
    `[${stamp()}] 배치 ${b}/${MAX_BATCHES} — 신규 ${got} (누적 ${harvested}) · 높이 ${h0}→${h1} · 최고령 ${
      oldest ? new Date(oldest * 1000).toISOString().slice(0, 10) : '—'
    }`
  );

  if (fails >= MAX_FAILS) await shutdown(`에러 응답 ${fails}회 — 즉시 중단. 시간을 두고 재실행할 것`);
  if (reachedUntil) await shutdown(`목표 시점(${UNTIL}) 도달`);

  if (got === 0 && h1 === h0) {
    if (++stalls >= 3) await shutdown('새 글이 붙지 않음 — 피드 끝으로 판단');
  } else {
    stalls = 0;
  }
}

await shutdown(`최대 배치(${MAX_BATCHES}) 도달`);

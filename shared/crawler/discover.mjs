/**
 * 신규 글 발견기 — 프로필 페이지에서 아직 모르는 훅 코드를 찾아 시드 파일로 떨군다.
 *
 * 수집기(fetch.mjs)는 '코드를 아는 글' 만 받는다. 새로 올라온 글의 코드는
 * 어딘가에서 알아내야 하는데, 그게 여기다.
 *
 * 로그아웃 상태 프로필의 초기 SSR 페이로드에 **최근 약 2일치**가 실려 온다
 * (2026-08-08 실측: beyond.cho 본인 글 16개 / 훅 4개 / 2.4일 범위).
 * 로그인하면 스크롤 페이지네이션으로 과거까지 갈 수 있지만, 그건 계정에 rate 이력을
 * 남기고 2026-08-01 소프트 차단의 원인이기도 하다. 정기적으로 돌리면 로그아웃으로 충분하다.
 *
 * ⚠️ 커버리지가 ~2일이므로 **최소 하루 한 번**은 돌려야 구멍이 안 생긴다.
 *    오래 안 돌렸다면 그사이 글은 이 방법으로 못 찾는다 (§ README 참조).
 *
 * 사용:
 *   node discover.mjs --handles beyond.cho,ho_ho_ju_ju --known ../../data_export/normalized/posts.json \
 *                     --out seeds_new.txt
 *   node fetch.mjs --codes seeds_new.txt --out ../../data_export/raw/new_2026-08-08.jsonl
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { parsePosts } from './ssr.mjs';
import { loadAccounts, loadFetchedCodes } from './state.mjs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};

// 대상 계정: --handles 로 지정하거나, 생략하면 레지스트리의 active 계정 전부
const handles = (arg('handles') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (!handles.length) handles.push(...loadAccounts().filter((a) => a.status === 'active').map((a) => a.handle));
const OUT = arg('out', 'seeds_new.txt');

if (!handles.length) {
  console.error('사용: node discover.mjs [--handles a,b] [--out seeds_new.txt]');
  process.exit(1);
}

// ⚠️ '아는 글' 의 기준은 posts.json 이 아니라 **퍼머링크를 실제로 연 적 있는가** 다.
// posts.json 에는 관련 글로 딸려온 껍데기가 섞여 있어서, 그걸 기준으로 삼으면
// 정작 수집이 필요한 글이 영영 시드에서 빠진다 (state.mjs 주석 참조).
const known = loadFetchedCodes();
console.log(`퍼머링크 수집 완료 ${known.size}건 기준\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  viewport: { width: 1280, height: 900 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
});
await ctx.route('**/*', (r) =>
  ['image', 'media', 'font'].includes(r.request().resourceType()) ? r.abort() : r.continue()
);
const page = await ctx.newPage();

const seeds = [];
for (const [i, handle] of handles.entries()) {
  const resp = await page.goto(`https://www.threads.com/@${handle}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await sleep(2500);
  const html = await page.content();

  if (resp?.status() !== 200 || /페이지를 찾을 수 없습니다/.test(html)) {
    console.log(`${handle}: ✗ status=${resp?.status()} — 건너뜀`);
    continue;
  }

  const mine = parsePosts(html)
    .filter((p) => p.author === handle)
    .sort((a, b) => (a.taken_at ?? 0) - (b.taken_at ?? 0));
  const fresh = mine.filter((p) => !known.has(p.code));

  // 훅만 시드로 쓴다. 답글은 훅 퍼머링크를 열면 체인째로 딸려 오므로 따로 받을 필요가 없다.
  // 단, 신규 답글의 훅이 이미 알려진 글이면 그 훅도 다시 받아야 체인이 갱신된다.
  const hooks = new Set(fresh.filter((p) => !p.is_reply).map((p) => p.code));
  const staleHooks = new Set();
  for (const p of fresh) {
    if (!p.is_reply) continue;
    // 이 답글 앞의 가장 가까운 훅
    const h = [...mine].reverse().find((x) => !x.is_reply && (x.taken_at ?? 0) <= (p.taken_at ?? 0));
    if (h && !hooks.has(h.code)) staleHooks.add(h.code);
  }

  const span = mine.length
    ? `${new Date(mine[0].taken_at * 1000).toISOString().slice(0, 16)} ~ ${new Date(
        mine[mine.length - 1].taken_at * 1000
      ).toISOString().slice(0, 16)}`
    : '—';
  console.log(`${handle}: 프로필에 본인 글 ${mine.length} (${span})`);
  console.log(`   신규 글 ${fresh.length} · 새 체인 ${hooks.size} · 갱신 필요한 기존 체인 ${staleHooks.size}`);

  for (const c of [...hooks, ...staleHooks]) seeds.push(`${handle},${c}`);
  if (i < handles.length - 1) await sleep(4000);
}

fs.writeFileSync(OUT, seeds.join('\n') + (seeds.length ? '\n' : ''));
console.log(`\n시드 ${seeds.length}건 → ${OUT}`);
if (!seeds.length) console.log('신규 없음.');

await browser.close();

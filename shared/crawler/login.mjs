/**
 * 로그인 세션 준비기.
 *
 * 브라우저 창을 띄우고 **사용자가 직접** 로그인할 때까지 기다린다.
 * 로그인이 확인되면 세션이 프로필 디렉토리에 저장되고, 이후 harvest.mjs 가 그걸 재사용한다.
 *
 * 이 스크립트는 아이디·비밀번호를 입력하지도, 읽지도, 저장하지도 않는다.
 * 자격증명은 브라우저와 Threads 사이에서만 오간다.
 *
 * 사용: node login.mjs           (기본 프로필 ./.profile)
 *       node login.mjs --profile ./.profile
 */
import { chromium } from 'playwright';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const PROFILE = arg('profile', './.profile');
const TIMEOUT_MIN = Number(arg('timeout', 10));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('브라우저를 엽니다. 창에서 직접 로그인해 주세요.');
console.log('(이 스크립트는 아이디·비밀번호를 다루지 않습니다)\n');

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  viewport: { width: 1280, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('https://www.threads.com/login', { waitUntil: 'domcontentloaded' });

const deadline = Date.now() + TIMEOUT_MIN * 60000;
let ok = false;

while (Date.now() < deadline) {
  await sleep(3000);

  // 로그인 판정: sessionid 쿠키가 생기고, 프로필에서 로그인 모달이 사라진다
  const cookies = await ctx.cookies();
  const hasSession = cookies.some((c) => c.name === 'sessionid' && c.value);
  if (!hasSession) continue;

  try {
    await page.goto('https://www.threads.com/@beyond.cho', { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    const state = await page.evaluate(() => ({
      modal: !!document.querySelector('[role="dialog"]'),
      height: document.documentElement.scrollHeight,
    }));
    // 로그아웃일 때는 높이가 뷰포트에 고정되고 로그인 모달이 떠 있다
    if (!state.modal && state.height > 1500) {
      ok = true;
      break;
    }
    console.log(`  세션 쿠키는 있으나 아직 피드가 잠겨 있습니다 (모달=${state.modal}, 높이=${state.height})`);
  } catch {
    /* 이동 중 예외는 다음 루프에서 회복 */
  }
}

if (ok) {
  console.log('\n✓ 로그인 확인. 세션이 저장되었습니다:', PROFILE);
  console.log('  이제 harvest.mjs 를 실행할 수 있습니다.');
} else {
  console.log('\n✗ 제한 시간 내에 로그인이 확인되지 않았습니다.');
  console.log('  창을 닫지 말고 로그인을 마친 뒤 다시 실행하거나, --timeout 으로 시간을 늘리세요.');
}

await ctx.close();
process.exit(ok ? 0 : 1);

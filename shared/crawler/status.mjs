/**
 * 트래킹 현황 대시보드.
 *
 * 레지스트리(accounts.json)와 실제 수집물(data_export/)을 조인해서 보여준다.
 * 통계를 레지스트리에 저장하지 않는 이유는 두 곳이 어긋나면 어느 쪽이 맞는지 알 수 없기 때문이다.
 * 레지스트리는 '무엇을 추적할지' 만 갖고, 숫자는 항상 실데이터에서 계산한다.
 *
 * 사용: node status.mjs
 */
import { loadAccounts, loadStats, loadFetchedCodes, loadSeenCodes } from './state.mjs';

const accounts = loadAccounts();
const stats = loadStats();
const fetched = loadFetchedCodes();
const seen = loadSeenCodes();

// 피드에서 봤지만 아직 퍼머링크를 안 연 훅 = 다음에 수집할 것
const pending = new Map();
for (const [code, p] of seen) {
  if (p.is_reply || fetched.has(code)) continue;
  pending.set(p.author, (pending.get(p.author) ?? 0) + 1);
}

const n = (v) => (v == null ? '—' : v.toLocaleString());
const d = (s) => (s ? s.slice(0, 10) : '—');

console.log(`\n트래킹 계정 ${accounts.length}개 · 퍼머링크 수집 총 ${fetched.size.toLocaleString()}건\n`);
console.log(
  '계정'.padEnd(18) +
    '상태'.padEnd(8) +
    '체인'.padStart(7) +
    '글'.padStart(8) +
    '조회수'.padStart(13) +
    '유지율'.padStart(8) +
    '대기'.padStart(7) +
    '  기간'
);
console.log('─'.repeat(96));

for (const a of accounts) {
  const s = stats.get(a.handle);
  const wait = pending.get(a.handle) ?? 0;
  const state = !s ? '미수집' : wait > 0 ? '수집중' : '완료';
  console.log(
    a.handle.padEnd(18) +
      state.padEnd(8) +
      n(s?.chains).padStart(7) +
      n(s?.posts).padStart(8) +
      n(s?.views).padStart(13) +
      n(s?.retention).padStart(8) +
      (wait || '—').toString().padStart(7) +
      `  ${d(s?.oldest)} ~ ${d(s?.newest)}`
  );
}

console.log('\n' + '─'.repeat(96));
console.log('상태  미수집=한 번도 안 받음 · 수집중=피드에서 본 훅이 아직 남음 · 완료=본 것은 다 받음');
console.log('대기  피드에서 발견했지만 퍼머링크를 아직 안 연 훅 수 (다음 fetch 대상)');
console.log('유지율  2번 글 조회수까지 확보해 초반 유지율이 계산된 체인 수');

// 체인에 안 잡힌 독립 글 — 관련 글로 딸려왔을 뿐 수집되지 않은 것
const orphans = [...stats.entries()].filter(([, s]) => s.orphans);
if (orphans.length) {
  console.log('\n⚠️  체인 미소속 독립 글 (딸려왔을 뿐 훅으로 수집 안 된 글):');
  for (const [acct, s] of orphans) console.log(`     ${acct}: ${s.orphans}건`);
  console.log('     → node backfill.mjs 로 시드를 만들어 fetch 하면 채워진다');
}
console.log();

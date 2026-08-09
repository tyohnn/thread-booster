/**
 * 초반 유지율 = 2번 글 조회수 ÷ 1번 글(훅) 조회수.
 *
 * 유튜브의 '초반 30초 이탈률' 에 대응하는 지표다. 훅이 클릭을 만들었어도
 * 2번 글로 넘어가지 않으면 체인 전체가 죽는다 — 이 프로젝트의 원래 목표 지표인데
 * DOM 스크래핑으로는 조회수 자체를 못 구해서 그동안 측정되지 않았다.
 *
 * 사용: node retention.mjs --chains ../../data_export/normalized/chains.json \
 *                          --views ../../data_export/raw/second_beyond_2026-08-08.jsonl
 */
import fs from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const chains = JSON.parse(fs.readFileSync(arg('chains'), 'utf8'));

// 2번 글 조회수: raw JSONL 에서 code -> views
const views = new Map();
for (const line of fs.readFileSync(arg('views'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line);
    if (!r.blocked && r.views != null) views.set(r.code, r.views);
  } catch {
    /* skip */
  }
}

const rows = [];
for (const c of chains) {
  if (c.chain_len < 2 || !c.hook_views) continue;
  const second = views.get(c.member_codes[1]);
  if (second == null) continue;
  rows.push({
    chain_id: c.chain_id,
    hook_views: c.hook_views,
    second_views: second,
    retention: second / c.hook_views,
    hook_like: c.hook_like,
    chain_len: c.chain_len,
    hook: c.hook_text.split('\n')[0].slice(0, 34),
  });
}

if (!rows.length) {
  console.log('매칭된 체인이 없다.');
  process.exit(0);
}

const pct = (r) => (r * 100).toFixed(1) + '%';
const sorted = [...rows].sort((a, b) => a.retention - b.retention);
const median = sorted[Math.floor(sorted.length / 2)].retention;

console.log(`체인 ${rows.length}개 유지율 계산됨\n`);
console.log(`  중앙값 : ${pct(median)}`);
console.log(`  최소   : ${pct(sorted[0].retention)}`);
console.log(`  최대   : ${pct(sorted[sorted.length - 1].retention)}`);
console.log(`  25/75% : ${pct(sorted[Math.floor(rows.length * 0.25)].retention)} / ${pct(sorted[Math.floor(rows.length * 0.75)].retention)}`);

console.log('\n=== 유지율 상위 8 (훅이 본문으로 잘 넘긴 글) ===');
console.table(
  [...sorted].reverse().slice(0, 8).map((r) => ({
    유지율: pct(r.retention),
    훅조회: r.hook_views,
    '2번조회': r.second_views,
    좋아요: r.hook_like,
    훅: r.hook,
  }))
);

console.log('\n=== 유지율 하위 8 (훅은 먹혔는데 본문에서 샌 글) ===');
console.table(
  sorted.slice(0, 8).map((r) => ({
    유지율: pct(r.retention),
    훅조회: r.hook_views,
    '2번조회': r.second_views,
    좋아요: r.hook_like,
    훅: r.hook,
  }))
);

fs.writeFileSync(
  arg('out', '../../data_export/normalized/retention.json'),
  JSON.stringify(rows.sort((a, b) => b.retention - a.retention), null, 2)
);
console.log(`\nretention.json 기록: ${rows.length}행`);

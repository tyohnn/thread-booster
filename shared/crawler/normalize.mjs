/**
 * raw JSONL → 정규화 산출물.
 *
 * 스키마를 세 갈래로 쪼갠다. 같은 글이 7주 만에 좋아요 2.5배가 된 게 관측됐는데
 * 기존 구조는 덮어쓰기라 그 곡선이 안 쌓였다.
 *
 *   posts.json    글의 불변 사실 (code · 작성자 · 작성시각 · 본문 · 체인 소속)
 *   metrics.jsonl 관측 스냅샷 (code + 측정시각 + 카운트). append-only, 재수집할수록 시계열이 쌓인다
 *   chains.json   체인 구조. root_post_author 기반 재구축 — 시간 근접 추론을 쓰지 않는다
 *
 * 사용: node normalize.mjs --raw ../../data_export/raw/*.jsonl --out ../../data_export/normalized
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
// --raw 는 가변 인자다. 다음 플래그가 나오면 거기서 끊는다
// (안 끊으면 --out 의 값까지 raw 파일로 집어삼킨다)
const rawArgs = [];
for (let i = process.argv.indexOf('--raw') + 1; i > 0 && i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--')) break;
  rawArgs.push(process.argv[i]);
}
const OUT = arg('out', '../../data_export/normalized');
if (!rawArgs.length) {
  console.error('사용: node normalize.mjs --raw <file.jsonl ...> [--out dir]');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

const records = [];
for (const f of rawArgs) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      /* 쓰다 만 마지막 줄 */
    }
  }
}
console.log(`raw 레코드 ${records.length} (파일 ${rawArgs.length})`);

const posts = new Map(); // code -> 불변 사실
const metrics = []; // 관측 스냅샷
const chains = new Map(); // chain_id -> 체인 (중복 귀결 병합)

for (const rec of records) {
  if (rec.blocked) continue;
  // feed_*.jsonl 은 발견 기록이라 형태가 다르다 (posts[] 가 아니라 post 하나).
  // 체인·조회수가 없으므로 정규화 대상이 아니다 — 그 코드들은 fetch 를 거쳐 들어온다.
  if (!Array.isArray(rec.posts)) continue;
  const handle = rec.handle;

  for (const p of rec.posts) {
    if (!posts.has(p.code)) {
      posts.set(p.code, {
        code: p.code,
        author: p.author,
        taken_at: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : null,
        text: p.text,
        is_reply: p.is_reply,
        root_author: p.root_author,
        has_image: p.has_image,
        has_video: p.has_video,
        chain_id: null, // 아래에서 채운다
        seq: null,
      });
    }
    metrics.push({
      code: p.code,
      observed_at: rec.fetched_at,
      like: p.like,
      reply: p.reply,
      repost: p.repost,
      quote: p.quote,
      reshare: p.reshare,
      // 조회수는 그 퍼머링크의 주인공 글에만 붙는다
      views: p.code === rec.code ? rec.views : null,
    });
  }

  // --- 체인 재구축 ---
  // 이 페이지의 본인 글 중, 훅(is_reply=false) 이거나 본인 글에 단 답글(root_author=본인) 만 취한다.
  // 남의 답글과 '본인이 남의 글에 단 답글' 은 여기서 걸러진다 — 과거 오염의 원인이었다.
  const mine = rec.posts
    .filter((p) => p.author === handle && (!p.is_reply || p.root_author === handle))
    .sort((a, b) => (a.taken_at ?? 0) - (b.taken_at ?? 0));

  if (!mine.length) continue;

  // 훅은 '요청한 코드' 를 기준으로 잡는다. 퍼머링크 페이지에는 주제가 비슷한
  // 본인의 다른 독립 글이 관련 글로 같이 실려 오는데(5개월 전 글이 붙은 사례 확인),
  // 단순히 '첫 번째 비답글' 을 훅으로 잡으면 그쪽으로 끌려간다.
  const target = mine.find((p) => p.code === rec.code);
  if (!target) continue;
  const hook = target.is_reply
    ? // 요청한 게 체인 중간 글이면, 그 앞의 가장 가까운 독립 글이 훅이다
      [...mine].reverse().find((p) => !p.is_reply && (p.taken_at ?? 0) <= (target.taken_at ?? 0)) ?? target
    : target;

  // 훅 이후의 본인 답글만, **다음 독립 글이 나오기 전까지** 취한다.
  // 이 경계가 없으면 관련 글로 딸려온 다른 체인이 통째로 흡수된다.
  const after = mine.filter((p) => (p.taken_at ?? 0) >= (hook.taken_at ?? 0));
  const members = [hook];
  for (const p of after) {
    if (p.code === hook.code) continue;
    if (!p.is_reply) break; // 다음 독립 글 — 여기서 이 체인은 끝났다
    if (p.root_author !== handle) continue;
    members.push(p);
  }

  members.forEach((p, i) => {
    const rowP = posts.get(p.code);
    if (rowP) {
      rowP.chain_id = hook.code;
      rowP.seq = i + 1;
    }
  });

  const row = {
    chain_id: hook.code,
    account: handle,
    hook_text: hook.text,
    date: hook.taken_at ? new Date(hook.taken_at * 1000).toISOString() : null,
    member_codes: members.map((p) => p.code),
    chain_len: members.length,
    // 조회수는 '요청한 퍼머링크' 의 값이다. 요청한 게 체인 중간 글이었다면
    // 그건 훅 조회수가 아니다 — 여기서 섞으면 유지율이 통째로 틀어진다.
    hook_views: rec.code === hook.code ? rec.views : null,
    hook_like: hook.like,
    total_like: members.reduce((s, p) => s + (p.like ?? 0), 0),
    total_reply: members.reduce((s, p) => s + (p.reply ?? 0), 0),
    total_reshare: members.reduce((s, p) => s + (p.reshare ?? 0), 0),
    source: 'ssr', // 시간 근접 추론이 아니라 root_post_author 로 확정된 것
  };

  // 기존 chains.json 이 한 체인을 둘로 쪼개놓은 경우, 두 훅 코드가 모두 시드에 들어가
  // 같은 체인으로 귀결된다. 멤버가 더 많은 쪽을 남기되 조회수는 유효한 값을 살린다.
  const prev = chains.get(row.chain_id);
  if (!prev) chains.set(row.chain_id, row);
  else {
    const keep = row.chain_len > prev.chain_len ? row : prev;
    keep.hook_views = prev.hook_views ?? row.hook_views;
    chains.set(row.chain_id, keep);
  }
}

const postsArr = [...posts.values()];
fs.writeFileSync(path.join(OUT, 'posts.json'), JSON.stringify(postsArr, null, 2));
const chainsArr = [...chains.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

// --- 정규화 지표 ---
// norm_multiple: 같은 달 중앙값 대비 배수. 계정 성장에 따른 기저 상승을 지운다.
// engagement:    좋아요 ÷ 훅 조회수. 조회수를 몰랐을 땐 계산할 수 없던 지표다.
//                도달이 큰 글은 좋아요도 크다는 편향을 제거하고 '본 사람 중 몇 %가 반응했나' 를 본다.
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const byMonth = new Map();
for (const c of chainsArr) {
  const m = `${c.account}|${(c.date ?? '').slice(0, 7)}`;
  if (!byMonth.has(m)) byMonth.set(m, []);
  byMonth.get(m).push(c.total_like);
}
for (const c of chainsArr) {
  const key = `${c.account}|${(c.date ?? '').slice(0, 7)}`;
  const med = median(byMonth.get(key) ?? []);
  c.month = (c.date ?? '').slice(0, 7);
  c.month_median_like = med;
  c.norm_multiple = med ? Number((c.total_like / med).toFixed(3)) : null;
  c.engagement = c.hook_views ? Number((c.total_like / c.hook_views).toFixed(5)) : null;
}
fs.writeFileSync(path.join(OUT, 'chains.json'), JSON.stringify(chainsArr, null, 2));
// metrics 는 append-only 시계열이다. 다만 같은 raw 를 재정규화하면 같은 관측이
// 다시 쌓이므로 (code, observed_at) 로 기존 것과 중복 제거한다.
const mPath = path.join(OUT, 'metrics.jsonl');
const seen = new Set();
if (fs.existsSync(mPath)) {
  for (const line of fs.readFileSync(mPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      seen.add(`${m.code}|${m.observed_at}`);
    } catch {
      /* skip */
    }
  }
}
const fresh = metrics.filter((m) => !seen.has(`${m.code}|${m.observed_at}`));
if (fresh.length) fs.appendFileSync(mPath, fresh.map((m) => JSON.stringify(m)).join('\n') + '\n');

console.log(`posts ${postsArr.length} · chains ${chainsArr.length} · metrics ${metrics.length}`);

// --- 기존 체인 데이터와 대조 ---
const oldPath = '../../data_export/chains.json';
if (fs.existsSync(oldPath)) {
  const old = new Map(JSON.parse(fs.readFileSync(oldPath, 'utf8')).map((c) => [c.chain_id, c]));
  let same = 0;
  let diff = 0;
  const samples = [];
  for (const c of chainsArr) {
    const o = old.get(c.chain_id);
    if (!o) continue;
    const a = [...c.member_codes].sort().join(',');
    const b = [...o.member_codes].sort().join(',');
    if (a === b) same++;
    else {
      diff++;
      if (samples.length < 8)
        samples.push({ chain: c.chain_id, 기존: o.chain_len, 실제: c.chain_len, 기존like: o.total_like, 실제like: c.total_like });
    }
  }
  console.log(`\n기존 chains.json 과 대조: 일치 ${same} · 불일치 ${diff}`);
  if (samples.length) console.table(samples);
}

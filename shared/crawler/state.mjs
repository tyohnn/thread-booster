/**
 * 수집 상태 계산 — "무엇을 이미 수집했는가" 의 단일 정답.
 *
 * ⚠️ 여기서 가장 중요한 구분:
 *   `posts.json 에 있다` ≠ `수집했다`
 *
 * 퍼머링크 페이지에는 주제가 비슷한 **다른 독립 글이 관련 글로 딸려 온다.** 그 글도
 * posts.json 에 들어가지만 체인도 조회수도 없는 껍데기다. 그런데 발견기가 그걸 '아는 글'
 * 로 판정하면 **영영 시드에 안 들어간다** — 좋아요 2,637짜리 글이 이렇게 누락돼 있었다
 * (2026-08-08, 사용자가 공유 링크를 던져줘서 발견).
 *
 * 그래서 판정 기준은 posts.json 이 아니라 **raw 에 요청 코드(rec.code)로 남았는가** 다.
 * 그것만이 '이 글의 퍼머링크를 실제로 열었다' 는 증거다.
 */
import fs from 'node:fs';
import path from 'node:path';

/** 퍼머링크를 실제로 연 코드 집합. feed_*.jsonl 은 발견 기록이라 제외한다. */
export function loadFetchedCodes(rawDir = '../../data_export/raw') {
  const set = new Set();
  if (!fs.existsSync(rawDir)) return set;
  for (const fn of fs.readdirSync(rawDir)) {
    if (!fn.endsWith('.jsonl')) continue;
    if (fn.startsWith('feed_')) continue; // 피드 하베스트는 '열어본 것' 이 아니다
    for (const line of fs.readFileSync(path.join(rawDir, fn), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (!r.blocked && r.code) set.add(r.code);
      } catch {
        /* 쓰다 만 줄 */
      }
    }
  }
  return set;
}

/** 피드 하베스트로 '존재를 확인한' 코드 (열어보진 않았을 수 있다). */
export function loadSeenCodes(rawDir = '../../data_export/raw') {
  const seen = new Map(); // code -> post
  if (!fs.existsSync(rawDir)) return seen;
  for (const fn of fs.readdirSync(rawDir)) {
    if (!fn.startsWith('feed_') || !fn.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(rawDir, fn), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.post) seen.set(r.code, r.post);
      } catch {
        /* skip */
      }
    }
  }
  return seen;
}

export function loadAccounts(file = './accounts.json') {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return j.accounts.filter((a) => a.status !== 'removed');
}

/** 정규화 산출물에서 계정별 통계를 뽑는다. 레지스트리에 통계를 중복 저장하지 않기 위해서다. */
export function loadStats(normDir = '../../data_export/normalized') {
  const out = new Map();
  const cf = path.join(normDir, 'chains.json');
  const pf = path.join(normDir, 'posts.json');
  if (!fs.existsSync(cf)) return out;

  const chains = JSON.parse(fs.readFileSync(cf, 'utf8'));
  const posts = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : [];
  const retFile = path.join(normDir, 'retention.json');
  const ret = fs.existsSync(retFile) ? JSON.parse(fs.readFileSync(retFile, 'utf8')) : [];
  const chainAcct = new Map(chains.map((c) => [c.chain_id, c.account]));

  for (const c of chains) {
    const s = out.get(c.account) ?? { chains: 0, posts: 0, views: 0, withViews: 0, retention: 0, newest: null, oldest: null };
    s.chains++;
    s.posts += c.chain_len;
    if (c.hook_views) {
      s.views += c.hook_views;
      s.withViews++;
    }
    if (c.date) {
      if (!s.newest || c.date > s.newest) s.newest = c.date;
      if (!s.oldest || c.date < s.oldest) s.oldest = c.date;
    }
    out.set(c.account, s);
  }
  for (const r of ret) {
    const a = chainAcct.get(r.chain_id);
    if (a && out.has(a)) out.get(a).retention++;
  }
  // 체인에 안 잡힌 글(딸려온 글) 수 — 누락 후보 파악용
  for (const p of posts) {
    const s = out.get(p.author);
    if (s && !p.chain_id && !p.is_reply) s.orphans = (s.orphans ?? 0) + 1;
  }
  return out;
}
